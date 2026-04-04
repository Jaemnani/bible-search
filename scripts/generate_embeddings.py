#!/usr/bin/env python3
"""
임베딩 생성 스크립트 (Gemini text-embedding-004)
────────────────────────────────────────────────
bible.json → embeddings_dense.bin (Int8 양자화, 256차원)

Vercel 완전 호환: 쿼리 임베딩도 같은 Gemini API 사용 → 벡터 공간 일치

실행:
  python3 scripts/generate_embeddings.py

필요:
  - .env.local 에 GEMINI_API_KEY=xxx
  - pip install numpy (또는 .venv/bin/pip)
"""

import json
import os
import struct
import time
import urllib.request
import urllib.error
import numpy as np
from pathlib import Path

# ─── 티어 선택 ───────────────────────────────────────────
# True  = 유료(과금 활성화) : RPD 무제한, ~1000 RPM → 약 1분
# False = 무료             : 100 RPD, 5 RPM        → 약 4일
PAID_TIER = True
# ─────────────────────────────────────────────────────────

# ─── 설정 (티어에 따라 자동 결정) ────────────────────────
BATCH_SIZE       = 100                        # batchEmbedContents 최대 100개
DENSE_DIM        = 512                        # outputDimensionality
CHECKPOINT_EVERY = 10                         # N배치(=1000구절)마다 중간 저장
REQ_INTERVAL     = 0.2 if PAID_TIER else 13.0 # 유료: ~5 req/s / 무료: ~4 req/min
# ─────────────────────────────────────────────────────────


def load_api_key(root: Path) -> str:
    """`.env.local`에서 GEMINI_API_KEY 읽기"""
    env = root / ".env.local"
    if not env.exists():
        raise FileNotFoundError(f"{env} 가 없습니다.")
    for line in env.read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise ValueError("GEMINI_API_KEY 항목을 .env.local에서 찾을 수 없습니다.")


def gemini_batch_embed(texts: list, api_key: str, retries: int = 6) -> list:
    """
    Gemini gemini-embedding-001 batchEmbedContents 호출
    반환: [[256 floats], [256 floats], ...]
    """
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-embedding-001:batchEmbedContents?key={api_key}"
    )
    body = json.dumps({
        "requests": [
            {
                "model": "models/gemini-embedding-001",
                "content": {"parts": [{"text": t}]},
                "outputDimensionality": DENSE_DIM,
                "taskType": "RETRIEVAL_DOCUMENT",
            }
            for t in texts
        ]
    }).encode("utf-8")

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            return [emb["values"] for emb in data["embeddings"]]
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            if e.code == 429:
                wait = 15 * (2 ** attempt)  # 15→30→60→120→240→480초
                is_daily = "RESOURCE_EXHAUSTED" in err_body or "quota" in err_body.lower()
                if is_daily:
                    print(f"\n  ⛔ 일일 할당량 초과. 체크포인트 저장 후 종료합니다.")
                    raise RuntimeError("일일 API 할당량 초과")
                print(f"  ⏳ 속도 제한 (429) → {wait}초 대기 후 재시도 ({attempt+1}/{retries})...")
                time.sleep(wait)
            else:
                print(f"  ❌ HTTP {e.code}: {err_body}")
                raise
        except RuntimeError:
            raise
        except Exception as e:
            print(f"  ❌ 오류 (시도 {attempt+1}/{retries}): {e}")
            if attempt == retries - 1:
                raise
            time.sleep(5 * (attempt + 1))

    raise RuntimeError(f"재시도 {retries}회 모두 실패. REQ_INTERVAL을 늘려주세요.")


def quantize_to_int8(vectors: np.ndarray):
    """Float32 → Int8 양자화 (전역 min/max 기준)"""
    vmin  = float(vectors.min())
    vmax  = float(vectors.max())
    scale = (vmax - vmin) / 255.0
    q = np.clip(
        np.round((vectors - vmin) / scale), 0, 255
    ).astype(np.uint8)
    return q, vmin, scale


def save_dense_bin(q: np.ndarray, vmin: float, scale: float,
                   path: str, n: int, dim: int):
    """
    바이너리 포맷 (route.ts 와 동일해야 함):
      [total:4B] [dim:4B] [vmin:8B] [scale:8B] [data:n×dim×1B]
    """
    with open(path, "wb") as f:
        f.write(struct.pack("<I", n))
        f.write(struct.pack("<I", dim))
        f.write(struct.pack("<d", vmin))
        f.write(struct.pack("<d", scale))
        f.write(q.tobytes())
    mb = os.path.getsize(path) / 1024 / 1024
    print(f"  💾 Dense 저장: {path} ({mb:.1f}MB)")


