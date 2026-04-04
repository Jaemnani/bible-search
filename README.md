# 📖 Bible Search

감정·주제 기반 성경 구절 시맨틱 검색 서비스.
"외로워요", "두려워요" 같은 일상적인 감정 표현으로 관련 성경 말씀을 추천받을 수 있습니다.

## 기술 스택

| 구분 | 선택 |
|---|---|
| 프레임워크 | Next.js (App Router, TypeScript) |
| 임베딩 모델 | `gemini-embedding-001` (256차원, 오프라인 생성) |
| 벡터 DB | 정적 파일 (`embeddings_dense.bin` · `bible.json`) |
| 검색 방식 | BM25(희소) + Cosine(밀집) 하이브리드 → RRF 합산 |
| 쿼리 확장 | Gemini 2.5 Flash Lite (감정어 → 성경 키워드 변환) |
| 리랭킹 | Gemini 2.5 Flash Lite |
| 호스팅 | Vercel |

## 검색 파이프라인

```
사용자 쿼리
    │
    ├─ [병렬] Gemini 쿼리 확장 → 감정 분석 + 성경 키워드 추출
    │         Gemini 임베딩   → 쿼리 벡터 (256차원)
    │
    ├─ Hybrid Search
    │   ├─ Dense  : Cosine Similarity (embeddings_dense.bin)
    │   └─ Sparse : BM25 n-gram 텍스트 매칭
    │   └─ RRF 합산 → 상위 15개 후보
    │
    └─ Gemini 리랭킹 → 상위 5개 + 앞뒤 문맥(±2절)
```

## 데이터

| 항목 | 수치 |
|---|---|
| 총 구절 수 | 30,944개 |
| 언어 | 한국어(개역개정) + 영어(NIV) |
| Dense 임베딩 | `gemini-embedding-001` · 256차원 · uint8 양자화 |
| 파일 크기 | `bible.json` 23MB + `embeddings_dense.bin` 7.6MB |

## 개발 환경 설정

```bash
npm install
```

`.env.local` 생성:
```
GEMINI_API_KEY=your_key_here
```

```bash
npm run dev   # http://localhost:3000
```

## 임베딩 재생성 (필요 시)

```bash
# Python 의존성
pip install numpy

# 생성 (유료 API 키 필요, 약 1분 소요)
python3 scripts/generate_embeddings.py
```

`scripts/generate_embeddings.py` 상단의 `PAID_TIER` 플래그로 무료/유료 티어 전환 가능.

## Vercel 배포

Vercel 대시보드 → Settings → Environment Variables:
```
GEMINI_API_KEY=your_key_here
```