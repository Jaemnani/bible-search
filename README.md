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
| 임베딩 모델 | `gemini-embedding-001` (512차원) — 단락=fp16(무손실급), verse=int8 |
| 벡터 DB | 정적 파일 (`embeddings_passages.bin` · `embeddings_dense.bin` · `bible.json`) |
| 검색 단위 | **단락(passage)** — 결과는 의미 단위 단락 + 핵심 절 강조 |
| 검색 방식 | 단락 Dense(0.70) + Sparse BM25-lite(0.18) + 감정/필요 태그(0.12) → RRF(K=20) |
| 쿼리 확장 | Gemini 2.5 Flash-Lite (감정→성경 키워드) — **dense 임베딩 입력으로도 사용** |
| 리랭킹 | Gemini 2.5 Flash-Lite (단락 단위, 후보 20→상위 5) |
| 디자인 | 라이트 테마 — `docs/DESIGN.md` (Anthropic Blue + Empathy Blue, Pretendard/Barlow) |
| 호스팅 | Vercel |

## 검색 파이프라인 (단락 중심·2단계)

```
사용자 쿼리
    │
    ├─ Stage 1  Gemini 쿼리 확장 → 감정/필요 분석 + 성경 문체 search_query
    │
    ├─ Stage 2a Gemini 임베딩 → search_query 를 임베딩 (원쿼리 X)
    │           ※ 원쿼리("지치고 불안")는 '감정을 표현한' 탄식 본문과 매칭됨.
    │             성경 문체로 변환된 search_query 를 임베딩해야 '위로/응답' 본문이 잡힘.
    │
    ├─ Stage 2b 단락 검색 (후보 5,799개)
    │   ├─ Dense  : 단락 임베딩 Cosine (embeddings_passages.bin)
    │   ├─ Sparse : 단락 텍스트 BM25-lite (char trigram + IDF + 길이정규화)
    │   ├─ Tag    : 단락 감정/필요 태그 ∩ 쿼리확장 → 부스트
    │   └─ RRF 합산 (dense 0.70 / sparse 0.18 / tag 0.12, K=20) → 상위 20개
    │
    ├─ Stage 3  핵심 절 선정 — 단락 내 각 절을 쿼리 임베딩으로 채점 (verse 인덱스)
    │
    └─ Stage 4  Gemini 리랭킹 → 상위 5개 단락 (핵심 절 강조 + 추천 이유)
```

> **열화모드**: dense/expansion(둘 다 Gemini) 호출이 실패하면 응답에 `degraded:true`
> + `degradedReason` 을 표시하고, 화면에 비차단 안내 배너를 띄웁니다. 무음으로
> 열등한 결과를 정답인 양 반환하지 않습니다.

## 데이터

| 항목 | 수치 |
|---|---|
| 총 구절 수 | 30,944개 (한국어 개역개정 + 영어 NIV) |
| 단락 수 | **5,799개** (장르별 길이 보장, 최대 11절, 빈 메타 0) |
| Verse 임베딩 | `embeddings_dense.bin` · 30,944 × 512 · int8 (핵심 절 채점·anchor) |
| 단락 임베딩 | `embeddings_passages.bin` · 5,799 × 512 · **fp16** (단락 검색, 양자화 노이즈 없음) |
| 단락 태그 | 감정 `emotion_tags` · 필요 `need_tags` (통제어휘, 약 90% 커버) |
| 파일 크기 | `bible.json` 24MB + `embeddings_dense.bin` 15MB + `embeddings_passages.bin` 6MB |

## 랜덤 구절 추천

홈 화면의 `랜덤 추천` 버튼은 사전 생성된 단락(`public/data/passages.json`) 중 하나를
무작위로 보여줍니다. 각 단락은 다음 정보를 포함합니다:

- 범위 (예: `요한복음 3:14-21`) 와 본문 절들
- 단락의 **특징** (literary/narrative characteristics)
- 단락의 **핵심 의미**
- "사용함" 토글 — 한 번 본 단락은 자동 제외, 모두 사용 시 자동 초기화

### 사용 기록 저장

사용 기록("사용함" 토글)은 브라우저 `localStorage`(`bible.used_passages`)에 저장됩니다.
서버·DB·로그인 없이 기기 단위로 동작하며, 모든 단락을 사용하면 자동 초기화됩니다.

### 단락 분할 방식 (하이브리드)

LLM의 주제 이해력은 살리되, **길이 일관성·폴백·필러 제거는 결정적(코드) 후처리**로 보장합니다.

1. **LLM 주제 분할** — Gemini 2.5 Flash-Lite에 장의 ko+en 본문 + 장르별 권장 길이를 주고 단락 경계·메타데이터 생성
2. **경계 스냅** — 단락 시작점으로 1..N을 연속·완전 커버 세그먼트로 구성 (겹침/공백/빈 필러 자동 해소)
3. **MAX 강제** — 장르 상한 초과 단락을 verse 임베딩 유사도 최저점(valley)에서 분할
4. **MIN 강제** — 장르 하한 미만 단락을 centroid 코사인이 가까운 이웃과 병합 (시가서는 단독 절 허용)
5. **메타 백필** — 분할/병합된 단락만 메타데이터 재생성

