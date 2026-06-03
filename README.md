# 📖 Bible Search

## Tagline-ko
감정·주제 기반 성경 구절 시맨틱 검색. "외로워요", "두려워요" 같은 일상적 감정으로 관련 성경 말씀을 추천받습니다.

## Tagline-en
Emotion-aware semantic search for Bible verses. Find scripture by everyday feelings like "I feel lonely" or "I'm afraid."

## Tagline-ja
感情・テーマに基づく聖書節セマンティック検索。「寂しい」「怖い」など日常の感情からみことばを提案します。

## 프로젝트 개요
감정·주제를 입력하면, 성경 30,944개 구절을 의미 단위로 묶은 **단락(5,799개)** 중 가장 어울리는 것을 찾아 **핵심 절을 강조**해 보여줍니다. 단락 임베딩(밀집) + 텍스트(희소) + 감정/필요 태그 부스트를 RRF로 합산하고 Gemini 2.5 Flash-Lite로 리랭킹합니다. 정적 벡터 파일 + Vercel 서버리스로 호스팅 비용 0에 가깝게 운영합니다.

## Summary-en
Passage-centric semantic search: 30,944 verses are grouped into 5,799 thematic passages; a query is matched by dense passage embeddings + sparse text + emotion/need-tag boost (RRF fusion), reranked by Gemini 2.5 Flash-Lite, with the single most relevant "anchor verse" highlighted. Static vector files on Vercel keep hosting cost near zero.

## Summary-ja
30,944節を5,799の主題段落にまとめ、段落エンベディング（密）+テキスト（疎）+感情/ニーズタグのRRF統合で検索し、Gemini 2.5 Flash-Liteで再ランキング。最も関連する「核心の節」を強調表示します。静的ベクトルファイル + Vercel でホスティングコストをほぼゼロに抑えています。

---

감정·주제 기반 성경 구절 시맨틱 검색 서비스.
"외로워요", "두려워요" 같은 일상적인 감정 표현으로 관련 성경 말씀을 추천받을 수 있습니다.

## 기술 스택

| 구분 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, TypeScript) |
| 임베딩 모델 | `gemini-embedding-001` (512차원, 오프라인 생성) — verse는 ko+en 클린 입력, 단락은 주제+의미+본문 |
| 벡터 DB | 정적 파일 (`embeddings_passages.bin` · `embeddings_dense.bin` · `bible.json`) |
| 검색 단위 | **단락(passage)** — 결과는 의미 단위 단락 + 핵심 절 강조 |
| 검색 방식 | 단락 Dense(밀집) + Sparse(희소) + 감정/필요 태그 부스트 → RRF 합산 |
| 쿼리 확장 | Gemini 2.5 Flash-Lite (감정어 → 성경 키워드 변환) |
| 리랭킹 | Gemini 2.5 Flash-Lite (단락 단위) |
| 디자인 | 라이트 테마 — `docs/DESIGN.md` (Anthropic Blue + Empathy Blue, Pretendard/Barlow) |
| 호스팅 | Vercel |

## 검색 파이프라인 (단락 중심·2단계)

```
사용자 쿼리
    │
    ├─ [병렬] Gemini 쿼리 확장 → 감정 분석 + 성경 키워드 추출
    │         Gemini 임베딩   → 쿼리 벡터 (512차원)
    │
    ├─ Stage 2  단락 검색 (후보 5,799개)
    │   ├─ Dense  : 단락 임베딩 Cosine (embeddings_passages.bin)
    │   ├─ Sparse : 단락 텍스트(주제+의미+태그+본문) n-gram 매칭
    │   ├─ Tag    : 단락 감정/필요 태그 ∩ 쿼리확장 → 부스트
    │   └─ RRF 합산 → 상위 30개 단락
    │
    ├─ Stage 3  핵심 절 선정 — 단락 내 각 절을 쿼리 임베딩으로 채점 (verse 인덱스)
    │
    └─ Stage 4  Gemini 리랭킹 → 상위 5개 단락 (핵심 절 강조 + 추천 이유)
```

## 데이터

| 항목 | 수치 |
|---|---|
| 총 구절 수 | 30,944개 (한국어 개역개정 + 영어 NIV) |
| 단락 수 | **5,799개** (장르별 길이 보장, 최대 11절) |
| Verse 임베딩 | `embeddings_dense.bin` · 30,944 × 512차원 · uint8 (핵심 절 채점·anchor) |
| 단락 임베딩 | `embeddings_passages.bin` · 5,799 × 512차원 · uint8 (단락 검색) |
| 단락 태그 | 감정 `emotion_tags` · 필요 `need_tags` (통제어휘, 약 90% 커버) |
| 파일 크기 | `bible.json` 24MB + `embeddings_dense.bin` 15MB + `embeddings_passages.bin` 3MB |

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

### 단락 분할 방식 (하이브리드)

LLM의 주제 이해력은 살리되, **길이 일관성·폴백·필러 제거는 결정적(코드) 후처리**로 보장합니다.

