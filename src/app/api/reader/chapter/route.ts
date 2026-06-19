import { NextRequest, NextResponse } from "next/server";
import { getChapter } from "@/lib/reader";

// GET /api/reader/chapter?book=Genesis&chapter=1 → 해당 장의 절 목록
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const book = (sp.get("book") ?? "").trim();
  const chapter = Number(sp.get("chapter"));
  if (!book || !Number.isInteger(chapter) || chapter < 1) {
    return NextResponse.json({ error: "book·chapter 파라미터가 필요합니다." }, { status: 400 });
  }
  const verses = getChapter(book, chapter);
  if (verses.length === 0) {
    return NextResponse.json({ error: "해당 장을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({
    book_en: book,
    book_ko: verses[0].book_ko,
    chapter,
    verses,
  });
}
