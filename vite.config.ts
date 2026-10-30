import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'apk-downloader-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = req.url ? req.url.split('?')[0].toLowerCase() : '';

          // 1. Direct download page at /download or /update
          if (urlPath === '/download' || urlPath === '/update' || urlPath === '/apk') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.statusCode = 200;
            res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Download Foundry APK Update</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
    .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 20px; padding: 36px 24px; max-width: 380px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
    .logo { width: 60px; height: 60px; background: #2563eb; color: #fff; font-size: 26px; font-weight: bold; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4); }
    h1 { font-size: 22px; margin: 0 0 8px; font-weight: 700; letter-spacing: -0.5px; }
    p { color: #94a3b8; font-size: 13px; margin: 0 0 24px; line-height: 1.5; }
    .btn { display: block; width: 100%; padding: 15px 20px; background: #2563eb; color: white; text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 12px; box-sizing: border-box; transition: background 0.15s; }
    .btn:active { background: #1d4ed8; }
    .note { margin-top: 18px; font-size: 12px; color: #64748b; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">F</div>
    <h1>Foundry for Android</h1>
    <p>Latest updated app package with responsive UI and AI connectivity.</p>
    <a href="/Foundry-Android-debug.apk" class="btn" download="Foundry-Android-debug.apk">📥 Download APK Update</a>
    <div class="note">Once downloaded, tap the notification or open your Downloads folder to update.</div>
  </div>
</body>
</html>`);
            return;
          }

          // 2. Direct APK file download
          if (
            urlPath === '/foundry-android-debug.apk' ||
            urlPath === '/foundry.apk' ||
            urlPath === '/app.apk' ||
            urlPath.endsWith('.apk')
          ) {
            const apkPath = path.resolve(import.meta.dirname, './public/Foundry-Android-debug.apk');
            const fallbackPath = path.resolve(import.meta.dirname, './Foundry-Android-debug.apk');
            const targetPath = fs.existsSync(apkPath) ? apkPath : fs.existsSync(fallbackPath) ? fallbackPath : null;

            if (targetPath) {
              const stat = fs.statSync(targetPath);
              res.setHeader('Content-Type', 'application/vnd.android.package-archive');
              res.setHeader('Content-Disposition', 'attachment; filename="Foundry-Android-debug.apk"');
              res.setHeader('Content-Length', stat.size);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');

              if (req.method === 'HEAD') {
                res.statusCode = 200;
                res.end();
                return;
              }

              const stream = fs.createReadStream(targetPath);
              res.statusCode = 200;
              stream.pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: host || '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5183,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      // Proxy AI requests to bypass CORS restrictions
      '/ai-proxy': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/ai-proxy/, ''),
      },
      '/ollama-proxy': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/ollama-proxy/, ''),
      },
      '/lmstudio-proxy': {
        target: 'http://127.0.0.1:1234',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/lmstudio-proxy/, ''),
      },
    },
  },
})