1. **LLM 주제 분할** — Gemini 2.5 Flash-Lite에 장의 ko+en 본문 + 장르별 권장 길이를 주고 단락 경계·메타데이터 생성
2. **경계 스냅** — 단락 시작점으로 1..N을 연속·완전 커버 세그먼트로 구성 (겹침/공백/빈 필러 자동 해소)
3. **MAX 강제** — 장르 상한 초과 단락을 verse 임베딩 유사도 최저점(valley)에서 분할
4. **MIN 강제** — 장르 하한 미만 단락을 centroid 코사인이 가까운 이웃과 병합 (시가서는 단독 절 허용)
5. **메타 백필** — 분할/병합된 단락만 메타데이터 재생성

장르별 길이 한계(예: 시가서 1–6 / 복음서 3–9 / 역사서 4–11절)로 **최대 11절**, 통째-장 폴백 0, 장르 한계 준수율 98–100%. 단락 영구 식별자는 `{book_en}:{chapter}:{verse_start}-{verse_end}` 형식이며 DB·localStorage·클라이언트 모두 같은 ID로 참조합니다. 각 단락에는 감정/필요 태그(`emotion_tags`·`need_tags`)도 부여됩니다.

### 데이터 사전 생성 — 전체 재생성 순서

모두 1회성 오프라인 작업이며 `GEMINI_API_KEY`(유료 권장)와 `numpy`가 필요합니다(전체 ~$3–5).

```bash
# 0) 검증·롤백용 백업
cp public/data/passages.json public/data/passages.baseline.json

# 1) verse 클린 재임베딩 (ko+en, 태그 노이즈 제거) → embeddings_dense.bin
python3 scripts/generate_embeddings.py --target verse --input-mode clean

# 2) 단락 재분할 (하이브리드, verse 임베딩 사용)   # 스모크: --limit 3
python3 scripts/generate_passages.py

# 3) 단락 감정/필요 태그 (통제어휘)
python3 scripts/generate_passage_tags.py

# 4) 빈 메타데이터만 타깃 백필 (선택)
python3 scripts/backfill_passage_meta.py

# 5) 단락 임베딩 → embeddings_passages.bin
python3 scripts/generate_embeddings.py --target passage

# 6) 품질·ID 변경 검증 (읽기전용)
python3 scripts/passage_validate.py --baseline public/data/passages.baseline.json --emit-migration
```

> 재분할로 단락 ID가 다수 바뀌지만 "이미 본 단락 제외" 용도뿐이라 안전합니다(stale ID는 무시). `--emit-migration`이 옛→새 ID 매핑(`passage_id_migration.json`)을 생성합니다.

## 개발 환경 설정

```bash
npm install
```

`.env.local` 생성:
```
GEMINI_API_KEY=your_key_here

# 랜덤 추천 + 인증 (선택; 없으면 익명 모드로 동작)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

> **Supabase는 완전 선택**입니다. 키가 없으면 인증 UI는 숨겨지고 검색 + localStorage 기반 랜덤 추천이 그대로 동작합니다(앱이 크래시되지 않음). 검색만 쓰려면 `GEMINI_API_KEY`만 있으면 됩니다.

Supabase 사용 시:

1. 프로젝트 생성 후 SQL 에디터에 `supabase/migrations/0001_used_passages.sql` 적용
2. Authentication → Providers 에서 Google(또는 다른 provider) 활성화
3. Authentication → URL Configuration → Redirect URLs 에
   `http://localhost:3000/auth/callback` (및 배포 URL) 추가
4. 추가 provider 는 `src/lib/auth/providers.ts` 한 곳에 항목 추가

```bash
npm run dev   # http://localhost:3000
```

## 디자인 시스템

UI는 `docs/DESIGN.md`(KnowAI 디자인 시스템)를 따릅니다 — **라이트 테마**:

- **색**: 단일 블루 강조 — Primary `#0067b7`(Anthropic Blue), Empathy `#007bff`(보조 강조), 따뜻한 오프화이트 캔버스 `#fafaf6`, 흰 서피스
- **타이포**: 본문 Pretendard(17px/1.7), 디스플레이 Barlow(라틴) + Pretendard(한글 폴백)
- **모양/그림자**: 카드 12–16px 라운드 · 절제된 그림자(`0 5px 10px rgba(0,0,0,.12)`)
- **모션**: 200ms ease-out-quint, 호버 시 empathy 보더 + 1px 리프트, 액티브 `scale 0.98`

토큰은 `src/app/globals.css`의 Tailwind v4 `@theme`에 정의되어 있습니다.

## 임베딩 재생성 (필요 시)

```bash
pip install numpy   # 의존성

# verse (ko+en 클린) → embeddings_dense.bin
python3 scripts/generate_embeddings.py --target verse --input-mode clean

# 단락 → embeddings_passages.bin (passages.json 필요)
python3 scripts/generate_embeddings.py --target passage
```

`scripts/generate_embeddings.py` 상단의 `PAID_TIER` 플래그로 무료/유료 티어를 전환합니다. 429(속도제한)는 자동으로 재시도하고 진짜 일일 한도 초과 시에만 중단하며, 중단돼도 체크포인트에서 이어서 재생성합니다.

## Vercel 배포

Vercel 대시보드 → Settings → Environment Variables:
```
GEMINI_API_KEY=your_key_here
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Supabase Authentication → URL Configuration 에 배포 URL 의 콜백 경로
(`https://<deploy-url>/auth/callback`) 도 추가해야 OAuth 로그인이 동작합니다.