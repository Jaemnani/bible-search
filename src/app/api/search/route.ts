import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  loadBibleMap,
  loadPassages,
  type BibleVerse,
  type Passage,
} from "@/lib/passages";

interface QueryExpansion {
  emotions: string[];
  biblical_keywords: string[];
  search_query: string;
}

interface DenseData {
  vecs: Float32Array;
  dim: number;
  total: number;
  norms: Float32Array;
}

interface PassageCandidate {
  idx: number;        // passages 배열 인덱스
  score: number;      // RRF 점수
  anchor: number;     // 강조할 핵심 절 번호
  anchorKo: string;   // 핵심 절 한국어 본문 (리랭킹 입력용)
  reason?: string;
}

// --- In-memory caches (파일별 dense + 단락 검색 텍스트) ---
const denseCaches = new Map<string, DenseData | null>();
let passageTextCache: string[] | null = null;
let passageSparseCache: { df: Map<string, number>; dl: Float64Array; avgdl: number } | null = null;

// IEEE half(float16) → float32 (Vercel Node 호환 위해 수동 변환, Float16Array 비의존)
function halfToFloat(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1f) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

const FP16_MAGIC = 0x32424d45; // 'EMB2'

// verse / passage 임베딩 공통 로더. 두 포맷 지원:
//   int8 : [total:u32][dim:u32][vmin:f64][scale:f64] + total*dim uint8
//   fp16 : [magic:u32=EMB2][total:u32][dim:u32] + total*dim float16  (양자화 노이즈 없음)
function loadDense(file: string): DenseData | null {
  if (denseCaches.has(file)) return denseCaches.get(file)!;
  const filePath = path.join(process.cwd(), "public", "data", file);
  if (!fs.existsSync(filePath)) {
    denseCaches.set(file, null);
    return null;
  }
  const buf = fs.readFileSync(filePath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let total: number, dim: number;
  const floats: Float32Array = (() => {
    if (view.getUint32(0, true) === FP16_MAGIC) {
      total = view.getUint32(4, true);
      dim = view.getUint32(8, true);
      const out = new Float32Array(total * dim);
      // DataView.getUint16 사용 — 바이트 정렬 무관(Uint16Array 정렬 이슈 회피).
      let off = 12;
      for (let i = 0; i < out.length; i++, off += 2) out[i] = halfToFloat(view.getUint16(off, true));
      return out;
    }
    // 레거시 int8
    total = view.getUint32(0, true);
    dim = view.getUint32(4, true);
    const vmin = view.getFloat64(8, true);
    const scale = view.getFloat64(16, true);
    const quantized = new Uint8Array(buf.buffer, buf.byteOffset + 24, total * dim);
    const out = new Float32Array(total * dim);
    for (let i = 0; i < quantized.length; i++) out[i] = quantized[i] * scale + vmin;
    return out;
  })();

  // 벡터 노름 사전계산 — 매 쿼리 재계산 방지.
  const norms = new Float32Array(total!);
  for (let v = 0; v < total!; v++) {
    const o = v * dim!;
    let s = 0;
    for (let i = 0; i < dim!; i++) s += floats[o + i] ** 2;
    norms[v] = Math.sqrt(s);
  }
  const data: DenseData = { vecs: floats, dim: dim!, total: total!, norms };
  denseCaches.set(file, data);
  return data;
}

// 단락별 sparse 검색 텍스트(theme/meaning/characteristics/tags/절ko)를 로드 시 1회 결합 캐시.
// (이전 verse 검색은 쿼리마다 30,944개 문자열을 재할당했음 — 단락 중심+캐시로 제거.)
function loadPassageTexts(): string[] {
  if (passageTextCache) return passageTextCache;
  const passages = loadPassages();
  const map = loadBibleMap();
  passageTextCache = passages.map((p) => {
    const ko = p.verse_keys.map((k) => map.get(k)?.ko ?? "").join(" ");
    return [
      p.theme_title ?? "",
      p.core_meaning ?? "",
      (p.characteristics ?? []).join(" "),
      (p.emotion_tags ?? []).join(" "),
      (p.need_tags ?? []).join(" "),
      ko,
    ].join(" ");
  });
  return passageTextCache;
}

// 단락 sparse 텀: 공백 단어(정확일치) + 단어 내부 char trigram(교착어 부분매칭).
// bigram은 과도하게 흔해(노이즈) trigram 사용. 단어<3자는 그대로.
function sparseTermsOf(text: string): string[] {
  const out: string[] = [];
  for (const w of text.split(/\s+/)) {
    if (!w) continue;
    out.push(w);
    for (let i = 0; i + 3 <= w.length; i++) out.push(w.slice(i, i + 3));
  }
  return out;
}

// BM25-lite 인덱스: 텀별 df(흔한 조각 IDF로 제거) + 단락 길이(긴 단락 보정). 로드 시 1회.
function loadPassageSparseIndex() {
  if (passageSparseCache) return passageSparseCache;
  const texts = loadPassageTexts();
  const df = new Map<string, number>();
  const dl = new Float64Array(texts.length);
  let total = 0;
  for (let i = 0; i < texts.length; i++) {
    const terms = sparseTermsOf(texts[i]);
    dl[i] = terms.length;
    total += terms.length;
    const seen = new Set<string>();
    for (const t of terms) {
      if (seen.has(t)) continue;
      seen.add(t);
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  passageSparseCache = { df, dl, avgdl: total / Math.max(texts.length, 1) };
  return passageSparseCache;
}

// --- Stage 1: Gemini Query Expansion ---
async function expandQueryWithGemini(userQuery: string): Promise<QueryExpansion | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `당신은 한국인 사용자의 감정적 고민을 성경 구절 검색어로 변환하는 전문가입니다.

다음 순서로 분석하세요:
1. 핵심 감정 파악 (불안/슬픔/두려움/외로움/분노/지침/죄책감/허무 등)
2. 근본적 필요 파악 (위로/용기/지혜/용서/평안/소망/힘/회복 등)
3. 성경 본문에 실제로 등장하는 표현들로 search_query를 구성

search_query 작성 규칙:
- 실제 성경 구절 문체("두려워하지 말라", "수고하고 무거운 짐", "내가 너와 함께" 등)를 우선
- 현대 감정어(외롭다, 힘들다)와 성경적 표현을 함께 포함
- 최소 15단어 이상, 다양한 각도의 표현 포함

반드시 아래 JSON만 반환하세요.

[예시 입력] "취업이 안 돼서 너무 지쳐요"
[예시 출력]
{
  "emotions": ["지침", "낙심", "불안"],
  "biblical_keywords": ["새 힘", "인도하심", "소망", "두려워하지 말라", "나의 계획"],
  "search_query": "수고하고 무거운 짐 진 자들아 내게로 오라 두려워하지 말라 내가 너와 함께 하노라 독수리 날개치며 올라감 새 힘 얻으리니 피곤한 자에게 능력 낙심하지 말라 선을 행하되"
}

[입력] "${userQuery}"`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 512, // search_query가 15단어 이상이라 256은 JSON 잘림 위험
            responseMimeType: "application/json", // 프롬프트 외 산문 섞임 방지 → 안정적 파싱
          },
        }),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const credit = res.status === 429 && /RESOURCE_EXHAUSTED|credits|quota/i.test(body);
      console.error(`[Expand] Gemini 확장 실패: ${res.status}${credit ? " (크레딧/할당량 소진)" : ""} - ${body.slice(0, 160)}`);
      return null;
    }
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed: QueryExpansion = JSON.parse(jsonStr);
    return parsed.search_query ? parsed : null;
  } catch {
    return null;
  }
}

