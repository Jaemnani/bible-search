"use client";

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Search, Loader2, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

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

const TAGS = [
  { label: "위로가 필요해", query: "힘들고 외로울 때 위로와 평안" },
  { label: "용기를 주세요", query: "두려움을 이기는 용기와 담대함" },
  { label: "하나님의 사랑", query: "하나님의 사랑과 은혜" },
  { label: "감사와 찬양", query: "감사와 찬양 기쁨" },
  { label: "평안과 안식", query: "마음의 평안과 안식" },
  { label: "믿음과 소망", query: "믿음과 소망 확신" },
  { label: "시련을 이겨내", query: "고난과 시련을 이겨내는 힘" },
  { label: "지혜를 구해", query: "지혜와 인도하심을 구함" },
  { label: "용서와 화해", query: "용서와 화해 사랑" },
  { label: "새 힘 주세요", query: "지치고 힘들 때 새 힘과 회복" },
];

function VerseCard({ result, index }: { result: SearchResult; index: number }) {
  const [showContext, setShowContext] = useState(false);
  const [showEn, setShowEn] = useState(false);

  return (
    <Card
      className="animate-fade-up border-border/60 bg-card hover:border-primary/30 transition-all duration-300"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardContent className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground/60 tabular-nums w-4">
              {index + 1}
            </span>
            <div>
              <span className="font-semibold text-primary text-sm">
                {result.book_ko}
              </span>
              <span className="text-muted-foreground text-sm ml-1.5">
                {result.chapter}:{result.verse}
              </span>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge
              variant="outline"
              className={
                result.testament === "OT"
                  ? "text-violet-400 border-violet-400/30 bg-violet-400/5 text-[10px] px-2 py-0"
                  : "text-sky-400 border-sky-400/30 bg-sky-400/5 text-[10px] px-2 py-0"
              }
            >
              {result.testament === "OT" ? "구약" : "신약"}
            </Badge>
            <Badge
              variant="outline"
              className="text-primary/70 border-primary/20 bg-primary/5 text-[10px] px-2 py-0"
            >
              {result.genre}
            </Badge>
          </div>
        </div>

        {/* Verse text */}
        <p className="text-foreground/90 text-[1.05rem] leading-[1.95] font-serif word-break-keep-all mb-3">
          {result.ko}
        </p>

        {/* Rerank reason */}
        {result.rerank_reason && (
          <p className="text-[0.78rem] text-primary/70 leading-relaxed mb-3 pl-3 border-l-2 border-primary/30">
            {result.rerank_reason}
          </p>
        )}

        {/* Toggles */}
        <div className="flex gap-3 mt-1">
          {result.en && (
            <button
              onClick={() => setShowEn(!showEn)}
              className="flex items-center gap-1 text-[0.75rem] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showEn ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              NIV
            </button>
          )}
          {result.context && result.context.length > 1 && (
            <button
              onClick={() => setShowContext(!showContext)}
              className="flex items-center gap-1 text-[0.75rem] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showContext ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              문맥
            </button>
          )}
        </div>

        {/* English */}
        {showEn && result.en && (
          <>
            <Separator className="my-3 bg-border/50" />
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              &ldquo;{result.en}&rdquo;
            </p>
          </>
        )}

        {/* Context */}
        {showContext && result.context && (
          <>
            <Separator className="my-3 bg-border/50" />
            <div className="space-y-1.5 pl-3 border-l-2 border-border">
              {result.context.map((ctx) => (
                <p
                  key={ctx.key}
                  className={`text-sm leading-relaxed ${ctx.verse === result.verse
                      ? "text-foreground/90 font-medium"
                      : "text-muted-foreground"
                    }`}
                >
                  <span className="text-primary/60 font-semibold mr-2 text-xs">
                    {ctx.verse}
                  </span>
                  {ctx.ko}
                </p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    usedDense: boolean;
    usedGemini: boolean;
    expandedQuery: string | null;
    emotions: string[];
  } | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setMeta(null);
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
      setMeta({
        usedDense: data.usedDense,
        usedGemini: data.usedGemini ?? false,
        expandedQuery: data.expanded_query ?? null,
        emotions: data.emotions ?? [],
      });
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActiveTag(null);
    search(query);
  };

  const handleTagClick = (tag: (typeof TAGS)[0]) => {
    setActiveTag(tag.label);
    setQuery(tag.query);
    search(tag.query);
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 pb-24">

        {/* Header */}
        <header className="text-center mb-10 animate-fade-up">
          <div className="flex items-center justify-center gap-2 mb-3">
            <BookOpen className="text-primary" size={22} />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              말씀곳간
            </h1>
          </div>
          <p className="text-sm text-muted-foreground tracking-widest">
            성경구절 의미 검색
          </p>
          <Separator className="mt-5 bg-border/50" />
        </header>

        {/* Search */}
        <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
          <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="감정이나 상황을 자유롭게 입력하세요..."
              className="bg-input border-border focus-visible:ring-primary/40 h-11 text-base"
              autoComplete="off"
            />
            <Button
              type="submit"
              disabled={loading || !query.trim()}
              className="h-11 px-5 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
            >
              {loading
                ? <Loader2 size={16} className="animate-spin" />
                : <Search size={16} />
              }
            </Button>
          </form>

          {/* Tag chips */}
          <div className="flex flex-wrap gap-1.5 mb-8">
            {TAGS.map((tag) => (
              <button
                key={tag.label}
                onClick={() => handleTagClick(tag)}
                className={`text-[0.78rem] px-3 py-1.5 rounded-full border transition-all duration-200 ${activeTag === tag.label
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-accent"
                  }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground animate-fade-in">
            <Loader2 size={28} className="animate-spin text-primary/60" />
            <p className="text-sm">말씀을 찾고 있습니다...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-16 animate-fade-in">
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        )}

        {/* Results */}
        {results && !loading && !error && (
          <div className="animate-fade-in">
            {results.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground text-sm">검색 결과가 없습니다.</p>
              </div>
            ) : (
              <>
                {/* Meta info */}
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground/70 font-medium">&ldquo;{query}&rdquo;</span>
                    {" "}— {meta?.usedGemini ? "AI 추천" : meta?.usedDense ? "의미 기반 검색" : "키워드 검색"}
                  </p>
                  {meta?.emotions && meta.emotions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {meta.emotions.map((e) => (
                        <span
                          key={e}
                          className="text-[0.7rem] px-2.5 py-0.5 rounded-full bg-violet-400/8 border border-violet-400/20 text-violet-400/80"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {results.map((result, i) => (
                    <VerseCard key={result.key} result={result} index={i} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Welcome */}
        {!results && !loading && !error && (
          <div className="text-center py-16 animate-fade-in space-y-4">
            <p className="font-serif text-lg text-foreground/60 italic leading-relaxed">
              &ldquo;너희가 전심으로 나를 찾고 찾으면 나를 만나리라&rdquo;
            </p>
            <p className="text-xs text-primary/60 tracking-widest uppercase">
              예레미야 29:13
            </p>
            <Separator className="w-12 mx-auto bg-border/40 mt-6" />
            <p className="text-sm text-muted-foreground leading-relaxed mt-4">
              마음의 상태, 감정, 기도 제목을 자유롭게 입력하세요.
              <br />
              AI가 성경 전체에서 가장 관련 있는 말씀을 찾아드립니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}