#!/usr/bin/env python3
"""
로컬 BGE-M3 임베딩 서버
─────────────────────────────────────────────
포트 8001에서 Dense + Sparse 쿼리 벡터를 동시에 반환합니다.

실행:
  ./.venv/bin/python scripts/embed_server.py

환경변수 (선택):
  EMBED_PORT  - 포트 번호 (기본 8001)
  DENSE_DIM   - Dense 차원 (기본 256, generate_embeddings.py와 반드시 일치)
"""

import os
import json
from flask import Flask, request, jsonify

# ─── 설정 ──────────────────────────────────
PORT      = int(os.environ.get("EMBED_PORT", 8001))
DENSE_DIM = int(os.environ.get("DENSE_DIM",  256))

# ─── 모델 (전역, 한 번만 로드) ──────────────
model = None

def get_model():
    global model
    if model is not None:
        return model
    try:
        from FlagEmbedding import BGEM3FlagModel
    except ImportError:
        raise RuntimeError("FlagEmbedding 미설치: ./.venv/bin/pip install FlagEmbedding")

    print("[embed_server] BGE-M3 모델 로딩 중... (최초 실행 시 수 초 소요)")
    model = BGEM3FlagModel(
        "BAAI/bge-m3",
        use_fp16=True,
        device="mps",   # Apple Silicon MPS; GPU 없으면 자동 cpu fallback
    )
    print("[embed_server] ✅ 모델 로딩 완료")
    return model

# ─── Flask 앱 ───────────────────────────────
app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": "BAAI/bge-m3", "dense_dim": DENSE_DIM})

@app.route("/embed", methods=["POST"])
def embed():
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    dim  = int(data.get("dim", DENSE_DIM))

    if not text:
        return jsonify({"error": "text is required"}), 400

    m      = get_model()
    result = m.encode(
        [text],
        batch_size=1,
        max_length=512,
        return_dense=True,
        return_sparse=True,
        return_colbert_vecs=False,
    )

    # Dense: 256차원으로 슬라이스
    dense = result["dense_vecs"][0][:dim].tolist()

    # Sparse: BGE 토큰 ID → weight (임계값 0.01 이하 제거)
    sparse = {
        str(k): round(float(v), 4)
        for k, v in result["lexical_weights"][0].items()
        if float(v) > 0.01
    }

    return jsonify({"dense": dense, "sparse": sparse})

# ─── 진입점 ────────────────────────────────
if __name__ == "__main__":
    get_model()   # 서버 시작 전 미리 모델 로딩
    print(f"[embed_server] 🚀 http://127.0.0.1:{PORT} 에서 실행 중")
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=False)