장르별 길이 한계(예: 시가서 1–6 / 복음서 3–9 / 역사서 4–11절)로 **최대 11절**, 통째-장 폴백 0, 장르 한계 준수율 98–100%. 단락 영구 식별자는 `{book_en}:{chapter}:{verse_start}-{verse_end}` 형식이며 localStorage·클라이언트 모두 같은 ID로 참조합니다. 각 단락에는 감정/필요 태그(`emotion_tags`·`need_tags`)도 부여됩니다.

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

# 5) 단락 임베딩(fp16) → embeddings_passages.bin
python3 scripts/generate_embeddings.py --target passage --quant fp16

# 6) 품질·ID 변경 검증 (읽기전용)
python3 scripts/passage_validate.py --baseline public/data/passages.baseline.json --emit-migration
```

> 재분할로 단락 ID가 다수 바뀌지만 "이미 본 단락 제외" 용도뿐이라 안전합니다(stale ID는 무시). `--emit-migration`이 옛→새 ID 매핑(`passage_id_migration.json`)을 생성합니다.

## 말씀 듣기 (TTS) — 비용 0원

유료 TTS 없이도 듣기가 완전히 동작합니다. `/api/audio` 가 두 경로 중 하나를 돌려줍니다.

| 응답 | 조건 | 재생 |
|---|---|---|
| `{status:"ready", url}` | NAS `verse_audio` 에 mp3 캐시가 있을 때 | `<audio>` 로 재생(고품질) |
| `{status:"device", url:null}` | 캐시 없음 · NAS 미설정 · NAS 응답 없음(2초 타임아웃) | **기기 내장 음성**(Web Speech API) |

기기 내장 음성은 API 키·서버·저장소가 필요 없고 오프라인에서도 동작하며, 사용량 제한도 없습니다.
따라서 `SUPABASE_*` 를 설정하지 않은 상태(=무료 운영)에서도 듣기 기능이 그대로 동작합니다.

- 속도(0.75~1.5×) · 음성 선택 · **이어읽기**(한 절이 끝나면 다음 절로 자동 진행) 지원
- 설정은 `localStorage`(`bible.reader.listen`)에 기기 단위로 저장
- 음질을 올리고 싶으면 나중에 NAS 에서 mp3 를 사전 생성해 `verse_audio` + MinIO(`bible-audio`)에
  적재하면 됩니다 — **위 계약은 그대로**이고 클라이언트 수정도 필요 없습니다(P4-core(2), 선택).

## AI 질문 · 교차검증 (`/api/ai/*`) — 무료 티어

검색과 **같은 `GEMINI_API_KEY` 하나**로 동작한다(모델은 무료 티어가 있는 `gemini-2.5-flash-lite`).

- **AI 질문** — 절 본문 + 앞뒤 3절 문맥을 근거로 답변. 본문은 클라이언트가 보낸 값이 아니라
  **서버가 `bible.json` 에서 직접** 읽는다(변조된 "성경 본문"으로 답을 유도하는 것 방지).
- **AI 교차검증** — 원래 계획(OpenRouter 다중 모델)은 유료라, **관점 교차검증**으로 바꿨다.
  같은 모델을 `본문·문맥 / 번역·표현 / 성경 전체 대조` 세 렌즈로 **독립 호출**하고 합의점·이견을 정리한다.
  한 관점이 실패해도 나머지로 부분 응답(`degraded`)을 준다. 서로 다른 회사 모델 비교가 아님을 UI에 명시한다.
- 같은 (구절, 질문)은 인메모리 캐시(1시간)로 재사용해 무료 할당량을 아낀다.
- 프롬프트에 교리 단정 금지·견해 병기·모르면 모른다고 답하기 지침을 넣고, 답변에 참고용 고지를 붙인다.

## 구절별 설교영상·책 (`/api/verse-media`) — 무료

크롤러(`crawler/`)가 **YouTube Data API v3**(무료 쿼터)와 **Google Books API**(키 불필요)로 모아
NAS `verse_media` 에 적재하고, 웹은 그걸 읽기만 한다.

- 절은 30,944개라 무료 쿼터로는 불가능 → **영상은 장 단위(1,182개), 책은 권 단위(63개)** 로 수집한다.
- 조회는 **절 → 장 → 권** 순으로 되짚어, 좁은 범위 결과를 위에 놓는다(`scope` 배지로 표시).
- 영상은 링크·메타만 저장하고 썸네일은 공식 URL 핫링크(재호스팅 금지). 자세한 내용은 `crawler/README.md`.

## 개발 환경 설정

```bash
npm install
```

`.env.local` 생성:
```
GEMINI_API_KEY=your_key_here
```

> 필요한 환경변수는 **`GEMINI_API_KEY` 하나**입니다. 인증·DB 없이 검색 + localStorage 기반 랜덤 추천이 동작합니다.

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

# 단락(fp16) → embeddings_passages.bin (passages.json 필요)
python3 scripts/generate_embeddings.py --target passage --quant fp16
```

`--quant {int8|fp16}` 로 저장 정밀도를 선택합니다(검색 핵심인 단락은 fp16 권장). 양자화 재실험용 무손실 float32 사이드카는 `embeddings_src/`(gitignore)에 함께 저장됩니다. `PAID_TIER` 플래그로 무료/유료 티어를 전환하며, 429(속도제한)는 자동 재시도·체크포인트 재개하고 진짜 일일 한도 초과 시에만 중단합니다.

## Vercel 배포

Vercel 대시보드 → Settings → Environment Variables:
```
GEMINI_API_KEY=your_key_here
```