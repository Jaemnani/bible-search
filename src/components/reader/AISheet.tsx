"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Sparkles, Scale, Loader2, Info } from "lucide-react";

export interface AIVerse {
  key: string; book_ko: string; chapter: number; verse: number; ko: string;
}

type Mode = "ask" | "cross";

// P3 껍데기: 질문/교차검증 UI + /api/ai/* 호출 경로. 코어(LLM) 미구현 → 서버가 coming_soon 반환.
export function AISheet({ mode, verse, onClose }: { mode: Mode; verse: AIVerse; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);

  const ref = `${verse.book_ko} ${verse.chapter}:${verse.verse}`;

  async function run() {
    setLoading(true); setMsg(null); setModels([]);
    try {
      if (mode === "ask") {
        const r = await fetch("/api/ai/ask", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verseRef: verse.key, verseText: verse.ko, question }),
        });
        const d = await r.json();
        setMsg(d.message ?? d.error ?? "응답을 받지 못했습니다.");
      } else {
        const r = await fetch("/api/ai/cross-check", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verseRef: verse.key, verseText: verse.ko, prompt }),
        });
        const d = await r.json();
        setModels(d.planned_models ?? []);
        setMsg(d.message ?? d.error ?? "응답을 받지 못했습니다.");
      }
    } catch {
      setMsg("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
            {mode === "ask" ? <Sparkles size={15} className="text-primary" /> : <Scale size={15} className="text-primary" />}
            {mode === "ask" ? "AI 질문" : "AI 교차검증"} · {ref}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <p className="mb-3 rounded bg-gray-50 px-3 py-2 text-sm text-gray-500">{verse.ko}</p>

        {mode === "ask" ? (
          <textarea
            value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} autoFocus
            placeholder="이 구절에 대해 궁금한 점을 물어보세요…"
            className="w-full resize-none rounded-md border border-gray-200 p-3 text-sm focus:border-primary focus:outline-none"
          />
        ) : (
          <Input
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="(선택) 비교 관점 — 예: 원어 의미, 다른 번역과 비교"
            className="h-10"
          />
        )}

        <Button onClick={run} disabled={loading || (mode === "ask" && !question.trim())} className="mt-3 w-full">
          {loading ? <Loader2 size={16} className="animate-spin" /> : mode === "ask" ? "질문하기" : "교차검증 실행"}
        </Button>

        {/* 교차검증 모델 자리표시(껍데기) */}
        {mode === "cross" && models.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {models.map((m) => (
              <div key={m} className="rounded-lg border border-dashed border-gray-300 p-3">
                <div className="mb-1 text-xs font-semibold text-gray-600">{m}</div>
                <div className="text-xs text-gray-400">준비 중…</div>
              </div>
            ))}
          </div>
        )}

        {/* coming_soon 안내 */}
        {msg && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-primary">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>{msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
