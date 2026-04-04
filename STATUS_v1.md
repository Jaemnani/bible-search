# 📖 Bible Search — 현재 상태 스냅샷

> 작성일: 2026-04-03  
> 개선 작업 전 기준 상태 기록

---

## 1. 프로젝트 개요

한국어 성경 구절 시맨틱 검색 서비스 (완전 무료 스택).  
감정·주제 기반 자유 검색으로 관련 성경 말씀을 추천한다.

---

## 2. 기술 스택

| 구분 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16 (App Router, TypeScript) | Vercel 배포 예정 |
| 스타일 | Vanilla CSS (커스텀 디자인 시스템) | Tailwind 미사용 |
| 폰트 | Noto Sans KR + Cinzel (Google Fonts) | |
| 임베딩 모델 | BAAI/bge-m3 (로컬, 1회 실행) | 570M params, MPS 가속 |
| 벡터 DB | 정적 파일 (`.bin` + `.json`) | Vercel 50MB 이내 |
| 검색 방식 | BM25(희소) + Cosine(밀집) 하이브리드 | RRF 합산 |
| 쿼리 임베딩 | HuggingFace Inference API (무료) | `HF_TOKEN` 필요 |
| 외부 LLM | 미사용 (해설 기능 제거됨) | |
| 호스팅 | Vercel 무료 플랜 | |

---

## 3. 파일 구조

```
bible-search/
├── datas/
│   ├── BIBLE_ENGLISH_NewInternationalVersion.txt   # 원본 NIV
│   └── BIBLE_KOREAN_RevisedTranslation.txt         # 원본 개역개정
│
├── scripts/
│   ├── parse_bible.py           # 성경 파싱 → public/data/bible.json
│   └── generate_embeddings.py  # BGE-M3 임베딩 생성 (1회 실행)
│
├── public/
│   └── data/
│       ├── bible.json               # ✅ 파싱 완료 (18.3MB, 30,944구절)
│       ├── embeddings_dense.bin     # ❌ 미생성 (FlagEmbedding 미설치)
│       └── embeddings_sparse.json   # ❌ 미생성
│
├── src/
│   └── app/
│       ├── layout.tsx           # 루트 레이아웃, 메타데이터
│       ├── globals.css          # 전체 CSS 디자인 시스템
│       ├── page.tsx             # 메인 검색 UI
│       └── api/
│           └── search/
│               └── route.ts    # 검색 API (하이브리드 검색 로직)
│
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.local                  # HF_TOKEN (미설정 시 키워드 검색 폴백)
```

---

## 4. 데이터 현황

### 파싱 결과 (`bible.json`)
| 항목 | 수치 |
|---|---|
| 총 구절 수 | 30,944개 |
| 한/영 모두 매핑 | 30,725개 |
| 한국어만 | 219개 |
| 파일 크기 | 18.3MB |

### 구절 데이터 구조
```json
{
  "id": 0,
  "key": "Genesis:1:1",
  "book_en": "Genesis",
  "book_ko": "창세기",
  "chapter": 1,
  "verse": 1,
  "testament": "OT",
  "genre": "모세오경",
  "ko": "태초에 하나님이 천지를 창조하시니라",
  "en": "In the beginning God created the heavens and the earth.",
  "embed_text": "[창세기 1:1] [모세오경] [OT] 태초에 하나님이 천지를 창조하시니라"
}
```

### 임베딩 현황
- **Dense**: ❌ 미생성 (BGE-M3 로컬 실행 필요)
- **Sparse**: ❌ 미생성
- 현재 검색은 **BM25 텍스트 폴백 모드**로만 동작 중

---

## 5. 검색 파이프라인 (현재)

```
사용자 쿼리
    │
    ├─ [Dense] HF API → BGE-M3 쿼리 임베딩 (HF_TOKEN 없으면 스킵)
    │                   → Cosine Similarity (embeddings_dense.bin)
    │
    └─ [Sparse] 텍스트 n-gram 분해
                → 직접 문자열 매칭 / sparse 벡터 내적
                (embeddings_sparse.json 없으면 단순 문자열 포함 검색)
    │
    └─ RRF (Reciprocal Rank Fusion) 합산 → 상위 5개 → 문맥 확장(±2절)
```

**현재 활성화된 검색:** 키워드(BM25 폴백) 전용

---

## 6. UI 현황

- **디자인**: "Divine Dark" 테마 — 네이비 별빛 배경, 골드 글라스모피즘 카드
- **기능**:
  - [x] 자유 텍스트 검색창
  - [x] 10개 감정/주제 태그 칩 (빠른 검색)
  - [x] 구절 카드 (책이름, 장절, 신/구약 배지, 장르 배지)
  - [x] NIV 영어 토글
  - [x] 앞뒤 문맥 확장 (±2절)
  - [x] 로딩 스피너 / 에러 상태
  - [x] 위치: `http://localhost:3000` (개발 서버 실행 중)

---

## 7. 확인된 문제점 및 개선 예정 사항

### 문제 1: embed_text 형식이 감정 검색에 부적합
- **현재**: `[창세기 1:1] [모세오경] [OT] 태초에 하나님이...`
- **문제**: 메타데이터 prefix가 감정 벡터를 희석시켜 감정 쿼리와의 의미 거리가 멀어짐
- **개선안**: `{ko_text} {en_text}` — 순수 본문만 임베딩, 한/영 병합

### 문제 2: 한국어만 임베딩
- **현재**: 한글 본문만 embed_text에 포함
- **개선안**: 한글 + NIV 영어 병합 → BGE-M3의 다국어 의미 공간 풍부화

### 문제 3: 감정 언어 ↔ 성경 언어 도메인 갭
- **현재**: "너무 힘들어요" → 단순 키워드/벡터 검색
- **문제**: 사용자의 감정 표현과 성경 본문 언어 스타일이 달라 관련 구절 누락
- **개선안**: Gemini API로 **쿼리 확장** (감정어 → 성경 관련 표현으로 변환 후 검색)

---

## 8. 다음 작업 (개선 예정)

- [ ] `embed_text` 형식 변경 → `parse_bible.py` 수정 후 재파싱
- [ ] `generate_embeddings.py` 실행 (FlagEmbedding 설치 후)
- [ ] `search/route.ts`에 Gemini 쿼리 확장 로직 추가
- [ ] `.env.local`에 Gemini API 키 + HF 토큰 추가
- [ ] Vercel 배포 테스트

---

## 9. 환경 설정 메모

```bash
# Node.js
node --version   # v25.9.0 (Homebrew 설치)
npm --version    # 11.12.1

# Python
python3 --version  # 3.9.6

# 개발 서버
npm run dev  # http://localhost:3000

# 임베딩 생성 (미실행)
pip3 install FlagEmbedding numpy
python3 scripts/generate_embeddings.py
```

```
# .env.local (필요한 키)
HF_TOKEN=hf_xxxx           # HuggingFace 무료 토큰 (쿼리 임베딩)
GEMINI_API_KEY=xxxx        # Google AI Studio 무료 (쿼리 확장용, 개선 후)
```
