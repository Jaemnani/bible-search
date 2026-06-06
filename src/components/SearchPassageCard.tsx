"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Heart, ChevronDown, ChevronUp } from "lucide-react";

export interface SearchPassage {
  id: string;
  range_label: string;
  book_ko: string;
  book_en: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  testament: string;
  genre: string;
  theme_title: string;
  characteristics: string[];
  core_meaning: string;
  emotion_tags: string[];
  need_tags: string[];
  verses: { verse: number; ko: string; en: string }[];
  anchor_verse: number;
  rerank_reason?: string;
  score: number;
  rank: number;
}

export function SearchPassageCard({
  passage,
  index,
}: {
  passage: SearchPassage;
  index: number;
}) {
  const [showDetail, setShowDetail] = useState(false);

  // 검색에 가장 들어맞는 핵심절을 "주인공"으로, 나머지는 앞뒤 문맥으로.
  const anchor =
    passage.verses.find((v) => v.verse === passage.anchor_verse) ?? passage.verses[0];
  const context = passage.verses.filter((v) => v.verse !== anchor?.verse);

  return (
    <Card
      className="animate-fade-up lift-hover"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardContent className="p-6">
        {/* Header: rank + range + badges */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground/60 tabular-nums w-4">
              {index + 1}
            </span>
            <span className="font-semibold text-primary text-sm">
              {passage.range_label}
            </span>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge
              variant="outline"
              className={
                passage.testament === "OT"
                  ? "text-violet-600 border-violet-200 bg-violet-50 text-[10px] px-2 py-0"
                  : "text-sky-600 border-sky-200 bg-sky-50 text-[10px] px-2 py-0"
              }
            >
              {passage.testament === "OT" ? "구약" : "신약"}
            </Badge>
            {passage.genre && (
              <Badge
                variant="outline"
                className="text-primary border-primary/20 bg-primary/5 text-[10px] px-2 py-0"
              >
                {passage.genre}
              </Badge>
            )}
          </div>
        </div>

        {/* Theme title (보조 라벨) */}
        {passage.theme_title && (
          <p className="text-[0.82rem] text-muted-foreground mb-3">
            {passage.theme_title}
          </p>
        )}

        {/* 핵심 구절 (주인공) — 검색에 가장 들어맞는 한 절을 헤드라인으로 */}
        {anchor && (
          <div className="rounded-lg bg-empathy/8 ring-1 ring-empathy/20 px-4 py-3.5">
            <div className="text-[11px] font-semibold text-empathy mb-1.5 tracking-wide">
              {passage.book_ko} {passage.chapter}:{anchor.verse}
            </div>
            <p className="text-[1.15rem] leading-[1.85] font-medium text-foreground word-break-keep-all">
              {anchor.ko}
            </p>
          </div>
        )}

        {/* Rerank reason */}
        {passage.rerank_reason && (
          <p className="text-[0.85rem] text-primary leading-relaxed mt-3 pl-3 border-l-2 border-empathy/50">
            {passage.rerank_reason}
          </p>
        )}

        {/* 앞뒤 문맥 (핵심절 제외한 단락) */}
        {context.length > 0 && (
          <div className="mt-3 space-y-1 pl-3 border-l border-border/70">
            <span className="text-[10px] text-muted-foreground/70 font-medium tracking-wide">
              앞뒤 문맥
            </span>
            {context.map((v) => (
              <p
                key={v.verse}
                className="text-[0.9rem] text-muted-foreground leading-[1.8] word-break-keep-all"
              >
                <span className="text-primary/40 font-semibold mr-1.5 text-[11px] align-top">
                  {v.verse}
                </span>
                {v.ko}
              </p>
            ))}
          </div>
        )}

        {/* Detail toggle */}
        <button
          onClick={() => setShowDetail(!showDetail)}
          className="flex items-center gap-1 text-[0.75rem] text-muted-foreground hover:text-foreground transition-colors mt-3"
        >
          {showDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          의미 · 특징 · 영어
        </button>

        {showDetail && (
          <>
            {/* Core meaning */}
            {passage.core_meaning && (
              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-xs text-primary/70 mb-2">
                  <Heart size={12} />
                  <span className="font-semibold tracking-wide">핵심 의미</span>
                </div>
                <p className="text-[0.9rem] text-foreground/80 leading-relaxed pl-3 border-l-2 border-primary/30">
                  {passage.core_meaning}
                </p>
              </div>
            )}

            {/* Characteristics */}
            {passage.characteristics.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-xs text-primary/70 mb-2">
                  <Sparkles size={12} />
                  <span className="font-semibold tracking-wide">특징</span>
                </div>
                <ul className="space-y-1 pl-1">
                  {passage.characteristics.map((c, i) => (
                    <li
                      key={i}
                      className="text-[0.85rem] text-foreground/75 leading-relaxed pl-3 border-l-2 border-primary/20"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* English (NIV) */}
            {passage.verses.some((v) => v.en) && (
              <>
                <Separator className="my-3 bg-border/50" />
                <div className="space-y-1.5">
                  {passage.verses.map((v) => (
                    <p
                      key={v.verse}
                      className="text-sm text-muted-foreground italic leading-relaxed"
                    >
                      <span className="not-italic text-primary/40 font-semibold mr-2 text-xs align-top">
                        {v.verse}
                      </span>
                      {v.en}
                    </p>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
