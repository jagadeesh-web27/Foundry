#!/usr/bin/env node
/**
 * Evaluate a JavaScript expression in the running Foundry app (desktop or Android) over the Chrome
 * DevTools Protocol and print the result as JSON. Promises are awaited.
 * Usage: node scripts/cdp-invoke.mjs --port 9333 "window.__TAURI_INTERNALS__.invoke('index_status')"
 */
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 9333;
const expression = args.filter((_, i) => i !== portIdx && i !== portIdx + 1).join(' ');

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
if (!page) {
  console.error('No app page on port', port);
  process.exit(2);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data.toString());
  if (msg.id !== 1) return;
  const r = msg.result;
  if (r?.exceptionDetails) {
    console.error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    process.exit(1);
  }
  console.log(JSON.stringify(r?.result?.value, null, 2));
  process.exit(0);
});
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
setTimeout(() => {
  console.error('timeout');
  process.exit(3);
}, 30000);
