import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface BibleVerse {
  id: number;
  key: string;
  book_en: string;
  book_ko: string;
  chapter: number;
  verse: number;
  testament: string;
  genre: string;
  ko: string;
  en: string;
  embed_text: string;
}

interface SearchResult extends BibleVerse {
  score: number;
  rank: number;
  rerank_reason?: string;
  context?: BibleVerse[];
}

interface QueryExpansion {
  emotions: string[];
  biblical_keywords: string[];
  search_query: string;
}

// --- In-memory cache ---
let bibleCache: BibleVerse[] | null = null;
let denseCache: Float32Array | null = null;
let denseMeta: { vmin: number; scale: number; dim: number } | null = null;

function loadBible(): BibleVerse[] {
  if (bibleCache) return bibleCache;
  const filePath = path.join(process.cwd(), "public", "data", "bible.json");
  if (!fs.existsSync(filePath)) return [];
  bibleCache = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return bibleCache!;
}

function loadDenseEmbeddings(): { vecs: Float32Array; dim: number } | null {
  if (denseCache && denseMeta) return { vecs: denseCache, dim: denseMeta.dim };
  const filePath = path.join(process.cwd(), "public", "data", "embeddings_dense.bin");
  if (!fs.existsSync(filePath)) return null;

  const buf  = fs.readFileSync(filePath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const total = view.getUint32(0, true);
  const dim   = view.getUint32(4, true);
  const vmin  = view.getFloat64(8, true);
  const scale = view.getFloat64(16, true);

  const quantized = new Uint8Array(buf.buffer, buf.byteOffset + 24);
  const floats = new Float32Array(total * dim);
  for (let i = 0; i < quantized.length; i++) {
    floats[i] = quantized[i] * scale + vmin;
  }
  denseMeta = { vmin, scale, dim };
  denseCache = floats;
  return { vecs: floats, dim };
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
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
        }),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed: QueryExpansion = JSON.parse(jsonStr);
    return parsed.search_query ? parsed : null;
  } catch {
    return null;
  }
}

