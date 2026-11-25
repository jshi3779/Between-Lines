import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/Between-Lines/" : "/",
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8765' } }, // 将本地 API 请求代理到 Python，避免跨域 Cookie 问题。
});
