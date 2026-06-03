#!/usr/bin/env python3
"""
임베딩 생성 스크립트 (Gemini gemini-embedding-001, 512차원)
────────────────────────────────────────────────
- verse 임베딩 : bible.json → embeddings_dense.bin (Int8 양자화)
- passage 임베딩: passages.json → embeddings_passages.bin (동일 포맷)

Vercel 완전 호환: 쿼리 임베딩도 같은 Gemini API 사용 → 벡터 공간 일치

실행:
  # verse 임베딩 (기본) — 태그 노이즈 제거한 ko+en 클린 입력
  python3 scripts/generate_embeddings.py
  python3 scripts/generate_embeddings.py --target verse --input-mode clean
  python3 scripts/generate_embeddings.py --target verse --out embeddings_dense_clean.bin  # 사이드 파일

  # passage 임베딩 (theme_title + core_meaning + 절 ko)
  python3 scripts/generate_embeddings.py --target passage

필요:
  - .env.local 에 GEMINI_API_KEY=xxx
  - pip install numpy (또는 .venv/bin/pip)
"""

import argparse
import json
import os
import re
import struct
import time
import urllib.request
import urllib.error
import numpy as np
from pathlib import Path


def classify_429(err_body: str):
    """429 분류 → ('daily', 0) | ('rate', retry_delay_seconds).
    Gemini 의 모든 429 는 RESOURCE_EXHAUSTED 를 담으므로 PerDay/PerMinute 로 구분한다."""
    nb = err_body.lower().replace(" ", "")
    if "perday" in nb or "daily" in nb:
        return ("daily", 0.0)
    m = re.search(r'"retrydelay"\s*:\s*"(\d+(?:\.\d+)?)s"', err_body.lower())
    return ("rate", float(m.group(1)) if m else 0.0)

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
    반환: [[512 floats], [512 floats], ...]
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
            if e.code in (400, 401, 403) and (
                "API_KEY_INVALID" in err_body or "API key" in err_body
                or "PERMISSION_DENIED" in err_body or "expired" in err_body.lower()
            ):
                raise RuntimeError("API 키가 만료되었거나 무효입니다. .env.local 의 GEMINI_API_KEY 를 갱신하세요.")
            if e.code == 429:
                kind, rd = classify_429(err_body)
                if kind == "daily":
                    print("\n  ⛔ 일일 할당량 초과. 체크포인트 저장 후 종료합니다.")
                    raise RuntimeError("일일 API 할당량 초과")
                # 분당(RPM/TPM) 제한 — retryDelay 만큼(없으면 지수백오프) 기다렸다 재시도
                wait = rd if rd > 0 else 15 * (2 ** attempt)
                if attempt == retries - 1:
                    raise RuntimeError("속도 제한(429) 재시도 한도 초과 — 잠시 후 다시 실행하면 체크포인트부터 이어집니다.")
                print(f"  ⏳ 분당 속도제한 (429) → {wait:.0f}초 대기 후 재시도 ({attempt+1}/{retries})...")
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


def save_f32_sidecar(arr: np.ndarray, path: str):
    """float32 원본 사이드카: [total:4B][dim:4B][float32 data].
    양자화 방식 재실험(차원별/fp16/퍼센타일) 시 Gemini 재호출 없이 여기서 재생성."""
    n, dim = arr.shape
    with open(path, "wb") as f:
        f.write(struct.pack("<I", int(n)))
        f.write(struct.pack("<I", int(dim)))
        f.write(np.ascontiguousarray(arr, dtype=np.float32).tobytes())


def load_f32_sidecar(path: str):
    """반환: (rows, dim) float32 또는 None (무손실 resume·재양자화용)"""
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        n = struct.unpack("<I", f.read(4))[0]
        dim = struct.unpack("<I", f.read(4))[0]
        data = np.frombuffer(f.read(), dtype=np.float32)
    rows = len(data) // dim if dim else 0
    return data[: rows * dim].reshape(rows, dim) if rows else None


def build_verse_inputs(bible: list, input_mode: str) -> list:
    """
    verse 임베딩 입력 텍스트.
      - clean  : ko + en 만 (책마다 동일한 '| 태그:' 꼬리 제거 → 책 내부 변별력↑)
      - tagged : 기존 embed_text (ko + en + 태그) 그대로
    """
    if input_mode == "tagged":
        return [item.get("embed_text", "") for item in bible]
    out = []
    for v in bible:
        ko = (v.get("ko") or "").strip()
        en = (v.get("en") or "").strip()
        out.append(f"{ko} {en}".strip())
    return out


