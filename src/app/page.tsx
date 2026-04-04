"use client";

import { useState, useRef, useCallback } from "react";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface BibleVerse {
  id: number;
  key: string;
  book_ko: string;
  book_en: string;
  chapter: number;
  verse: number;
  testament: string;
  genre: string;
  ko: string;
  en: string;
}

interface SearchResult extends BibleVerse {
  score: number;
  rank: number;
  rerank_reason?: string;
  context?: BibleVerse[];
}

interface SearchResponse {
  query: string;
  expanded_query?: string | null;
  emotions?: string[];
  biblical_keywords?: string[];
  total: number;
  usedDense: boolean;
  usedGemini: boolean;
  results: SearchResult[];
  error?: string;
}

// ──────────────────────────────────────────────
// Tag Suggestions
// ──────────────────────────────────────────────
const TAGS = [
  { label: "🙏 위로가 필요해",    query: "힘들고 외로울 때 위로와 평안" },
  { label: "💪 용기를 주세요",   query: "두려움을 이기는 용기와 담대함" },
  { label: "❤️ 하나님의 사랑",   query: "하나님의 사랑과 은혜" },
  { label: "🌿 감사와 찬양",     query: "감사와 찬양 기쁨" },
  { label: "🕊️ 평안과 안식",     query: "마음의 평안과 안식" },
  { label: "🌟 믿음과 소망",     query: "믿음과 소망 확신" },
  { label: "🔥 시련을 이겨내",   query: "고난과 시련을 이겨내는 힘" },
  { label: "💡 지혜를 구해",     query: "지혜와 인도하심을 구함" },
  { label: "🤝 용서와 화해",     query: "용서와 화해 사랑" },
  { label: "⚡ 새 힘 주세요",    query: "지치고 힘들 때 새 힘과 회복" },
];

