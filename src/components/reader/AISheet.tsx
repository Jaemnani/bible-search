"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Sparkles, Scale, Loader2, Info, AlertTriangle, BookOpen, Check, GitCompare } from "lucide-react";

export interface AIVerse {
  key: string; book_ko: string; chapter: number; verse: number; ko: string;
}

type Mode = "ask" | "cross";

interface AskAnswer {
  answer: string;
  points: string[];
  related_refs: string[];
  caution: string | null;
}
interface CrossLens { lens: string; label: string; view: string; evidence: string[] }
interface Consensus { agreements: string[]; differences: string[] }

// P3-core: 질문/교차검증. 서버(/api/ai/*)가 무료 티어 Gemini 로 답을 만들고, 여기서는 렌더링만 한다.
// 교차검증은 "서로 다른 관점의 독립 실행" — 응답의 disclaimer 를 그대로 노출해 오해를 막는다.
export function AISheet({ mode, verse, onClose }: { mode: Mode; verse: AIVerse; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [lenses, setLenses] = useState<CrossLens[]>([]);
  const [consensus, setConsensus] = useState<Consensus | null>(null);

  const ref = `${verse.book_ko} ${verse.chapter}:${verse.verse}`;

  async function run() {
    setLoading(true);
    setMsg(null); setAnswer(null); setLenses([]); setConsensus(null); setDisclaimer(null);
    try {
      const url = mode === "ask" ? "/api/ai/ask" : "/api/ai/cross-check";
      const payload = mode === "ask"
        ? { verseRef: verse.key, question }
        : { verseRef: verse.key, prompt };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();

      if (d.disclaimer) setDisclaimer(d.disclaimer);
      if (mode === "ask") {
        if (d.answer) setAnswer(d.answer as AskAnswer);
        else setMsg(d.message ?? d.error ?? "응답을 받지 못했습니다.");
      } else {
        const results = (d.results ?? []) as CrossLens[];
        setLenses(results);
        setConsensus((d.consensus ?? null) as Consensus | null);
        if (results.length === 0) setMsg(d.message ?? d.error ?? "응답을 받지 못했습니다.");
        else if (d.degraded) setMsg(`일부 관점만 응답했습니다 (${d.degradedReason ?? ""}).`);
      }
    } catch {
      setMsg("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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
            value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} autoFocus maxLength={500}
            placeholder="이 구절에 대해 궁금한 점을 물어보세요…"
            className="w-full resize-none rounded-md border border-gray-200 p-3 text-sm focus:border-primary focus:outline-none"
          />
        ) : (
          <Input
            value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={200}
            placeholder="(선택) 비교 관점 — 예: 원어 의미, 다른 번역과 비교"
            className="h-10"
          />
        )}

        <Button onClick={run} disabled={loading || (mode === "ask" && !question.trim())} className="mt-3 w-full">
          {loading ? <Loader2 size={16} className="animate-spin" /> : mode === "ask" ? "질문하기" : "교차검증 실행"}
        </Button>

        {/* --- AI 질문 결과 --- */}
        {answer && (
          <div className="mt-4 space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{answer.answer}</p>

            {answer.points.length > 0 && (
              <ul className="space-y-1.5 rounded-lg bg-gray-50 p-3">
                {answer.points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check size={14} className="mt-1 shrink-0 text-primary" /> <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}

            {answer.related_refs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <BookOpen size={13} className="text-gray-400" />
                {answer.related_refs.map((r) => (
                  <span key={r} className="rounded-full bg-primary/5 px-2.5 py-0.5 text-[0.72rem] text-primary">{r}</span>
                ))}
              </div>
            )}

            {answer.caution && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-gray-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" /> <span>{answer.caution}</span>
              </div>
            )}
          </div>
        )}

        {/* --- 교차검증 결과 --- */}
        {lenses.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {lenses.map((l) => (
                <div key={l.lens} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-1.5 text-xs font-semibold text-primary">{l.label}</div>
                  <p className="text-xs leading-relaxed text-gray-700">{l.view}</p>
                  {l.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                      {l.evidence.map((e, i) => (
                        <li key={i} className="text-[0.7rem] leading-snug text-gray-500">· {e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {consensus && (
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <GitCompare size={13} className="text-primary" /> 관점 비교
                </div>
                {consensus.agreements.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {consensus.agreements.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                        <Check size={12} className="mt-0.5 shrink-0 text-primary" /> <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {consensus.differences.length > 0 && (
                  <ul className="space-y-1">
                    {consensus.differences.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" /> <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {consensus.agreements.length === 0 && consensus.differences.length === 0 && (
                  <p className="text-xs text-gray-500">뚜렷한 합의·이견이 정리되지 않았습니다.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 안내/오류 */}
        {msg && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-primary">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>{msg}</span>
          </div>
        )}
        {disclaimer && (answer || lenses.length > 0) && (
          <p className="mt-3 text-[0.7rem] leading-snug text-gray-400">{disclaimer}</p>
        )}
      </div>
    </div>
  );
}