// --- Stage 3: Gemini Reranking ---
async function rerankWithGemini(
  userQuery: string,
  expansion: QueryExpansion | null,
  candidates: SearchResult[]
): Promise<SearchResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || candidates.length <= 3) return candidates.slice(0, 5);

  const list = candidates
    .map((c, i) => `[${i + 1}] ${c.book_ko} ${c.chapter}:${c.verse} - ${c.ko}`)
    .join("\n");

  const emotionLine  = expansion ? `감정 분석: ${expansion.emotions.join(", ")}` : "";
  const keywordLine  = expansion ? `핵심 필요: ${expansion.biblical_keywords?.slice(0, 4).join(", ")}` : "";

  const prompt = `사용자 입력: "${userQuery}"
${emotionLine}
${keywordLine}

아래 ${candidates.length}개 성경 구절 중, 이 사람에게 가장 직접적으로 도움이 될 5개를 선택하세요.

선택 기준 (중요도 순):
1. 사용자의 감정·상황에 직접 공명하는가
2. 구체적인 위로·힘·방향을 주는가
3. 심판·경고보다 은혜·소망 중심인가
4. 문장이 명확하고 마음에 와닿는가

구절 목록:
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
          generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return candidates.slice(0, 5);
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    const reranked: SearchResult[] = [];
    for (const item of parsed.results ?? []) {
      const idx = (item.index as number) - 1;
      if (idx >= 0 && idx < candidates.length) {
        reranked.push({ ...candidates[idx], rerank_reason: item.reason });
      }
    }
    return reranked.length > 0 ? reranked.slice(0, 5) : candidates.slice(0, 5);
  } catch {
    return candidates.slice(0, 5);
  }
}

// --- Cosine Similarity ---
function cosineSimilarity(a: number[], b: Float32Array, offset: number, dim: number): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < dim; i++) {
    dot   += a[i] * b[offset + i];
    normA += a[i] * a[i];
    normB += b[offset + i] * b[offset + i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-9 ? 0 : dot / denom;
}

// --- Stage 2a: Dense Query Embedding (Gemini text-embedding-004) ---
// generate_embeddings.py 와 동일 모델 -> 벡터 공간 일치 보장
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
      console.error(`[Dense] Gemini embedding failed: ${res.status} - ${errorText}`);
      return null;
    }
    const data = await res.json();
    return data.embedding?.values ?? null;
  } catch (e) {
    console.error(`[Dense] Gemini embedding error:`, e);
    return null;
  }
}

// --- Stage 2b: Sparse Query Tokens (text TF, word + bigram) ---
function buildQueryTokens(query: string): Record<string, number> {
  const tokens: Record<string, number> = {};
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    tokens[word] = (tokens[word] || 0) + 1;
    for (let i = 0; i < word.length - 1; i++) {
      const bg = word.slice(i, i + 2);
      tokens[bg] = (tokens[bg] || 0) + 0.5;
    }
  }
  return tokens;
}

// --- Stage 2: Hybrid Search (RRF) ---
function hybridSearch(
  bible: BibleVerse[],
  queryEmbedding: number[] | null,
  denseData: { vecs: Float32Array; dim: number } | null,
  searchQuery: string,
  topK: number
): SearchResult[] {
  const N = bible.length;
  const RRF_K = 60;
  const denseRanks  = new Map<number, number>();
  const sparseRanks = new Map<number, number>();

  // Dense
  if (queryEmbedding && denseData) {
    const useDim = Math.min(queryEmbedding.length, denseData.dim);
    const scores: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      scores.push([i, cosineSimilarity(queryEmbedding, denseData.vecs, i * denseData.dim, useDim)]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    scores.slice(0, 300).forEach(([idx], rank) => denseRanks.set(idx, rank + 1));
  }

  // Sparse: text TF over ko + en + embed_text
  const qTokens = buildQueryTokens(searchQuery);
  const terms = Object.keys(qTokens);
  const sparseScores: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const txt =
      (bible[i].ko ?? "") + " " +
      (bible[i].en ?? "") + " " +
      (bible[i].embed_text ?? "");
    let s = 0;
    for (const t of terms) {
      if (txt.includes(t)) s += qTokens[t];
    }
    if (s > 0) sparseScores.push([i, s]);
  }
  sparseScores.sort((a, b) => b[1] - a[1]);
  sparseScores.slice(0, 300).forEach(([idx], rank) => sparseRanks.set(idx, rank + 1));

  // RRF fusion
  const denseW  = queryEmbedding ? 0.65 : 0;
  const sparseW = 1 - denseW;
  const allIdx = new Set([...denseRanks.keys(), ...sparseRanks.keys()]);
  const rrfScores: [number, number][] = [];
  for (const idx of allIdx) {
    const rrf =
      denseW  * (1 / (RRF_K + (denseRanks.get(idx)  ?? 300))) +
      sparseW * (1 / (RRF_K + (sparseRanks.get(idx) ?? 300)));
    rrfScores.push([idx, rrf]);
  }
  rrfScores.sort((a, b) => b[1] - a[1]);

  return rrfScores.slice(0, topK).map(([idx, score], rank) => ({
    ...bible[idx],
    score: Math.round(score * 1e6) / 1e6,
    rank: rank + 1,
  }));
}

// --- Context Expansion (+-2 verses) ---
function expandContext(verse: BibleVerse, bible: BibleVerse[]): BibleVerse[] {
  const { book_en, chapter, verse: v } = verse;
  const result: BibleVerse[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const tv = v + offset;
    if (tv < 1) continue;
    const found = bible.find(b => b.book_en === book_en && b.chapter === chapter && b.verse === tv);
    if (found) result.push(found);
  }
  return result;
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

    const bible = loadBible();
    if (bible.length === 0) {
      return NextResponse.json(
        { error: "성경 데이터가 없습니다. parse_bible.py를 실행하세요." },
        { status: 503 }
      );
    }
    const denseData = loadDenseEmbeddings();
    const requestStart = Date.now();

    // Stage 1+2: 쿼리 확장 + 임베딩 병렬 실행
    const [expansion, queryEmbedding] = await Promise.all([
      expandQueryWithGemini(userQuery),
      getQueryEmbedding(userQuery, denseData?.dim ?? 256),
    ]);
    const searchQuery = expansion?.search_query ?? userQuery;

    // Stage 2: Hybrid search (Dense + Sparse)
    const candidates = hybridSearch(bible, queryEmbedding, denseData, searchQuery, 15);

    // Stage 3: Gemini reranking (7초 예산 초과 시 스킵 → Vercel Hobby 10초 제한 대응)
    const elapsed = Date.now() - requestStart;
    const reranked = elapsed < 7000
      ? await rerankWithGemini(userQuery, expansion, candidates)
      : candidates.slice(0, 5);

    const withContext = reranked.map(r => ({
      ...r,
      context: expandContext(r, bible),
    }));

    return NextResponse.json({
      query: userQuery,
      expanded_query: expansion?.search_query ?? null,
      emotions: expansion?.emotions ?? [],
      biblical_keywords: expansion?.biblical_keywords ?? [],
      total: bible.length,
      usedDense: !!queryEmbedding,
      usedGemini: !!expansion,
      results: withContext,
    });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
