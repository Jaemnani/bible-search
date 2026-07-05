import Link from "next/link";
import { BookOpen, Search, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";

// 진입 랜딩 — 한 뎁스에서 두 기능(성경 리더 / 의미검색) 중 선택.
export default function Home() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-12">
        <header className="mb-10 text-center animate-fade-up">
          <div className="mb-3 flex items-center justify-center gap-2">
            <BookOpen className="text-primary" size={24} />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">말씀곳간</h1>
          </div>
          <p className="text-sm tracking-widest text-muted-foreground">
            성경 읽기와 말씀 찾기
          </p>
          <Separator className="mx-auto mt-6 w-12 bg-border/40" />
        </header>

        <div className="grid gap-3 animate-fade-up" style={{ animationDelay: "80ms" }}>
          <Link
            href="/read"
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">성경 리더</span>
              <span className="mt-0.5 block text-[0.82rem] leading-relaxed text-muted-foreground">
                한글 · 영어 · 한영 대역으로 본문 읽기, 하이라이트와 메모
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>

          <Link
            href="/search"
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Search size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">성경구절 의미검색</span>
              <span className="mt-0.5 block text-[0.82rem] leading-relaxed text-muted-foreground">
                감정과 상황을 입력하면 AI가 관련 말씀을 찾아드려요
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        </div>

        <p className="mt-10 text-center font-serif text-sm italic leading-relaxed text-foreground/50 animate-fade-in">
          &ldquo;너희가 전심으로 나를 찾고 찾으면 나를 만나리라&rdquo;
          <span className="mt-1 block text-[0.68rem] not-italic tracking-widest text-primary/60">예레미야 29:13</span>
        </p>
      </div>
    </div>
  );
}
