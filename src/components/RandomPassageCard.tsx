"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Heart, Check, Loader2 } from "lucide-react";
import type { HydratedPassageDTO } from "@/lib/usedPassagesStore";

interface Props {
  passage: HydratedPassageDTO;
  onToggle: (used: boolean) => Promise<void>;
}

export function RandomPassageCard({ passage, onToggle }: Props) {
  const [used, setUsed] = useState(passage.is_used);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const next = !used;
    setUsed(next);
    setPending(true);
    setError(null);
    try {
      await onToggle(next);
    } catch (e) {
      setUsed(!next);
      setError(e instanceof Error ? e.message : "갱신 실패");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="animate-fade-up border-border/60 bg-card hover:border-primary/30 transition-all duration-300">
      <CardContent className="p-6">
        {/* Range + badges */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <span className="font-semibold text-primary text-sm">
            {passage.range_label}
          </span>
          <div className="flex gap-1.5 shrink-0">
            <Badge
              variant="outline"
              className={
                passage.testament === "OT"
                  ? "text-violet-400 border-violet-400/30 bg-violet-400/5 text-[10px] px-2 py-0"
                  : "text-sky-400 border-sky-400/30 bg-sky-400/5 text-[10px] px-2 py-0"
              }
            >
              {passage.testament === "OT" ? "구약" : "신약"}
            </Badge>
            {passage.genre && (
              <Badge
                variant="outline"
                className="text-primary/70 border-primary/20 bg-primary/5 text-[10px] px-2 py-0"
              >
                {passage.genre}
              </Badge>
            )}
          </div>
        </div>

        {/* Theme title */}
        {passage.theme_title && (
          <h3 className="text-base font-semibold text-primary/90 mb-3 font-serif">
            {passage.theme_title}
          </h3>
        )}

        {/* Verses */}
        <div className="space-y-1.5 mb-4">
          {passage.verses.map((v) => (
            <p
              key={v.verse}
              className="text-foreground/90 text-[1rem] leading-[1.95] font-serif word-break-keep-all"
            >
              <span className="text-primary/60 font-semibold mr-2 text-xs align-top">
                {v.verse}
              </span>
              {v.ko}
            </p>
          ))}
        </div>

        {/* Characteristics */}
        {passage.characteristics.length > 0 && (
          <>
            <Separator className="my-4 bg-border/50" />
            <div className="mb-3">
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
          </>
        )}

        {/* Core meaning */}
        {passage.core_meaning && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-xs text-primary/70 mb-2">
              <Heart size={12} />
              <span className="font-semibold tracking-wide">핵심 의미</span>
            </div>
            <p className="text-[0.9rem] text-foreground/80 leading-relaxed pl-3 border-l-2 border-primary/30">
              {passage.core_meaning}
            </p>
          </div>
        )}

        <Separator className="my-3 bg-border/40" />

        {/* Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] text-muted-foreground">
            {used ? "이 단락을 읽었어요" : "아직 표시하지 않은 단락"}
          </span>
          <Button
            type="button"
            variant={used ? "default" : "outline"}
            size="sm"
            onClick={handleToggle}
            disabled={pending}
            className={
              used
                ? "bg-primary/90 text-primary-foreground hover:bg-primary"
                : "border-border text-foreground"
            }
          >
            {pending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : used ? (
              <Check size={12} />
            ) : null}
            {used ? "사용 취소" : "사용함으로 표시"}
          </Button>
        </div>

        {error && (
          <p className="text-[0.7rem] text-red-400 mt-2 text-right">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
