"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Headphones, Play, Pause, SkipBack, SkipForward, NotebookPen, X, Loader2, Volume2, Repeat, Check,
} from "lucide-react";
import { loadListen, saveListen, type ListenSettings } from "@/lib/readerStore";
import { listVoices, onVoicesReady, pause as ttsPause, resume as ttsResume, speak, stop as ttsStop, ttsSupported, type TtsVoice } from "@/lib/tts";

export interface ListenVerse {
  key: string; book_ko: string; chapter: number; verse: number; ko: string;
}

const RATES = [0.75, 1, 1.25, 1.5];

type PlayState = "idle" | "loading" | "playing" | "paused";

// P4-core(1): 듣기 + "메모하며 듣기".
// 재생 경로는 두 가지 — /api/audio 가 NAS 캐시 url 을 주면 <audio>, 아니면 기기 내장 음성(무료).
// 자동 진행이 켜져 있으면 한 절이 끝날 때 다음 절로 넘어가며 이어서 읽는다.
export function ListenBar({
  verse, hasPrev, hasNext, onPrev, onNext, onClose, onMemo,
}: {
  verse: ListenVerse;
  hasPrev: boolean; hasNext: boolean;
  onPrev: () => void; onNext: () => void; onClose: () => void;
  onMemo: () => void;
}) {
  const [state, setState] = useState<PlayState>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // 듣기 시작(사용자 조작) 시점에만 마운트되는 컴포넌트라 초기 렌더에서 바로 localStorage 를 읽어도 안전하다.
  const [cfg, setCfg] = useState<ListenSettings>(loadListen);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<"cache" | "device">("device");
  const autoNextRef = useRef(false);   // 자동 진행으로 넘어온 절이면 바로 재생
  const cfgRef = useRef(cfg);          // 콜백 안에서 최신 설정을 읽기 위한 미러
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  useEffect(() => onVoicesReady(setVoices), []);

  const update = useCallback((patch: Partial<ListenSettings>) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      saveListen(next);
      return next;
    });
  }, []);

  const halt = useCallback(() => {
    ttsStop();
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
  }, []);

  const finish = useCallback(() => {
    if (cfgRef.current.autoAdvance && hasNext) {
      autoNextRef.current = true;
      onNext();          // 절이 바뀌면 아래 effect 가 이어서 재생한다
    } else {
      setState("idle");
    }
  }, [hasNext, onNext]);

  const play = useCallback(async () => {
    halt();
    setState("loading");
    setStatus(null);
    try {
      const r = await fetch(`/api/audio?verseRef=${encodeURIComponent(verse.key)}&voice=default`);
      const d = await r.json().catch(() => ({}));

      if (r.ok && typeof d.url === "string" && d.url) {
        // 1) NAS 캐시 mp3
        const a = audioRef.current;
        if (a) {
          modeRef.current = "cache";
          a.src = d.url;
          a.playbackRate = cfgRef.current.rate;
          try {
            await a.play();
            setState("playing");
          } catch {
            setState("idle");
            setStatus("오디오를 재생하지 못했습니다. 다시 눌러주세요.");
          }
          return;
        }
      }

      // 2) 기기 내장 음성 (무료 경로)
      modeRef.current = "device";
      if (!ttsSupported()) {
        setState("idle");
        setStatus("이 브라우저는 음성 읽기를 지원하지 않습니다.");
        return;
      }
      setState("playing");
      // 일부 브라우저는 첫 speak() 직전/직후에야 음성 목록이 채워진다 — 이때 한 번 더 갱신.
      const found = listVoices();
      if (found.length > 0) setVoices(found);
      speak({
        text: verse.ko,
        voiceUri: cfgRef.current.voiceUri,
        rate: cfgRef.current.rate,
        onEnd: finish,
        onError: () => { setState("idle"); setStatus("음성을 재생하지 못했습니다."); },
      });
    } catch {
      setState("idle");
      setStatus("서버에 연결할 수 없습니다.");
    }
  }, [halt, finish, verse.key, verse.ko]);

  // play 는 매 렌더 새 함수(부모가 인라인 핸들러를 넘김) — effect 재실행으로 재생이 끊기지 않도록 ref 로 참조.
  // (이 effect 는 아래 절-변경 effect 보다 먼저 선언해야 최신 play 로 이어읽기가 동작한다)
  const playRef = useRef(play);
  useEffect(() => { playRef.current = play; }, [play]);

  // 절 변경: 재생 중이던 것을 끊고, "이어읽기"로 넘어온 절이면 새 절을 이어서 재생.
  // (상태 전이는 전부 핸들러/콜백에서 — 여기서는 재생 제어만 한다.)
  useEffect(() => {
    halt();
    if (autoNextRef.current) {
      autoNextRef.current = false;
      void playRef.current();
    }
  }, [verse.key, halt]);

  // 언마운트(듣기 종료) 시 반드시 정지 — 배경에서 계속 읽히는 것 방지.
  useEffect(() => () => { ttsStop(); }, []);

  // 이전/다음 절. 재생 중이었다면 새 절도 이어서 재생한다.
  function goto(move: () => void) {
    const wasPlaying = state === "playing" || state === "loading";
    halt();
    setStatus(null);
    if (wasPlaying) autoNextRef.current = true;
    else setState("idle");
    move();
  }

  function toggle() {
    if (state === "playing") {
      if (modeRef.current === "cache") audioRef.current?.pause();
      else ttsPause();
      setState("paused");
    } else if (state === "paused") {
      if (modeRef.current === "cache") void audioRef.current?.play();
      else ttsResume();
      setState("playing");
    } else {
      void play();
    }
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(cfg.rate) + 1) % RATES.length] ?? 1;
    update({ rate: next });
    if (modeRef.current === "cache" && audioRef.current) {
      audioRef.current.playbackRate = next;
    } else if (state === "playing" || state === "paused") {
      void play(); // 기기 음성은 재생 중 속도 변경이 안 되므로 현재 절을 다시 읽는다
    }
  }

  function pickVoice(uri: string | null) {
    update({ voiceUri: uri });
    setVoiceOpen(false);
    if (modeRef.current === "device" && (state === "playing" || state === "paused")) void play();
  }

  const currentVoice = voices.find((v) => v.uri === cfg.voiceUri);

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
          <button onClick={() => goto(onPrev)} disabled={!hasPrev} className="rounded-md p-2 text-gray-600 transition-colors hover:bg-black/5 disabled:opacity-30" title="이전 절"><SkipBack size={18} /></button>

          <button
            onClick={toggle}
            disabled={state === "loading"}
            className="rounded-full bg-primary p-3 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            title={state === "playing" ? "일시정지" : "재생"}
          >
            {state === "loading"
              ? <Loader2 size={18} className="animate-spin" />
              : state === "playing" ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button onClick={() => goto(onNext)} disabled={!hasNext} className="rounded-md p-2 text-gray-600 transition-colors hover:bg-black/5 disabled:opacity-30" title="다음 절"><SkipForward size={18} /></button>

          <button
            onClick={cycleRate}
            className="rounded-md border border-gray-200 px-2 py-1 text-[0.72rem] font-medium text-gray-600 transition-colors hover:border-empathy"
            title="재생 속도"
          >
            {cfg.rate}×
          </button>

          <button
            onClick={() => update({ autoAdvance: !cfg.autoAdvance })}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.72rem] transition-colors ${
              cfg.autoAdvance ? "border-primary/30 bg-primary/5 text-primary" : "border-gray-200 text-gray-500 hover:border-empathy"
            }`}
            title="한 절이 끝나면 다음 절로 이어 읽기"
          >
            <Repeat size={12} /> 이어읽기
          </button>

          <button onClick={onMemo} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-[0.78rem] text-primary transition-colors hover:bg-primary/10">
            <NotebookPen size={14} /> 메모하며 듣기
          </button>
        </div>

        {/* 음성 선택 — 기기에 설치된 음성 목록(무료). DESIGN.md 의 backdrop div 패턴. */}
        {voices.length > 0 && (
          <div className="relative mt-2">
            <button
              onClick={() => setVoiceOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-[0.72rem] text-gray-400 transition-colors hover:text-primary"
              title="음성 선택"
            >
              <Volume2 size={13} /> {currentVoice ? currentVoice.name : "기본 음성"}
            </button>
            {voiceOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVoiceOpen(false)} aria-hidden="true" />
                <div className="absolute bottom-6 left-0 z-50 max-h-56 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-md">
                  <VoiceRow label="기본 음성 (자동)" active={!cfg.voiceUri} onClick={() => pickVoice(null)} />
                  {voices.map((v) => (
                    <VoiceRow
                      key={v.uri}
                      label={`${v.name} · ${v.lang}`}
                      active={cfg.voiceUri === v.uri}
                      onClick={() => pickVoice(v.uri)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {status && <p className="mt-2 text-center text-xs text-primary/80">{status}</p>}
        <audio ref={audioRef} hidden onEnded={finish} onError={() => { setState("idle"); setStatus("오디오를 재생하지 못했습니다."); }} />
      </div>
    </div>
  );
}

function VoiceRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.78rem] transition-colors hover:bg-black/5 ${active ? "text-primary" : "text-gray-600"}`}
    >
      <Check size={12} className={active ? "opacity-100" : "opacity-0"} />
      <span className="truncate">{label}</span>
    </button>
  );
}
