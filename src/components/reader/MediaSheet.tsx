"use client";

import { useEffect, useState } from "react";
import { X, Video, BookOpen, Loader2, Info } from "lucide-react";

export interface MediaVerse { key: string; book_ko: string; chapter: number; verse: number }
interface MediaItem { type: "video" | "book"; title: string; url: string; thumb?: string; source?: string }

// P5 껍데기: 구절별 설교영상·책. /api/verse-media 호출 → 크롤 데이터 적재 전엔 coming_soon.
export function MediaSheet({ verse, onClose }: { verse: MediaVerse; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/verse-media?verseRef=${encodeURIComponent(verse.key)}`);
        const d = await r.json();
        if (!alive) return;
        setItems(d.media ?? []);
        setMsg(d.media?.length ? null : (d.message ?? "결과가 없습니다."));
      } catch {
        if (alive) setMsg("서버에 연결할 수 없습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [verse.key]);

  const videos = items.filter((i) => i.type === "video");
  const books = items.filter((i) => i.type === "book");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">설교·책 · {verse.book_ko} {verse.chapter}:{verse.verse}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600"><Video size={14} /> 설교영상</div>
              {videos.length === 0 ? <p className="text-xs text-gray-400">아직 없음</p> : (
                <div className="space-y-1.5">
                  {videos.map((v, i) => (
                    <a key={i} href={v.url} target="_blank" rel="noopener noreferrer" className="block rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-700 hover:border-primary/40">
                      {v.title} {v.source && <span className="text-xs text-gray-400">· {v.source}</span>}
                    </a>
                  ))}
                </div>
              )}
            </section>
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600"><BookOpen size={14} /> 추천 도서</div>
              {books.length === 0 ? <p className="text-xs text-gray-400">아직 없음</p> : (
                <div className="space-y-1.5">
                  {books.map((b, i) => (
                    <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="block rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-700 hover:border-primary/40">
                      {b.title} {b.source && <span className="text-xs text-gray-400">· {b.source}</span>}
                    </a>
                  ))}
                </div>
              )}
            </section>
            {msg && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-primary">
                <Info size={15} className="mt-0.5 shrink-0" /><span>{msg}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
