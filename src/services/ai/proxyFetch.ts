/**
 * Proxy-aware fetch helper for AI providers.
 *
 * Problem: The local AI server (e.g., on port 8082) doesn't return CORS headers.
 * When the Foundry frontend (localhost:5173 or tauri://localhost) makes cross-origin
 * fetch() calls, the browser silently blocks the response.
 *
 * Solution layers:
 *   1. Tauri environment → Use `invoke('proxy_http_request', ...)` from Rust (no CORS)
 *   2. Vite dev server   → Rewrite URL to use Vite proxy (same-origin)
 *   3. Fallback          → Direct fetch (for environments where CORS isn't an issue)
 */

export interface ProxyFetchInit extends RequestInit {
  timeoutMs?: number;
}

// Known local AI endpoint → Vite proxy prefix mappings
const PROXY_MAP: { host: string; proxyPrefix: string }[] = [
  { host: '127.0.0.1:8082', proxyPrefix: '/ai-proxy' },
  { host: 'localhost:8082', proxyPrefix: '/ai-proxy' },
  { host: '127.0.0.1:11434', proxyPrefix: '/ollama-proxy' },
  { host: 'localhost:11434', proxyPrefix: '/ollama-proxy' },
  { host: '127.0.0.1:1234', proxyPrefix: '/lmstudio-proxy' },
  { host: 'localhost:1234', proxyPrefix: '/lmstudio-proxy' },
];

function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

function isViteDevServer(): boolean {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
}

/**
 * Rewrite a full URL (e.g., http://127.0.0.1:8082/v1/messages)
 * into a Vite-proxied relative path (e.g., /ai-proxy/v1/messages).
 * Returns null if no matching proxy is configured.
 */
function rewriteToProxy(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostPort = `${parsed.hostname}:${parsed.port}`;
    for (const mapping of PROXY_MAP) {
      if (hostPort === mapping.host) {
        return `${mapping.proxyPrefix}${parsed.pathname}${parsed.search}`;
      }
    }
  } catch {
    // Not a valid URL — leave as-is
  }
  return null;
}

/**
 * Tauri-native HTTP request via Rust invoke (bypasses CORS entirely).
 * Falls back to null if Tauri is not available or the command doesn't exist.
 */
async function tauriFetch(
  url: string,
  init?: ProxyFetchInit
): Promise<Response | null> {
  if (!isTauriEnvironment()) return null;

  if (init?.signal?.aborted) {
    throw new DOMException('The user aborted a request.', 'AbortError');
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const method = init?.method || 'GET';
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) {
          headers[k] = v;
        }
      } else {
        Object.assign(headers, init.headers);
      }
    }

    const timeout_ms = init?.timeoutMs || (init?.signal ? 4000 : null);

    const invokePromise = invoke<{
      status: number;
      body: string;
      headers: Record<string, string>;
    }>('proxy_http_request', {
      url,
      method,
      headers,
      body: init?.body ? String(init.body) : null,
      timeoutMs: timeout_ms,
    });

    let result: { status: number; body: string; headers: Record<string, string> };

    if (init?.signal) {
      const abortPromise = new Promise<never>((_, reject) => {
        init.signal!.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      });
      result = await Promise.race([invokePromise, abortPromise]);
    } else {
      result = await invokePromise;
    }

    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    console.warn('[proxyFetch] Tauri invoke failed, falling back:', err);
    return null;
  }
}

/**
 * Drop-in replacement for `fetch()` that automatically handles CORS
 * by routing through the Vite proxy or Tauri backend.
 */
export async function proxyFetch(
  url: string,
  init?: ProxyFetchInit
): Promise<Response> {
  // Layer 1: In dev mode, prefer the Vite proxy (fastest, no IPC overhead)
  if (isViteDevServer()) {
    const proxied = rewriteToProxy(url);
    if (proxied) {
      try {
        const res = await fetch(proxied, init);
        if (res.ok || res.status < 500) {
          return res;
        }
      } catch (e) {
        console.warn('[proxyFetch] Vite proxy fetch failed, trying Tauri fallback:', e);
      }
    }
  }

  // Layer 2: In Tauri environment, use Rust-side HTTP (bypasses CORS completely)
  if (isTauriEnvironment()) {
    const tauriResponse = await tauriFetch(url, init);
    if (tauriResponse) return tauriResponse;
  }

  // Layer 3: Direct fetch (fallback — may fail on CORS)
  return fetch(url, init);
}