// ──────────────────────────────────────────────
// VerseCard Component
// ──────────────────────────────────────────────
function VerseCard({ result, delay }: { result: SearchResult; delay: number }) {
  const [showContext, setShowContext] = useState(false);
  const [showEn, setShowEn] = useState(false);

  const scorePercent = Math.min(100, Math.round(result.score * 1e7));

  return (
    <article
      className="verse-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Score indicator */}
      <div
        className="score-bar"
        style={{ width: `${Math.min(100, 30 + scorePercent)}%` }}
      />

      {/* Top row */}
      <div className="verse-card-top">
        <div className="verse-ref">
          <span className="verse-book">{result.book_ko}</span>
          <span className="verse-num">{result.chapter}:{result.verse}</span>
        </div>
        <div className="verse-badges">
          <span className={`badge ${result.testament === "OT" ? "badge-ot" : "badge-nt"}`}>
            {result.testament === "OT" ? "구약" : "신약"}
          </span>
          <span className="badge badge-genre">{result.genre}</span>
        </div>
      </div>

      {/* Korean text */}
      <p className="verse-text-ko">{result.ko}</p>

      {/* Gemini rerank reason */}
      {result.rerank_reason && (
        <p style={{
          marginTop: "10px",
          fontSize: "0.78rem",
          color: "var(--gold)",
          display: "flex",
          alignItems: "flex-start",
          gap: "6px",
          lineHeight: 1.65,
          opacity: 0.85,
        }}>
          <span style={{ flexShrink: 0 }}>✦</span>
          {result.rerank_reason}
        </p>
      )}

      {/* English toggle */}
      {result.en && (
        <>
          <button
            className="context-toggle"
            onClick={() => setShowEn(!showEn)}
            aria-expanded={showEn}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d={showEn ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"}
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              />
            </svg>
            {showEn ? "NIV 닫기" : "NIV 영어 보기"}
          </button>
          {showEn && <p className="verse-text-en">&ldquo;{result.en}&rdquo;</p>}
        </>
      )}

      {/* Context expansion */}
      {result.context && result.context.length > 1 && (
        <>
          <button
            className="context-toggle"
            onClick={() => setShowContext(!showContext)}
            aria-expanded={showContext}
            style={{ marginLeft: result.en ? "16px" : 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d={showContext ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"}
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              />
            </svg>
            {showContext ? "문맥 닫기" : `앞뒤 문맥 보기 (${result.chapter}장)`}
          </button>

          {showContext && (
            <div className="context-area">
              {result.context.map((ctx) => (
                <p
                  key={ctx.key}
                  className={`context-verse ${ctx.verse === result.verse ? "highlighted" : ""}`}
                >
                  <span className="context-verse-num">{ctx.verse}</span>
                  {ctx.ko}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedDense, setUsedDense] = useState(false);
  const [usedGemini, setUsedGemini] = useState(false);
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      const data: SearchResponse = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? "검색 중 오류가 발생했습니다.");
        return;
      }

      setResults(data.results);
      setUsedDense(data.usedDense);
      setUsedGemini(data.usedGemini ?? false);
      setExpandedQuery(data.expanded_query ?? null);
      setEmotions(data.emotions ?? []);
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveTag(null);
    setExpandedQuery(null);
    setEmotions([]);
    search(query);
  };

  const handleTagClick = (tag: (typeof TAGS)[0]) => {
    setActiveTag(tag.label);
    setQuery(tag.query);
    setExpandedQuery(null);
    setEmotions([]);
    search(tag.query);
  };

  return (
    <>
      {/* Stars background */}
      <div className="stars-bg" aria-hidden="true" />

      <main className="page">
        {/* Header */}
        <header className="header">
          <h1 className="header-logo">LOGOS</h1>
          <p className="header-subtitle">성경구절 시맨틱 검색</p>
          <div className="header-divider" />
        </header>

        {/* Search */}
        <div className="search-container">
          <form onSubmit={handleSubmit} className="search-box" role="search">
            <input
              ref={inputRef}
              id="search-input"
              className="search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="감정이나 상황을 자유롭게 입력하세요 — 힘들어요, 감사해요, 두려워요..."
              autoComplete="off"
              aria-label="성경 구절 검색"
            />
            <button
              type="submit"
              id="search-btn"
              className="search-btn"
              disabled={loading || !query.trim()}
              aria-label="검색"
            >
              {loading ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </form>

          {/* Tag chips */}
          <p className="tags-label">주제별 빠른 검색</p>
          <div className="tags-row" role="list">
            {TAGS.map((tag) => (
              <button
                key={tag.label}
                className={`tag-chip ${activeTag === tag.label ? "active" : ""}`}
                onClick={() => handleTagClick(tag)}
                role="listitem"
                aria-pressed={activeTag === tag.label}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="loading-container" role="status" aria-live="polite">
            <div className="loading-spinner" aria-hidden="true" />
            <p className="loading-text">말씀을 찾고 있습니다...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="state-box" role="alert">
            <div className="state-icon">⚠️</div>
            <p className="state-title">{error}</p>
            <p className="state-desc">잠시 후 다시 시도해주세요.</p>
          </div>
        )}

        {/* Results */}
        {results && !loading && !error && (
          <>
            {results.length === 0 ? (
              <div className="state-box">
                <div className="state-icon">🔍</div>
                <p className="state-title">검색 결과가 없습니다</p>
                <p className="state-desc">다른 단어나 표현으로 검색해보세요.</p>
              </div>
            ) : (
              <>
                <p className="results-header">
                  <span>&ldquo;{query}&rdquo;</span> 관련 구절{" "}
                  {usedGemini ? "· AI 추천" : usedDense ? "· 의미 기반" : "· 키워드 검색"}
                </p>
                {expandedQuery && (
                  <p style={{
                    width: "100%",
                    maxWidth: "720px",
                    marginBottom: "12px",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                  }}>
                    <span style={{ color: "var(--gold)", marginRight: "6px" }}>✦ 성경 언어로 변환:</span>
                    {expandedQuery}
                  </p>
                )}
                {emotions.length > 0 && (
                  <div style={{
                    width: "100%",
                    maxWidth: "720px",
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                    marginBottom: "20px",
                  }}>
                    {emotions.map(e => (
                      <span key={e} style={{
                        fontSize: "0.72rem",
                        padding: "3px 10px",
                        borderRadius: "100px",
                        background: "rgba(139,92,246,0.12)",
                        border: "1px solid rgba(139,92,246,0.25)",
                        color: "#a78bfa",
                      }}>{e}</span>
                    ))}
                  </div>
                )}
                <ul className="results-list" aria-label="검색 결과">
                  {results.map((result, i) => (
                    <li key={result.key} style={{ listStyle: "none" }}>
                      <VerseCard result={result} delay={i * 80} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {/* Welcome screen */}
        {!results && !loading && !error && (
          <div className="welcome" aria-label="환영 메시지">
            <p className="welcome-verse">
              &ldquo;너희가 전심으로 나를 찾고 찾으면 나를 만나리라&rdquo;
            </p>
            <p className="welcome-ref">— 예레미야 29:13</p>
            <div className="welcome-divider" />
            <p className="welcome-hint">
              마음의 상태, 감정, 기도 제목을 자유롭게 입력하세요.<br />
              AI가 성경 전체에서 가장 관련 있는 말씀을 찾아드립니다.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
