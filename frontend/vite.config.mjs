// Same-origin API access without CORS: the dev server (`npm run dev`) and `vite preview` forward `/api` to the backend.
// Backend origin: GEARSHARE_API_PROXY_TARGET (default http://127.0.0.1:8000, the README/uvicorn default).
// This only configures the Node-side server; the browser bundle never sees it. Mock mode makes no /api calls.
const target = process.env.GEARSHARE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
const proxy = { '/api': { target, changeOrigin: false } }

/** @type {import('vite').UserConfig} */
export default {
  server: { proxy },
  preview: { proxy },
}