def build_passage_inputs(passages: list, bible: list) -> list:
    """
    passage 임베딩 입력 텍스트: "{theme_title}. {core_meaning} {절들의 ko}"
    주제·의미를 앞에 둬 단락의 토픽을 포착. 행 순서 = passages.json 배열 순서.
    """
    ko_by_key = {v["key"]: (v.get("ko") or "") for v in bible}
    out = []
    for p in passages:
        ko_join = " ".join(
            ko_by_key.get(k, "") for k in p.get("verse_keys", [])
        ).strip()
        title = (p.get("theme_title") or "").strip()
        meaning = (p.get("core_meaning") or "").strip()
        out.append(f"{title}. {meaning} {ko_join}".strip())
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=["verse", "passage"], default="verse",
                        help="임베딩 대상 (verse=bible.json / passage=passages.json)")
    parser.add_argument("--input-mode", choices=["clean", "tagged"], default="clean",
                        help="verse 입력: clean=ko+en / tagged=embed_text (passage엔 무영향)")
    parser.add_argument("--out", type=str, default=None,
                        help="출력 파일명 override (예: embeddings_dense_clean.bin 사이드 생성)")
    args = parser.parse_args()

    root         = Path(__file__).parent.parent
    bible_path   = root / "public" / "data" / "bible.json"
    out_dir      = root / "public" / "data"

    if not bible_path.exists():
        print("❌ bible.json 없음. parse_bible.py를 먼저 실행하세요.")
        return

    api_key = load_api_key(root)

    # 성경 데이터 로드
    with open(bible_path, encoding="utf-8") as f:
        bible = json.load(f)

    if args.target == "passage":
        passages_path = out_dir / "passages.json"
        if not passages_path.exists():
            print("❌ passages.json 없음. generate_passages.py를 먼저 실행하세요.")
            return
        with open(passages_path, encoding="utf-8") as f:
            passages = json.load(f)
        texts      = build_passage_inputs(passages, bible)
        out_name   = args.out or "embeddings_passages.bin"
        prog_name  = "embed_progress_passage.json"
    else:
        texts      = build_verse_inputs(bible, args.input_mode)
        out_name   = args.out or "embeddings_dense.bin"
        prog_name  = "embed_progress_verse.json"

    total      = len(texts)
    dense_path = out_dir / out_name
    prog_path  = out_dir / prog_name
    # float32 사이드카(배포 번들 밖, gitignore) — 양자화 재실험·무손실 resume용
    f32_dir    = root / "embeddings_src"
    f32_dir.mkdir(exist_ok=True)
    f32_path   = f32_dir / (out_name + ".f32")
    print(f"  대상: {args.target}  |  입력모드: {args.input_mode if args.target=='verse' else '-'}  |  출력: {out_name}")

    tier_label = "유료 (과금 활성화)" if PAID_TIER else "무료 (100 RPD)"
    eta_min    = (((total // BATCH_SIZE) + 1) * REQ_INTERVAL) / 60
    print("=" * 55)
    print("  Gemini gemini-embedding-001 임베딩 생성 (배치 모드)")
    print(f"  티어: {tier_label}")
    print(f"  총 구절: {total:,}개  |  배치: {BATCH_SIZE}개/요청  |  예상: ~{eta_min:.0f}분")
    print("=" * 55)

    # 체크포인트 로드 — 헤더/processed 를 믿지 않고 "실제 저장된 바이트 수"로 복원.
    # (출력 파일이 mv/삭제됐거나 헤더가 어긋나면 구멍 없이 처음부터 재생성)
    start_idx  = 0
    all_dense  = []

    if prog_path.exists():
        with open(prog_path) as f:
            claimed = json.load(f).get("processed", 0)
        # 1순위: 무손실 f32 사이드카에서 복원
        f32_prev = load_f32_sidecar(str(f32_path)) if claimed > 0 else None
        if f32_prev is not None and f32_prev.shape[1] == DENSE_DIM:
            all_dense = list(f32_prev)
            start_idx = f32_prev.shape[0]
            print(f"⏩ f32 사이드카 무손실 복원: {start_idx:,}/{total} 재개 (기록상 {claimed})")
        elif dense_path.exists() and claimed > 0:
            # 2순위: int8 .bin (역양자화 손실) — 실제 바이트 기준 행 수로 복원
            with open(dense_path, "rb") as f:
                _n      = struct.unpack("<I", f.read(4))[0]
                d_saved = struct.unpack("<I", f.read(4))[0]
                vm      = struct.unpack("<d", f.read(8))[0]
                sc      = struct.unpack("<d", f.read(8))[0]
                raw     = f.read()
            rows = len(raw) // d_saved if d_saved else 0
            if rows > 0 and d_saved == DENSE_DIM:
                q_prev = np.frombuffer(raw[: rows * d_saved], dtype=np.uint8).reshape(rows, d_saved)
                all_dense = list(q_prev.astype(np.float32) * sc + vm)
                start_idx = rows                            # 복원된 실제 개수부터 이어서 (구멍 방지)
                print(f"⏩ int8 체크포인트 복원: {rows:,}/{total} 재개 (기록상 {claimed})")
        if not all_dense:
            print("⚠ 체크포인트 복원 실패(출력 파일 없음/불일치) — 처음부터 재생성합니다.")
            start_idx = 0

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
                save_f32_sidecar(arr, str(f32_path))
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
            save_f32_sidecar(arr, str(f32_path))
            with open(prog_path, "w") as f:
                json.dump({"processed": end_idx}, f)

        if end_idx < total:
            time.sleep(REQ_INTERVAL)

    # 완료 처리 — 헤더는 항상 실제 생성된 개수로 기록 (total 로 거짓 기록 금지)
    arr = np.array(all_dense, dtype=np.float32)
    q, vmin, scale = quantize_to_int8(arr)
    save_dense_bin(q, vmin, scale, str(dense_path), len(all_dense), DENSE_DIM)
    save_f32_sidecar(arr, str(f32_path))
    if len(all_dense) != total:
        print(f"  ⚠ 경고: 생성 {len(all_dense):,} ≠ 전체 {total:,} — 불완전(프로그파일 유지, 재실행 시 이어서)")
    else:
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
