import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "말씀곳간 — 성경구절 의미 검색",
  description: "감정과 주제로 찾는 성경 구절 추천 서비스. 마음의 상태를 입력하면 관련 성경 말씀을 찾아드립니다.",
  keywords: ["성경", "성경 구절", "Bible", "말씀 검색", "성경 찾기", "묵상"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
