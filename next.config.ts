import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // bible.json 같은 큰 정적 데이터 파일을 API에서 fs로 읽을 수 있도록
  outputFileTracingIncludes: {
    "/api/**": ["./public/data/**"],
  },
};

export default nextConfig;
