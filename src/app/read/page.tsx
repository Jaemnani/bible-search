"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen, Search, Settings2, Download, ChevronLeft, ChevronRight,
  X, Highlighter, NotebookPen, Brush, Sparkles, Scale, Video, Loader2, Trash2, Headphones, Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DrawingCanvas } from "@/components/reader/DrawingCanvas";
import { AISheet } from "@/components/reader/AISheet";
import { ListenBar } from "@/components/reader/ListenBar";
import { MediaSheet } from "@/components/reader/MediaSheet";
import { SyncBadge } from "@/components/reader/SyncBadge";
import {
  loadHighlights, loadNotes, loadDrawings, saveHighlights, saveNotes, saveDrawings,
  loadSettings, saveSettings, loadPosition, savePosition, exportMarkdown,
  HIGHLIGHT_HEX, DEFAULT_SETTINGS,
  type HighlightColor, type HighlightRec, type NoteRec, type DrawingRec,
  type ReaderSettings, type ReaderLang, type VerseMeta,
} from "@/lib/readerStore";
import { isChosungQuery, matchesChosung } from "@/lib/chosung";

interface BookMeta {
  book_en: string; book_ko: string; testament: "OT" | "NT"; genre: string;
  chapter_count: number; verse_counts: number[]; verse_total: number;
}
interface ReaderVerse {
  key: string; book_en: string; book_ko: string; chapter: number; verse: number; ko: string; en: string;
}
interface VerseHit { key: string; book_ko: string; book_en: string; chapter: number; verse: number; ko: string }

const COLORS: HighlightColor[] = ["yellow", "green", "blue", "pink", "orange"];
// 언어 스위치 순환 순서/라벨 — 한글 → 영어 → 한·영 교대
const LANGS: { value: ReaderLang; label: string; desc: string }[] = [
  { value: "ko", label: "한글", desc: "개역개정" },
  { value: "en", label: "ENG", desc: "NIV" },
  { value: "koen", label: "한·영", desc: "한글/영어 교대" },
];
const THEME_BG: Record<ReaderSettings["theme"], { bg: string; fg: string; sub: string }> = {
  light: { bg: "#ffffff", fg: "#1f2937", sub: "#6b7280" },
  sepia: { bg: "#f4ecd8", fg: "#5b4636", sub: "#8a7355" },
  dark: { bg: "#1a1a1a", fg: "#e5e5e5", sub: "#9ca3af" },
};

