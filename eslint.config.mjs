import next from "eslint-config-next";

// Next 16은 `next lint`를 제거 — ESLint flat config 직접 사용.
// eslint-config-next 16은 flat config 배열을 default export 한다.
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      ".venv/**",
      "embeddings_src/**",
    ],
  },
  ...next,
];

export default eslintConfig;
