"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Search, Loader2, BookOpen, Shuffle } from "lucide-react";
import {
  getUsedPassagesStore,
  type RandomPassageResponse,
} from "@/lib/usedPassagesStore";
import { createClient } from "@/lib/supabase/client";
import { RandomPassageCard } from "@/components/RandomPassageCard";
import { SearchPassageCard, type SearchPassage } from "@/components/SearchPassageCard";

interface SearchResponse {
  query: string;
  expanded_query?: string | null;
  emotions?: string[];
  biblical_keywords?: string[];
  total: number;
  usedDense: boolean;
  usedGemini: boolean;
  results: SearchPassage[];
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

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPassage[] | null>(null);
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

  const [authenticated, setAuthenticated] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [random, setRandom] = useState<RandomPassageResponse | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      // Supabase 미설정 — 익명 모드로 동작.
      setAuthenticated(false);
      setAuthLoaded(true);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setAuthenticated(!!data.user);
      setAuthLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchRandom = useCallback(async () => {
    setRandomLoading(true);
    setRandomError(null);
    setResults(null);
    setError(null);
    try {
      const store = getUsedPassagesStore(authenticated);
      const data = await store.fetchRandom();
      setRandom(data);
    } catch (e) {
      setRandomError(e instanceof Error ? e.message : "랜덤 추천 실패");
    } finally {
      setRandomLoading(false);
    }
  }, [authenticated]);

  const togglePassageUsed = useCallback(
    async (passage_id: string, used: boolean) => {
      const store = getUsedPassagesStore(authenticated);
      await store.toggle(passage_id, used);
    },
    [authenticated],
  );

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
    setRandom(null);
    search(query);
  };

  const handleTagClick = (tag: (typeof TAGS)[0]) => {
    setActiveTag(tag.label);
    setQuery(tag.query);
    setRandom(null);
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
          <div className="flex flex-wrap gap-1.5 mb-4">
            {TAGS.map((tag) => (
              <button
                key={tag.label}
                onClick={() => handleTagClick(tag)}
                className={`text-[0.78rem] px-3 py-1.5 rounded-full border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${activeTag === tag.label
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground bg-card hover:border-empathy hover:text-foreground hover:-translate-y-px"
                  }`}
              >
                {tag.label}
              </button>
            ))}
          </div>

          {/* Random recommendation */}
          <div className="flex items-center gap-2 mb-8">
            <button
              onClick={fetchRandom}
              disabled={randomLoading || !authLoaded}
              className="inline-flex items-center gap-1.5 text-[0.78rem] px-3 py-1.5 rounded-full border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:border-empathy hover:-translate-y-px active:scale-[0.98] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:opacity-50"
            >
              {randomLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Shuffle size={12} />
              )}
              랜덤 추천
            </button>
            <span className="text-[0.7rem] text-muted-foreground">
              한 단락을 무작위로 보여드려요
            </span>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground animate-fade-in">
            <Loader2 size={28} className="animate-spin text-primary/60" />
            <p className="text-sm">말씀을 찾고 있습니다...</p>
          </div>
        )}

        {/* Random loading */}
        {randomLoading && !loading && (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground animate-fade-in">
            <Loader2 size={28} className="animate-spin text-primary/60" />
            <p className="text-sm">말씀을 뽑고 있습니다...</p>
          </div>
        )}

        {/* Random result */}
        {random && !randomLoading && !loading && !results && (
          <div className="animate-fade-in space-y-3">
            {random.was_reset && (
              <div className="text-[0.78rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                모든 말씀을 한 번씩 만나셨어요. 처음부터 다시 시작합니다.
              </div>
            )}
            <RandomPassageCard
              key={random.passage.id}
              passage={random.passage}
              onToggle={(used) => togglePassageUsed(random.passage.id, used)}
            />
            <p className="text-[0.7rem] text-muted-foreground text-right">
              {random.used_count}/{random.total_passages} 단락 사용됨
              {random.anonymous ? " · 이 기기에 저장 중" : " · 디바이스 동기화"}
            </p>
          </div>
        )}

        {/* Random error */}
        {randomError && !randomLoading && (
          <div className="text-center py-12 animate-fade-in">
            <p className="text-muted-foreground text-sm">{randomError}</p>
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
                          className="text-[0.7rem] px-2.5 py-0.5 rounded-full bg-empathy/8 border border-empathy/20 text-empathy"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {results.map((result, i) => (
                    <SearchPassageCard key={result.id} passage={result} index={i} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Welcome */}
        {!results && !loading && !error && !random && !randomLoading && !randomError && (
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