def main():
    root         = Path(__file__).parent.parent
    bible_path   = root / "public" / "data" / "bible.json"
    out_dir      = root / "public" / "data"
    dense_path   = out_dir / "embeddings_dense.bin"
    prog_path    = out_dir / "embed_progress_gemini.json"

    if not bible_path.exists():
        print("❌ bible.json 없음. parse_bible.py를 먼저 실행하세요.")
        return

    api_key = load_api_key(root)

    # 성경 데이터 로드
    with open(bible_path, encoding="utf-8") as f:
        bible = json.load(f)
    total  = len(bible)
    texts  = [item["embed_text"] for item in bible]

    tier_label = "유료 (과금 활성화)" if PAID_TIER else "무료 (100 RPD)"
    eta_min    = (((total // BATCH_SIZE) + 1) * REQ_INTERVAL) / 60
    print("=" * 55)
    print("  Gemini gemini-embedding-001 임베딩 생성 (배치 모드)")
    print(f"  티어: {tier_label}")
    print(f"  총 구절: {total:,}개  |  배치: {BATCH_SIZE}개/요청  |  예상: ~{eta_min:.0f}분")
    print("=" * 55)

    # 체크포인트 로드
    start_idx  = 0
    all_dense  = []

    if prog_path.exists():
        with open(prog_path) as f:
            prog = json.load(f)
        start_idx = prog.get("processed", 0)
        print(f"⏩ 이전 진행률 발견: {start_idx}/{total} 재개")
        if dense_path.exists() and start_idx > 0:
            # 기존 벡터 복원 (역양자화)
            with open(dense_path, "rb") as f:
                n_saved = struct.unpack("<I", f.read(4))[0]
                d_saved = struct.unpack("<I", f.read(4))[0]
                vm      = struct.unpack("<d", f.read(8))[0]
                sc      = struct.unpack("<d", f.read(8))[0]
                q_prev  = np.frombuffer(f.read(), dtype=np.uint8).reshape(n_saved, d_saved)
                prev    = q_prev.astype(np.float32) * sc + vm
                all_dense = list(prev)
            print(f"  기존 {n_saved:,}개 Dense 벡터 복원 완료")

    # 배치 처리
    n_batches   = (total - start_idx + BATCH_SIZE - 1) // BATCH_SIZE
    batch_count = 0
    t0          = time.time()

    print(f"\n[임베딩 생성 시작] {start_idx} → {total}")
    for i in range(start_idx, total, BATCH_SIZE):
        batch   = texts[i : i + BATCH_SIZE]
        end_idx = min(i + BATCH_SIZE, total)

        try:
            vecs = gemini_batch_embed(batch, api_key)
        except RuntimeError as e:
            print(f"\n  💾 중단 전 진행분 저장 중... ({len(all_dense):,}개)")
            if all_dense:
                arr = np.array(all_dense, dtype=np.float32)
                q, vmin, scale = quantize_to_int8(arr)
                save_dense_bin(q, vmin, scale, str(dense_path), len(all_dense), DENSE_DIM)
                with open(prog_path, "w") as f:
                    json.dump({"processed": i}, f)
            print(f"  ⛔ 종료: {e}")
            return
        all_dense.extend(vecs)

        batch_count += 1
        elapsed = time.time() - t0
        pct     = end_idx / total * 100
        eta_s   = (elapsed / batch_count) * (n_batches - batch_count)

        print(f"  {end_idx:,}/{total:,} ({pct:.1f}%)  "
              f"경과: {elapsed/60:.1f}분  남은시간: {eta_s/60:.1f}분")

        if batch_count % CHECKPOINT_EVERY == 0 or end_idx == total:
            arr = np.array(all_dense, dtype=np.float32)
            q, vmin, scale = quantize_to_int8(arr)
            save_dense_bin(q, vmin, scale, str(dense_path), len(all_dense), DENSE_DIM)
            with open(prog_path, "w") as f:
                json.dump({"processed": end_idx}, f)

        if end_idx < total:
            time.sleep(REQ_INTERVAL)

    # 완료 처리
    arr = np.array(all_dense, dtype=np.float32)
    q, vmin, scale = quantize_to_int8(arr)
    save_dense_bin(q, vmin, scale, str(dense_path), total, DENSE_DIM)

    if prog_path.exists():
        prog_path.unlink()

    total_mb = os.path.getsize(dense_path) / 1024 / 1024
    print("\n" + "=" * 55)
    print("✅ 임베딩 생성 완료!")
    print(f"   Dense:  embeddings_dense.bin → {total_mb:.1f}MB")
    print(f"   총 소요: {(time.time()-t0)/60:.1f}분")
    print("=" * 55)


if __name__ == "__main__":
    main()
