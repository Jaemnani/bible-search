# 📖 Bible Search

감정·주제 기반 성경 구절 시맨틱 검색 서비스.
"외로워요", "두려워요" 같은 일상적인 감정 표현으로 관련 성경 말씀을 추천받을 수 있습니다.

## 기술 스택

| 구분 | 선택 |
|---|---|
| 프레임워크 | Next.js (App Router, TypeScript) |
| 임베딩 모델 | `gemini-embedding-001` (512차원, 오프라인 생성) |
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
    │         Gemini 임베딩   → 쿼리 벡터 (512차원)
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
| Dense 임베딩 | `gemini-embedding-001` · 512차원 · uint8 양자화 |
| 파일 크기 | `bible.json` 23MB + `embeddings_dense.bin` 15MB |

## 랜덤 구절 추천

홈 화면의 `랜덤 추천` 버튼은 사전 생성된 단락(`public/data/passages.json`) 중 하나를
무작위로 보여줍니다. 각 단락은 다음 정보를 포함합니다:

- 범위 (예: `요한복음 3:14-21`) 와 본문 절들
- 단락의 **특징** (literary/narrative characteristics)
- 단락의 **핵심 의미**
- "사용함" 토글 — 한 번 본 단락은 자동 제외, 모두 사용 시 자동 초기화

### 사용 기록 저장

| 상태 | 저장 위치 |
|---|---|
| 익명 | 브라우저 `localStorage` (`bible.used_passages`) |
| 로그인 | Supabase `used_passages` 테이블 (디바이스 동기화) |

로그인 시 익명 시절 localStorage 기록이 자동으로 Postgres 로 마이그레이션됩니다.

### 사전 생성 (단락 분할 + 메타데이터)

```bash
# 스모크 테스트 (장 2개)
python3 scripts/generate_passages.py --limit 2

# 전체 (1,189 장, 유료 티어 약 8~10분)
python3 scripts/generate_passages.py
```

각 장을 Gemini 2.5 Flash Lite 가 자연 단락으로 분할 + 단락별 `theme_title`,
`characteristics`, `core_meaning` 을 한 번에 생성합니다. 단락의 영구 식별자는
`{book_en}:{chapter}:{verse_start}-{verse_end}` 형식이며 DB·localStorage·
클라이언트 모두 같은 ID로 단락을 참조합니다.

## 개발 환경 설정

```bash
npm install
```

`.env.local` 생성:
```
GEMINI_API_KEY=your_key_here

# 랜덤 추천 + 인증 (선택; 없으면 익명 모드만 동작)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Supabase 사용 시:

1. 프로젝트 생성 후 SQL 에디터에 `supabase/migrations/0001_used_passages.sql` 적용
2. Authentication → Providers 에서 Google(또는 다른 provider) 활성화
3. Authentication → URL Configuration → Redirect URLs 에
   `http://localhost:3000/auth/callback` (및 배포 URL) 추가
4. 추가 provider 는 `src/lib/auth/providers.ts` 한 곳에 항목 추가

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
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Supabase Authentication → URL Configuration 에 배포 URL 의 콜백 경로
(`https://<deploy-url>/auth/callback`) 도 추가해야 OAuth 로그인이 동작합니다.