// --- Stage 4: Gemini Reranking (단락 단위) ---
async function rerankPassages(
  userQuery: string,
  expansion: QueryExpansion | null,
  passages: Passage[],
  candidates: PassageCandidate[]
): Promise<PassageCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || candidates.length <= 3) return candidates.slice(0, 5);

  const list = candidates
    .map((c, i) => {
      const p = passages[c.idx];
      return `[${i + 1}] ${p.range_label} (${p.theme_title}) - ${c.anchorKo}`;
    })
    .join("\n");

  const emotionLine = expansion ? `감정 분석: ${expansion.emotions.join(", ")}` : "";
  const keywordLine = expansion ? `핵심 필요: ${expansion.biblical_keywords?.slice(0, 4).join(", ")}` : "";

  const prompt = `사용자 입력: "${userQuery}"
${emotionLine}
${keywordLine}

아래 ${candidates.length}개 성경 단락 중, 이 사람에게 가장 직접적으로 도움이 될 5개를 선택하세요.

선택 기준 (중요도 순):
1. 사용자의 감정·상황에 직접 공명하는가
2. 구체적인 위로·힘·방향을 주는가
3. 심판·경고보다 은혜·소망 중심인가
4. 단락의 메시지가 명확하고 마음에 와닿는가

단락 목록 (형식: [번호] 범위 (주제) - 핵심절):
${list}

반드시 아래 JSON만 반환하세요. reason은 사용자에게 말하듯 1-2문장으로.
{"results": [{"index": 1, "reason": "이유"}, ...]}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024, // 5개 결과 × 한국어 reason — 512는 잘림 위험
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return candidates.slice(0, 5);
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    const reranked: PassageCandidate[] = [];
    const seen = new Set<number>();
    for (const item of parsed.results ?? []) {
      const idx = (item.index as number) - 1;
      if (idx >= 0 && idx < candidates.length && !seen.has(idx)) {
        seen.add(idx);
        reranked.push({ ...candidates[idx], reason: item.reason });
      }
    }
    return reranked.length > 0 ? reranked.slice(0, 5) : candidates.slice(0, 5);
  } catch {
    return candidates.slice(0, 5);
  }
}

// --- Cosine Similarity (aNorm은 루프 밖 1회 계산, bNorm 사전계산값 사용) ---
function cosineSimilarity(
  a: number[],
  b: Float32Array,
  offset: number,
  dim: number,
  aNorm: number,
  bNorm?: number
): number {
  let dot = 0;
  if (bNorm !== undefined) {
    for (let i = 0; i < dim; i++) dot += a[i] * b[offset + i];
    const denom = aNorm * bNorm;
    return denom < 1e-9 ? 0 : dot / denom;
  }
  let nb = 0;
  for (let i = 0; i < dim; i++) {
    dot += a[i] * b[offset + i];
    nb += b[offset + i] * b[offset + i];
  }
  const denom = aNorm * Math.sqrt(nb);
  return denom < 1e-9 ? 0 : dot / denom;
}

// --- Stage 2a: Dense Query Embedding (gemini-embedding-001) ---
async function getQueryEmbedding(query: string, dim: number): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[Dense] GEMINI_API_KEY가 설정되지 않았습니다.");
    return null;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: query }] },
          outputDimensionality: dim,
          taskType: "RETRIEVAL_QUERY",
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) {
      const errorText = await res.text();
      const credit = res.status === 429 && /RESOURCE_EXHAUSTED|credits|quota/i.test(errorText);
      console.error(`[Dense] Gemini embedding 실패: ${res.status}${credit ? " (크레딧/할당량 소진)" : ""} - ${errorText.slice(0, 160)}`);
      return null;
    }
    const data = await res.json();
    return data.embedding?.values ?? null;
  } catch (e) {
    console.error(`[Dense] Gemini embedding error:`, e);
    return null;
  }
}

// --- Stage 2b: Sparse Query Terms (word 1.0 + char trigram 0.7) ---
// 정확 단어는 강한 신호, trigram은 부분매칭 recall. 흔함/희소는 IDF가 처리.
function buildSparseQuery(query: string): Map<string, number> {
  const q = new Map<string, number>();
  const bump = (t: string, w: number) => {
    const cur = q.get(t) ?? 0;
    if (w > cur) q.set(t, w);
  };
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    bump(word, 1.0);
    for (let i = 0; i + 3 <= word.length; i++) bump(word.slice(i, i + 3), 0.7);
  }
  return q;
}

// --- Stage 2: 단락 하이브리드 검색 (Dense + Sparse + 태그 부스트, RRF) ---
function passageHybridSearch(
  passages: Passage[],
  queryEmbedding: number[] | null,
  passageDense: DenseData | null,
  searchQuery: string,
  expansion: QueryExpansion | null,
  topK: number
): { idx: number; score: number }[] {
  const N = passages.length;
  // RRF_K 작을수록 상위 순위 분해능↑(1등과 50등 격차 확대). 60→20: 융합 sweep상
  // 정답 RRF 중앙 5→2 개선. (dense 입력 수정 전제에서 유효.)
  const RRF_K = 20;
  const denseRanks = new Map<number, number>();
  const sparseRanks = new Map<number, number>();
  const tagRanks = new Map<number, number>();

  // Dense (단락 임베딩 — 5,715개로 verse 30k보다 빠름)
  if (queryEmbedding && passageDense) {
    const useDim = Math.min(queryEmbedding.length, passageDense.dim);
    let qNorm = 0;
    for (let i = 0; i < useDim; i++) qNorm += queryEmbedding[i] * queryEmbedding[i];
    qNorm = Math.sqrt(qNorm);
    const usePrecomputed = useDim === passageDense.dim;
    const count = Math.min(N, passageDense.total);
    const scores: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      scores.push([
        i,
        cosineSimilarity(
          queryEmbedding,
          passageDense.vecs,
          i * passageDense.dim,
          useDim,
          qNorm,
          usePrecomputed ? passageDense.norms[i] : undefined
        ),
      ]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    scores.slice(0, 200).forEach(([idx], rank) => denseRanks.set(idx, rank + 1));
  }

  // Sparse: BM25-lite (IDF 가중 + 길이 정규화) — 흔한 char 조각의 노이즈 제거
  const texts = loadPassageTexts();
  const { df, dl, avgdl } = loadPassageSparseIndex();
  const qTerms = buildSparseQuery(searchQuery);
  const B = 0.5; // 길이 정규화 강도
  // 텀별 IDF 사전계산 (BM25 idf): 흔한 조각(df 큼) → ~0
  const idf = new Map<string, number>();
  for (const t of qTerms.keys()) {
    const d = df.get(t) ?? 0;
    idf.set(t, Math.log(1 + (N - d + 0.5) / (d + 0.5)));
  }
  const sparseScores: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const txt = texts[i] ?? "";
    let s = 0;
    for (const [t, qw] of qTerms) {
      if (txt.includes(t)) s += qw * (idf.get(t) ?? 0);
    }
    if (s > 0) {
      const norm = 1 - B + B * (dl[i] / avgdl); // 긴 단락이 흔한 조각으로 고득점하는 것 보정
      sparseScores.push([i, s / norm]);
    }
  }
  sparseScores.sort((a, b) => b[1] - a[1]);
  sparseScores.slice(0, 200).forEach(([idx], rank) => sparseRanks.set(idx, rank + 1));

  // 태그 부스트: 단락의 통제어휘 태그 ∩ 쿼리확장(감정/키워드)
  if (expansion) {
    // 빈 문자열 제거 — tag.includes("")가 항상 true라 모든 단락이 매칭되는 노이즈 방지.
    const wanted = [...(expansion.emotions ?? []), ...(expansion.biblical_keywords ?? [])]
      .filter((w) => typeof w === "string" && w.trim().length > 0);
    const tagScores: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const tags = [...(passages[i].emotion_tags ?? []), ...(passages[i].need_tags ?? [])];
      let c = 0;
      for (const tag of tags) {
        if (!tag) continue;
        if (wanted.some((w) => w.includes(tag) || tag.includes(w))) c++;
      }
      if (c > 0) tagScores.push([i, c]);
    }
    tagScores.sort((a, b) => b[1] - a[1]);
    tagScores.slice(0, 200).forEach(([idx], rank) => tagRanks.set(idx, rank + 1));
  }

  // RRF fusion (가중치 합 = 1)
  // dense가 핵심 신호(입력 수정 후) → 비중↑. sparse/tag는 보조 부스트로 격하.
  // dense 부재 시 sparseW=1-tagW(폴백), expansion 부재 시 tagW=0.
  // denseW는 dense 블록 실행 조건(queryEmbedding && passageDense)과 반드시 일치해야 함 —
  // passageDense 누락 시 denseRanks가 비어 denseW가 상수 폴백 순위에 낭비되고 sparse 폴백이 깨짐.
  const denseW = queryEmbedding && passageDense ? 0.70 : 0;
  const tagW = expansion ? 0.12 : 0;
  const sparseW = 1 - denseW - tagW;
  const allIdx = new Set([...denseRanks.keys(), ...sparseRanks.keys(), ...tagRanks.keys()]);
  const rrfScores: [number, number][] = [];
  for (const idx of allIdx) {
    const rrf =
      denseW * (1 / (RRF_K + (denseRanks.get(idx) ?? 300))) +
      sparseW * (1 / (RRF_K + (sparseRanks.get(idx) ?? 300))) +
      tagW * (1 / (RRF_K + (tagRanks.get(idx) ?? 300)));
    rrfScores.push([idx, rrf]);
  }
  rrfScores.sort((a, b) => b[1] - a[1]);

  return rrfScores.slice(0, topK).map(([idx, score]) => ({
    idx,
    score: Math.round(score * 1e6) / 1e6,
  }));
}

// --- Stage 3: 핵심절(anchor) 선정 — 단락 내 절을 쿼리 임베딩으로 채점 ---
function selectAnchor(
  passage: Passage,
  queryEmbedding: number[] | null,
  verseDense: DenseData | null,
  bibleMap: Map<string, BibleVerse>
): number {
  if (!queryEmbedding || !verseDense) return passage.verse_start;
  const useDim = Math.min(queryEmbedding.length, verseDense.dim);
  let qNorm = 0;
  for (let i = 0; i < useDim; i++) qNorm += queryEmbedding[i] * queryEmbedding[i];
  qNorm = Math.sqrt(qNorm);
  const usePrecomputed = useDim === verseDense.dim;

  let bestV = passage.verse_start;
  let bestS = -Infinity;
  for (const key of passage.verse_keys) {
    const v = bibleMap.get(key);
    if (!v || typeof v.id !== "number" || v.id < 0 || v.id >= verseDense.total) continue;
    const s = cosineSimilarity(
      queryEmbedding,
      verseDense.vecs,
      v.id * verseDense.dim,
      useDim,
      qNorm,
      usePrecomputed ? verseDense.norms[v.id] : undefined
    );
    if (s > bestS) {
      bestS = s;
      bestV = v.verse;
    }
  }
  return bestV;
}

// --- API Route ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userQuery: string = (body.query ?? "").trim();

    if (!userQuery) {
      return NextResponse.json({ error: "검색어를 입력해주세요." }, { status: 400 });
    }
    if (userQuery.length > 300) {
      return NextResponse.json({ error: "검색어가 너무 깁니다." }, { status: 400 });
    }

    // 콜드스타트 데이터 로드도 7초 예산에 포함되도록 먼저 측정 시작.
    const requestStart = Date.now();

    const passages = loadPassages();
    if (passages.length === 0) {
      return NextResponse.json(
        { error: "단락 데이터가 없습니다. scripts/generate_passages.py를 실행하세요." },
        { status: 503 }
      );
    }
    const passageDense = loadDense("embeddings_passages.bin");
    const verseDense = loadDense("embeddings_dense.bin");
    const bibleMap = loadBibleMap();

    // Stage 1: 쿼리 확장(먼저) — 그 search_query를 dense 입력으로 사용하기 위함.
    // 데이터 로드(위)는 동기 fs라 이미 완료. 추가 직렬 구간은 임베딩 1콜뿐(~1-2s, 예산 내).
    const embedDim = passageDense?.dim ?? verseDense?.dim ?? 512;
    const expansion = await expandQueryWithGemini(userQuery);
    const searchQuery = expansion?.search_query ?? userQuery;

    // Stage 2a: dense 쿼리 임베딩 — 확장 성공 시 search_query(성경 문체)를 임베딩.
    // 원쿼리("지치고 불안")를 임베딩하면 '감정을 표현한' 탄식 본문과 매칭되어
    // 위로/응답 본문을 놓침(진단 확인). 확장 실패 시에만 원쿼리로 폴백(열등 경로).
    const denseInput = expansion?.search_query ?? userQuery;
    const queryEmbedding = await getQueryEmbedding(denseInput, embedDim);

    // 열화(degraded) — 검색 로직 외 상태만 파생/노출.
    const usedDense = !!queryEmbedding && !!passageDense;
    const usedGemini = !!expansion;
    let degraded = false;
    let degradedReason: string | null = null;
    if (!usedDense) {
      degraded = true;
      degradedReason = !queryEmbedding && !expansion ? "no_dense_no_expansion"
        : !queryEmbedding ? "no_dense" : "no_index";
    } else if (!expansion) {
      // dense는 동작하나 원쿼리로 임베딩한 열등 경로(확장 실패) — 무음 처리 금지.
      degraded = true;
      degradedReason = "no_expansion_raw_dense";
    }
    if (degraded) {
      console.warn(
        `[Search] 열화: reason=${degradedReason} (dense=${usedDense} expansion=${usedGemini}) ` +
        `query=${JSON.stringify(userQuery.slice(0, 50))}`
      );
    }

    // Stage 2: 단락 하이브리드 검색 → 리랭킹 후보 풀.
    // 풀=20: 라이브 진단상 정답 RRF 순위 중앙 9·경계 15 → 20이면 여유 있게 포함.
    // (dense 입력을 search_query로 고친 전제에서만 유효 — 정답이 RRF 상위에 모임.)
    const ranked = passageHybridSearch(
      passages,
      queryEmbedding,
      passageDense,
      searchQuery,
      expansion,
      20
    );

    // Stage 3: 후보별 핵심절 선정
    const candidates: PassageCandidate[] = ranked.map((r) => {
      const p = passages[r.idx];
      const anchor = selectAnchor(p, queryEmbedding, verseDense, bibleMap);
      const anchorKo = bibleMap.get(`${p.book_en}:${p.chapter}:${anchor}`)?.ko ?? "";
      return { idx: r.idx, score: r.score, anchor, anchorKo };
    });

    // Stage 4: Gemini 리랭킹 (7초 예산 초과 시 스킵)
    const elapsed = Date.now() - requestStart;
    const reranked =
      elapsed < 7000
        ? await rerankPassages(userQuery, expansion, passages, candidates)
        : candidates.slice(0, 5);
    // 리랭킹이 실제로 수행됐는지 — reason은 모델 리랭킹 성공 경로에서만 채워짐.
    // (예산 초과 스킵·API 실패·후보≤3 폴백이면 false → UI가 "AI 추천"으로 오기재하지 않음.)
    const didRerank = reranked.some((c) => !!c.reason);

    // 상위 5 단락 hydrate (절 ko/en)
    const results = reranked.map((c, rank) => {
      const p = passages[c.idx];
      const verses = p.verse_keys.map((k) => {
        const v = bibleMap.get(k);
        return { verse: v?.verse ?? 0, ko: v?.ko ?? "", en: v?.en ?? "" };
      });
      return {
        id: p.id,
        range_label: p.range_label,
        book_ko: p.book_ko,
        book_en: p.book_en,
        chapter: p.chapter,
        verse_start: p.verse_start,
        verse_end: p.verse_end,
        testament: p.testament,
        genre: p.genre,
        theme_title: p.theme_title,
        characteristics: p.characteristics,
        core_meaning: p.core_meaning,
        emotion_tags: p.emotion_tags ?? [],
        need_tags: p.need_tags ?? [],
        verses,
        anchor_verse: c.anchor,
        rerank_reason: c.reason,
        score: c.score,
        rank: rank + 1,
      };
    });

    return NextResponse.json({
      query: userQuery,
      expanded_query: expansion?.search_query ?? null,
      emotions: expansion?.emotions ?? [],
      biblical_keywords: expansion?.biblical_keywords ?? [],
      total: passages.length,
      usedDense,
      usedGemini,
      reranked: didRerank,
      degraded,
      degradedReason,
      results,
    });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
