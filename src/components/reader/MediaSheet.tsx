"use client";

import { useEffect, useState } from "react";
import { X, Video, BookOpen, Loader2, Info } from "lucide-react";

export interface MediaVerse { key: string; book_ko: string; chapter: number; verse: number }
interface MediaItem {
  type: "video" | "book";
  title: string;
  url: string;
  thumb?: string;
  source?: string;
  scope?: "verse" | "chapter" | "book";
}

// P5-core: 구절별 설교영상·책. 서버가 절→장→권 순으로 되짚어 조회한 결과를 렌더링한다.
// 썸네일은 공식 URL 핫링크라 next/image 최적화 대상이 아니다(외부 도메인 재호스팅 금지) → <img> 사용.
const SCOPE_LABEL: Record<string, string> = { verse: "이 절", chapter: "이 장", book: "이 책" };

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
        setMsg(d.media?.length ? null : (d.message ?? d.error ?? "결과가 없습니다."));
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
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">설교·책 · {verse.book_ko} {verse.chapter}:{verse.verse}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <MediaSection icon={<Video size={14} />} title="설교영상" items={videos} />
            <MediaSection icon={<BookOpen size={14} />} title="추천 도서" items={books} />
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

function MediaSection({ icon, title, items }: { icon: React.ReactNode; title: string; items: MediaItem[] }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600">{icon} {title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">아직 없음</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <a
              key={it.url}
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md border border-gray-100 p-2 transition-colors hover:border-empathy"
            >
              {it.thumb && (
                // eslint-disable-next-line @next/next/no-img-element -- 공식 썸네일 핫링크(재호스팅 금지)
                <img src={it.thumb} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded object-cover" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-700">{it.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-gray-400">
                  {it.source && <span className="truncate">{it.source}</span>}
                  {it.scope && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px">{SCOPE_LABEL[it.scope] ?? ""}</span>
                  )}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
