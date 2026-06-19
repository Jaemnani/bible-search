"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Play, SkipBack, SkipForward, NotebookPen, X, Loader2, Volume2 } from "lucide-react";

export interface ListenVerse {
  key: string; book_ko: string; chapter: number; verse: number; ko: string;
}

// P4 껍데기: 듣기 컨트롤 + "메모하며 듣기"(분할/PiP 개념). 오디오 코어는 /api/audio 후속에서.
// 지금은 재생 시 /api/audio 호출 → coming_soon 안내. url 이 채워지면 <audio> 로 재생(아래 TODO).
export function ListenBar({
  verse, hasPrev, hasNext, onPrev, onNext, onClose, onMemo,
}: {
  verse: ListenVerse;
  hasPrev: boolean; hasNext: boolean;
  onPrev: () => void; onNext: () => void; onClose: () => void;
  onMemo: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 절 바뀌면 상태 초기화
  useEffect(() => { setStatus(null); }, [verse.key]);

  async function play() {
    setLoading(true); setStatus(null);
    try {
      const r = await fetch(`/api/audio?verseRef=${encodeURIComponent(verse.key)}&voice=default`);
      const d = await r.json();
      if (d.url) {
        // TODO(P4-core): 실제 재생
        if (audioRef.current) { audioRef.current.src = d.url; await audioRef.current.play(); }
      } else {
        setStatus(d.message ?? "오디오를 불러오지 못했습니다.");
      }
    } catch {
      setStatus("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/20 bg-white shadow-2xl">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Headphones size={14} /> {verse.book_ko} {verse.chapter}:{verse.verse}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" title="듣기 종료"><X size={16} /></button>
        </div>

        <p className="mb-2 truncate text-sm text-gray-600">{verse.ko}</p>

        <div className="flex items-center gap-2">
          <button onClick={onPrev} disabled={!hasPrev} className="rounded-md p-2 text-gray-600 hover:bg-black/5 disabled:opacity-30" title="이전 절"><SkipBack size={18} /></button>
          <button onClick={play} disabled={loading} className="rounded-full bg-primary p-3 text-primary-foreground hover:bg-primary/90 disabled:opacity-60" title="재생">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          </button>
          <button onClick={onNext} disabled={!hasNext} className="rounded-md p-2 text-gray-600 hover:bg-black/5 disabled:opacity-30" title="다음 절"><SkipForward size={18} /></button>

          <span className="ml-1 flex items-center gap-1 text-[0.72rem] text-gray-400"><Volume2 size={13} /> 기본 음성</span>

          <button onClick={onMemo} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-[0.78rem] text-primary hover:bg-primary/10">
            <NotebookPen size={14} /> 메모하며 듣기
          </button>
        </div>

        {status && <p className="mt-2 text-center text-xs text-primary/80">{status}</p>}
        <audio ref={audioRef} hidden />
      </div>
    </div>
  );
}
