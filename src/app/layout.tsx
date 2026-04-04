import type { Metadata } from "next";
import { Noto_Sans_KR, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-noto",
});

export const metadata: Metadata = {
  title: "성경 구절 검색 | Bible Verse Search",
  description: "감정과 주제로 찾는 성경 구절 추천 서비스. 마음의 상태를 입력하면 관련 성경 말씀을 찾아드립니다.",
  keywords: ["성경", "성경 구절", "Bible", "말씀 검색", "성경 찾기", "묵상"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <body className={`${notoSansKR.variable}`}>{children}</body>
    </html>
  );
}