export default function ReadPage() {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [cur, setCur] = useState<{ book_en: string; book_ko: string; chapter: number } | null>(null);
  const [verses, setVerses] = useState<ReaderVerse[]>([]);
  const [loadingCh, setLoadingCh] = useState(false);

  const [highlights, setHighlights] = useState<Record<string, HighlightRec>>({});
  const [notes, setNotes] = useState<Record<string, NoteRec>>({});
  const [drawings, setDrawings] = useState<Record<string, DrawingRec>>({});
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);

  const [selKey, setSelKey] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [memoEdit, setMemoEdit] = useState<{ key: string; meta: VerseMeta; value: string } | null>(null);
  const [drawEdit, setDrawEdit] = useState<{ key: string; meta: VerseMeta; png?: string } | null>(null);
  const [aiSheet, setAiSheet] = useState<{ mode: "ask" | "cross"; verse: ReaderVerse } | null>(null);
  const [listenIdx, setListenIdx] = useState<number | null>(null); // null = 듣기 비활성
  const [mediaVerse, setMediaVerse] = useState<ReaderVerse | null>(null);

  const [navBook, setNavBook] = useState<string | null>(null);
  const [navFilter, setNavFilter] = useState(""); // 책 이름 초성/본문 필터 (ㅅㅍ → 시편)
  const [chInput, setChInput] = useState("");     // 장 번호 직접 입력
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<VerseHit[]>([]);
  const [searching, setSearching] = useState(false);
  const pendingVerse = useRef<number | null>(null);

  const booksByEn = useMemo(() => {
    const m: Record<string, BookMeta> = {};
    (books ?? []).forEach((b) => (m[b.book_en] = b));
    return m;
  }, [books]);
  const bookOrder = useMemo(() => {
    const m: Record<string, number> = {};
    (books ?? []).forEach((b, i) => (m[b.book_en] = i));
    return m;
  }, [books]);

  // mount: 로컬 상태 + 책 인덱스 + 시작 위치
  useEffect(() => {
    setHighlights(loadHighlights());
    setNotes(loadNotes());
    setDrawings(loadDrawings());
    setSettings(loadSettings());
    fetch("/data/books_index.json")
      .then((r) => r.json())
      .then((bs: BookMeta[]) => {
        setBooks(bs);
        if (bs.length === 0) return;
        const pos = loadPosition();
        const start = pos && bs.find((b) => b.book_en === pos.book_en)
          ? { book_en: pos.book_en, chapter: pos.chapter }
          : { book_en: bs[0].book_en, chapter: 1 };
        const bk = bs.find((b) => b.book_en === start.book_en)!;
        setCur({ book_en: bk.book_en, book_ko: bk.book_ko, chapter: start.chapter });
        setNavBook(bk.book_en);
      })
      .catch(() => setBooks([]));
  }, []);

  // 장 로드 + 위치 저장
  useEffect(() => {
    if (!cur) return;
    setLoadingCh(true);
    setSelKey(null);
    setListenIdx(null); // 장 이동 시 듣기 종료
    fetch(`/api/reader/chapter?book=${encodeURIComponent(cur.book_en)}&chapter=${cur.chapter}`)
      .then((r) => r.json())
      .then((d) => { setVerses(d.verses ?? []); savePosition({ book_en: cur.book_en, chapter: cur.chapter }); })
      .catch(() => setVerses([]))
      .finally(() => setLoadingCh(false));
  }, [cur]);

  // 장 로드 후 검색에서 넘어온 절로 스크롤
  useEffect(() => {
    if (!loadingCh && pendingVerse.current != null) {
      const el = document.getElementById(`v-${pendingVerse.current}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingVerse.current = null;
    }
  }, [loadingCh, verses]);

  const goTo = useCallback((book_en: string, chapter: number, verse?: number) => {
    const bk = booksByEn[book_en];
    if (!bk) return;
    pendingVerse.current = verse ?? null;
    setCur({ book_en, book_ko: bk.book_ko, chapter });
    setNavOpen(false); setSearchOpen(false);
    window.scrollTo({ top: 0 });
  }, [booksByEn]);

  // 이전/다음 장 (책 경계 넘어감)
  const step = useCallback((dir: 1 | -1) => {
    if (!cur || !books) return;
    const bk = booksByEn[cur.book_en];
    let ci = books.indexOf(bk);
    let ch = cur.chapter + dir;
    if (ch < 1) { ci -= 1; if (ci < 0) return; ch = books[ci].chapter_count; }
    else if (ch > bk.chapter_count) { ci += 1; if (ci >= books.length) return; ch = 1; }
    goTo(books[ci].book_en, ch);
  }, [cur, books, booksByEn, goTo]);

  function metaOf(v: ReaderVerse): VerseMeta {
    return { book_en: v.book_en, book_ko: v.book_ko, chapter: v.chapter, verse: v.verse, ko: v.ko };
  }
  function setHighlight(v: ReaderVerse, color: HighlightColor) {
    const next = { ...highlights };
    if (next[v.key]?.color === color) delete next[v.key];
    else next[v.key] = { color, meta: metaOf(v), updated: Date.now() };
    setHighlights(next); saveHighlights(next);
  }
  function saveMemo() {
    if (!memoEdit) return;
    const next = { ...notes };
    if (memoEdit.value.trim()) next[memoEdit.key] = { md: memoEdit.value, meta: memoEdit.meta, updated: Date.now() };
    else delete next[memoEdit.key];
    setNotes(next); saveNotes(next); setMemoEdit(null);
  }
  function saveDrawing(png: string) {
    if (!drawEdit) return;
    const next = { ...drawings, [drawEdit.key]: { png, meta: drawEdit.meta, updated: Date.now() } };
    setDrawings(next); saveDrawings(next); setDrawEdit(null);
  }
  function removeDrawing(key: string) {
    const next = { ...drawings }; delete next[key];
    setDrawings(next); saveDrawings(next);
  }

  const doSearch = useCallback(async (query: string) => {
    const t = query.trim();
    if (!t) { setHits([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/reader/search?q=${encodeURIComponent(t)}`);
      const d = await r.json();
      setHits(d.hits ?? []);
    } catch { setHits([]); } finally { setSearching(false); }
  }, []);

  function doExport() {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const md = exportMarkdown(bookOrder, dateStr);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `말씀곳간_노트_${dateStr}.md`; a.click();
    URL.revokeObjectURL(url);
  }

  function patchSettings(p: Partial<ReaderSettings>) {
    const next = { ...settings, ...p };
    setSettings(next); saveSettings(next);
  }

  // 필터 파싱 — "ㅅㅍ 23" 처럼 뒤에 장 번호를 붙이면 이름/장으로 분리
  const navParsed = useMemo(() => {
    const m = navFilter.trim().match(/^(.*?)\s*(\d+)?$/);
    return { name: (m?.[1] ?? "").trim(), num: m?.[2] ? parseInt(m[2], 10) : null };
  }, [navFilter]);

  // 책 필터 — 초성 쿼리(ㅅㅍ)는 초성 매칭, 그 외는 한글/영문 이름 부분일치
  const filteredBooks = useMemo(() => {
    if (!books) return [];
    const f = navParsed.name;
    if (!f) return books;
    if (isChosungQuery(f)) return books.filter((b) => matchesChosung(f, b.book_ko));
    const lower = f.toLowerCase();
    return books.filter((b) => b.book_ko.includes(f) || b.book_en.toLowerCase().includes(lower));
  }, [books, navParsed.name]);

  // 필터 결과가 하나로 좁혀지면 자동 선택 → 바로 장 번호 입력 가능
  useEffect(() => {
    if (navOpen && navParsed.name && filteredBooks.length === 1) {
      setNavBook(filteredBooks[0].book_en);
    }
  }, [navOpen, navParsed.name, filteredBooks]);

  // 필터 입력에서 Enter — "ㅅㅍ 23" 이면 시편 23장으로 바로 이동
  function submitNavFilter(e: React.FormEvent) {
    e.preventDefault();
    if (filteredBooks.length !== 1) return;
    const bk = filteredBooks[0];
    if (navParsed.num != null) goTo(bk.book_en, Math.min(Math.max(1, navParsed.num), bk.chapter_count));
    else setNavBook(bk.book_en);
  }

  const navBookMeta = navBook ? booksByEn[navBook] : undefined;
  function submitChapter(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(chInput, 10);
    if (!navBook || !navBookMeta || !Number.isInteger(n)) return;
    goTo(navBook, Math.min(Math.max(1, n), navBookMeta.chapter_count));
  }

  const theme = THEME_BG[settings.theme];
  const selVerse = verses.find((v) => v.key === selKey) ?? null;

  return (
    <div className="min-h-dvh" style={{ backgroundColor: theme.bg, color: theme.fg }}>
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-2 backdrop-blur"
        style={{ backgroundColor: `${theme.bg}ee`, borderColor: `${theme.sub}33` }}>
        <Link href="/" className="shrink-0 opacity-70 hover:opacity-100" title="홈"><BookOpen size={18} /></Link>
        <button onClick={() => { setNavBook(cur?.book_en ?? null); setNavFilter(""); setChInput(""); setNavOpen(true); }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-black/5">
          {cur ? `${cur.book_ko} ${cur.chapter}장` : "불러오는 중…"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <SyncBadge />
          <button
            onClick={() => {
              const i = LANGS.findIndex((l) => l.value === settings.lang);
              patchSettings({ lang: LANGS[(i + 1) % LANGS.length].value });
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold hover:bg-black/5"
            title={`본문 언어 (현재: ${LANGS.find((l) => l.value === settings.lang)?.label})`}>
            <Languages size={15} />
            {LANGS.find((l) => l.value === settings.lang)?.label}
          </button>
          <button onClick={() => { if (verses.length) { setSelKey(null); setListenIdx(0); } }} className="rounded-md p-2 hover:bg-black/5" title="말씀 듣기"><Headphones size={17} /></button>
          <button onClick={() => setSearchOpen(true)} className="rounded-md p-2 hover:bg-black/5" title="검색"><Search size={17} /></button>
          <button onClick={() => setSetOpen(true)} className="rounded-md p-2 hover:bg-black/5" title="설정"><Settings2 size={17} /></button>
          <button onClick={doExport} className="rounded-md p-2 hover:bg-black/5" title="노트 .md 내보내기"><Download size={17} /></button>
        </div>
      </header>

      {/* Chapter body */}
      <main className="mx-auto max-w-2xl px-5 pb-32 pt-6">
        {loadingCh ? (
          <div className="flex justify-center py-24" style={{ color: theme.sub }}><Loader2 className="animate-spin" /></div>
        ) : (
          <div style={{ fontSize: settings.fontSize, lineHeight: 1.9 }}>
            {verses.map((v) => {
              const hl = highlights[v.key];
              const hasNote = !!notes[v.key];
              const hasDraw = !!drawings[v.key];
              const isSel = selKey === v.key;
              return (
                <p key={v.key} id={`v-${v.verse}`}
                  onClick={() => setSelKey(isSel ? null : v.key)}
                  className="cursor-pointer rounded px-1 transition-colors"
                  style={{ backgroundColor: hl ? HIGHLIGHT_HEX[hl.color] : isSel ? `${theme.sub}22` : "transparent",
                    color: hl ? "#1f2937" : undefined, outline: isSel ? `2px solid ${theme.sub}55` : "none" }}>
                  <sup className="mr-1 font-semibold" style={{ color: hl ? "#6b7280" : theme.sub, fontSize: "0.62em" }}>{v.verse}</sup>
                  {/* 언어 모드: ko=한글만, en=영어만(없으면 한글 폴백), koen=한글→영어 교대 */}
                  <span>{settings.lang === "en" ? (v.en || v.ko) : v.ko}</span>
                  {hasNote && <NotebookPen size={12} className="ml-1 inline align-middle text-amber-600" />}
                  {hasDraw && <Brush size={12} className="ml-1 inline align-middle text-sky-600" />}
                  {settings.lang === "koen" && v.en && (
                    <span className="mt-0.5 block italic" style={{ color: theme.sub, fontSize: "0.82em" }}>{v.en}</span>
                  )}
                </p>
              );
            })}
            {/* prev/next */}
            <div className="mt-8 flex justify-between" style={{ color: theme.sub }}>
              <button onClick={() => step(-1)} className="flex items-center gap-1 rounded-md px-3 py-2 hover:bg-black/5"><ChevronLeft size={16} /> 이전</button>
              <button onClick={() => step(1)} className="flex items-center gap-1 rounded-md px-3 py-2 hover:bg-black/5">다음 <ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </main>

      {/* Verse action bar (듣기 중에는 ListenBar 우선) */}
      {selVerse && listenIdx === null && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white p-3 shadow-2xl">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{selVerse.book_ko} {selVerse.chapter}:{selVerse.verse}</span>
              <button onClick={() => setSelKey(null)}><X size={16} /></button>
            </div>
            <div className="mb-2 flex items-center gap-1.5">
              <Highlighter size={15} className="mr-1 text-gray-500" />
              {COLORS.map((c) => (
                <button key={c} onClick={() => setHighlight(selVerse, c)}
                  className={`h-7 w-7 rounded-full border-2 ${highlights[selVerse.key]?.color === c ? "border-gray-700" : "border-transparent"}`}
                  style={{ backgroundColor: HIGHLIGHT_HEX[c] }} aria-label={c} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setMemoEdit({ key: selVerse.key, meta: metaOf(selVerse), value: notes[selVerse.key]?.md ?? "" })}>
                <NotebookPen size={14} /> 메모
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDrawEdit({ key: selVerse.key, meta: metaOf(selVerse), png: drawings[selVerse.key]?.png })}>
                <Brush size={14} /> 그림
              </Button>
              {drawings[selVerse.key] && (
                <Button size="sm" variant="outline" onClick={() => removeDrawing(selVerse.key)} title="그림 삭제">
                  <Trash2 size={14} /> 그림 삭제
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setAiSheet({ mode: "ask", verse: selVerse })}><Sparkles size={14} /> AI 질문</Button>
              <Button size="sm" variant="outline" onClick={() => setAiSheet({ mode: "cross", verse: selVerse })}><Scale size={14} /> AI 교차검증</Button>
              <Button size="sm" variant="outline" onClick={() => setMediaVerse(selVerse)}><Video size={14} /> 설교·책</Button>
            </div>
          </div>
        </div>
      )}

      {/* Nav drawer (book/chapter) */}
      {navOpen && books && (
        <Overlay onClose={() => setNavOpen(false)} title="책 · 장 선택">
          <form onSubmit={submitNavFilter} className="mb-3">
            <Input
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              autoFocus
              placeholder="책 필터 — 초성·장 번호 (예: ㅅㅍ 23 → 시편 23장)"
              className="h-10"
            />
          </form>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
            <div className="max-h-[48vh] overflow-y-auto pr-1">
              {filteredBooks.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">일치하는 책이 없습니다</p>
              )}
              {groupByGenre(filteredBooks).map(([genre, list]) => (
                <div key={genre} className="mb-3">
                  <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">{genre}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((b) => (
                      <button key={b.book_en} onClick={() => { setNavBook(b.book_en); setChInput(""); }}
                        className={`rounded-full border px-2.5 py-1 text-[0.8rem] ${navBook === b.book_en ? "border-primary bg-primary/10 text-primary" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                        {b.book_ko}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="max-h-[48vh] overflow-y-auto">
              {navBookMeta && (
                <>
                  <div className="mb-2 text-sm font-semibold text-gray-700">{navBookMeta.book_ko}</div>
                  {/* 장 번호 직접 입력 — Enter 로 이동 */}
                  <form onSubmit={submitChapter} className="mb-2.5 flex gap-2">
                    <Input
                      key={navBook}
                      value={chInput}
                      onChange={(e) => setChInput(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={`장 번호 입력 (1–${navBookMeta.chapter_count})`}
                      className="h-9 flex-1"
                    />
                    <Button type="submit" size="sm" className="h-9 px-4" disabled={!chInput}>이동</Button>
                  </form>
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                    {Array.from({ length: navBookMeta.chapter_count }, (_, i) => i + 1).map((c) => (
                      <button key={c} onClick={() => goTo(navBook!, c)}
                        className="rounded-md border border-gray-200 py-1.5 text-sm text-gray-700 hover:border-primary hover:text-primary">
                        {c}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </Overlay>
      )}

      {/* Search */}
      {searchOpen && (
        <Overlay onClose={() => setSearchOpen(false)} title="검색 (자음·본문)">
          <form onSubmit={(e) => { e.preventDefault(); doSearch(q); }} className="mb-3 flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="예: ㅎㄴㄴ, 하나님, 사랑은" className="h-10" />
            <Button type="submit" className="h-10 px-4">{searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}</Button>
          </form>
          <p className="mb-2 text-xs text-gray-400">초성(ㅎㄴㄴ)·본문 모두 검색됩니다 · 최대 50개</p>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
            {hits.map((h) => (
              <button key={h.key} onClick={() => goTo(h.book_en, h.chapter, h.verse)}
                className="block w-full rounded-md border border-gray-100 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5">
                <span className="text-xs font-semibold text-primary">{h.book_ko} {h.chapter}:{h.verse}</span>
                <span className="ml-2 text-sm text-gray-600">{h.ko}</span>
              </button>
            ))}
            {!searching && q && hits.length === 0 && <p className="py-8 text-center text-sm text-gray-400">결과 없음</p>}
          </div>
        </Overlay>
      )}

      {/* Settings */}
      {setOpen && (
        <Overlay onClose={() => setSetOpen(false)} title="설정">
          <div className="space-y-5">
            <div>
              <div className="mb-1 text-sm text-gray-600">글자 크기 · {settings.fontSize}px</div>
              <input type="range" min={14} max={28} value={settings.fontSize} onChange={(e) => patchSettings({ fontSize: Number(e.target.value) })} className="w-full" />
            </div>
            <div>
              <div className="mb-1.5 text-sm text-gray-600">테마</div>
              <div className="flex gap-2">
                {(["light", "sepia", "dark"] as const).map((t) => (
                  <button key={t} onClick={() => patchSettings({ theme: t })}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm ${settings.theme === t ? "border-primary text-primary" : "border-gray-200 text-gray-600"}`}
                    style={{ backgroundColor: THEME_BG[t].bg, color: settings.theme === t ? undefined : THEME_BG[t].fg }}>
                    {t === "light" ? "밝게" : t === "sepia" ? "세피아" : "어둡게"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-sm text-gray-600">본문 언어</div>
              <div className="flex gap-2">
                {LANGS.map((l) => (
                  <button key={l.value} onClick={() => patchSettings({ lang: l.value })}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm ${settings.lang === l.value ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-600"}`}>
                    <span className="block font-medium">{l.label}</span>
                    <span className="block text-[0.68rem] opacity-70">{l.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Overlay>
      )}

      {/* Memo sheet */}
      {memoEdit && (
        <Overlay onClose={() => setMemoEdit(null)} title={`${memoEdit.meta.book_ko} ${memoEdit.meta.chapter}:${memoEdit.meta.verse} · 메모`}>
          <p className="mb-2 rounded bg-gray-50 px-3 py-2 text-sm text-gray-500">{memoEdit.meta.ko}</p>
          <textarea value={memoEdit.value} onChange={(e) => setMemoEdit({ ...memoEdit, value: e.target.value })}
            autoFocus rows={8} placeholder="마크다운(.md)으로 저장됩니다…"
            className="w-full resize-none rounded-md border border-gray-200 p-3 text-sm focus:border-primary focus:outline-none" />
          <div className="mt-3 flex justify-end gap-2">
            {notes[memoEdit.key] && (
              <Button variant="outline" onClick={() => { const n = { ...notes }; delete n[memoEdit.key]; setNotes(n); saveNotes(n); setMemoEdit(null); }}>
                <Trash2 size={14} /> 삭제
              </Button>
            )}
            <Button onClick={saveMemo}>저장</Button>
          </div>
        </Overlay>
      )}

      {/* Drawing */}
      {drawEdit && (
        <DrawingCanvas
          title={`${drawEdit.meta.book_ko} ${drawEdit.meta.chapter}:${drawEdit.meta.verse}`}
          initialPng={drawEdit.png}
          onSave={saveDrawing}
          onClose={() => setDrawEdit(null)}
        />
      )}

      {/* 말씀 듣기 (P4 껍데기) — 메모하며 듣기 연동 */}
      {listenIdx !== null && verses[listenIdx] && (
        <ListenBar
          verse={verses[listenIdx]}
          hasPrev={listenIdx > 0}
          hasNext={listenIdx < verses.length - 1}
          onPrev={() => setListenIdx((i) => (i! > 0 ? i! - 1 : i))}
          onNext={() => setListenIdx((i) => (i! < verses.length - 1 ? i! + 1 : i))}
          onClose={() => setListenIdx(null)}
          onMemo={() => {
            const v = verses[listenIdx];
            setMemoEdit({ key: v.key, meta: metaOf(v), value: notes[v.key]?.md ?? "" });
          }}
        />
      )}

      {/* 구절별 설교·책 (P5 껍데기) */}
      {mediaVerse && (
        <MediaSheet
          verse={{ key: mediaVerse.key, book_ko: mediaVerse.book_ko, chapter: mediaVerse.chapter, verse: mediaVerse.verse }}
          onClose={() => setMediaVerse(null)}
        />
      )}

      {/* AI 질문 / 교차검증 (P3 껍데기) */}
      {aiSheet && (
        <AISheet
          mode={aiSheet.mode}
          verse={{ key: aiSheet.verse.key, book_ko: aiSheet.verse.book_ko, chapter: aiSheet.verse.chapter, verse: aiSheet.verse.verse, ko: aiSheet.verse.ko }}
          onClose={() => setAiSheet(null)}
        />
      )}
    </div>
  );
}

// 공용 바텀시트/모달
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function groupByGenre(books: BookMeta[]): [string, BookMeta[]][] {
  const order: string[] = [];
  const map: Record<string, BookMeta[]> = {};
  for (const b of books) {
    if (!map[b.genre]) { map[b.genre] = []; order.push(b.genre); }
    map[b.genre].push(b);
  }
  return order.map((g) => [g, map[g]]);
}
