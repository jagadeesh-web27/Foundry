#!/usr/bin/env node
/**
 * Mobile layout audit: renders Foundry at a phone viewport (touch + Android user agent) in a headless
 * Chromium, visits the main screens, saves screenshots and measures objective mobile-usability problems:
 *   - horizontal overflow (page wider than the screen)
 *   - tap targets smaller than 44x44 CSS px (WCAG 2.5.5 / platform guidelines)
 *   - text smaller than 12px
 * Usage: node scripts/mobile-audit.mjs --cdp 9444 --url http://localhost:5173/ --out artifacts/mobile [--tag before]
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const cdpPort = Number(args.cdp || 9444);
const url = args.url || 'http://localhost:5173/';
const outDir = args.out || 'artifacts/mobile';
const tag = args.tag || 'run';
const width = Number(args.width || 393);
const height = Number(args.height || 873);
mkdirSync(outDir, { recursive: true });

const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
const browser = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => browser.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
browser.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
function send(method, params = {}, sessionId) {
  const i = ++id;
  browser.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve) => pending.set(i, resolve));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable');
await s('Runtime.enable');
await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await s('Network.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (Linux; Android 16; I2302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
});
await s('Page.navigate', { url });
await sleep(4000);

async function evaluate(expression) {
  const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
}

const MEASURE = `(() => {
  const vw = window.innerWidth;
  const doc = document.scrollingElement || document.documentElement;
  const visible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.title || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);
  const targets = Array.from(document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input, select, textarea'))
    .filter(visible)
    .map((el) => { const r = el.getBoundingClientRect(); return { label: label(el), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((t) => t.w < 44 || t.h < 44);
  const overflowing = Array.from(document.querySelectorAll('body *')).filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1)
    .slice(0, 8).map((el) => (el.className && el.className.toString ? el.className.toString().slice(0, 60) : el.tagName));
  const smallText = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || !el.childNodes.length) continue;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && parseFloat(getComputedStyle(el).fontSize) < 12) smallText.add(getComputedStyle(el).fontSize);
  }
  const smallTextCount = Array.from(document.querySelectorAll('body *')).filter((el) => visible(el) && Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).length;
  return JSON.stringify({
    pageScrollWidth: doc.scrollWidth, viewport: vw, horizontalOverflow: doc.scrollWidth > vw + 1,
    overflowingElements: overflowing,
    smallTapTargets: targets.length, smallTapTargetExamples: targets.slice(0, 12),
    smallTextElements: smallTextCount, smallTextSizes: Array.from(smallText),
    zoomDisabled: /user-scalable=no|maximum-scale=1/.test(document.querySelector('meta[name=viewport]')?.content || ''),
  });
})()`;

const report = [];
async function shot(name) {
  await sleep(700);
  const metrics = JSON.parse((await evaluate(MEASURE)) || '{}');
  const { result } = await s('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/${tag}-${name}.png`, Buffer.from(result.data, 'base64'));
  report.push({ screen: name, ...metrics });
  console.log(`${name.padEnd(16)} overflow=${metrics.horizontalOverflow} smallTargets=${metrics.smallTapTargets} smallText=${metrics.smallTextElements}`);
}
async function clickText(text) {
  // Only visible controls: what a person can actually tap.
  return evaluate(`(() => { const el = Array.from(document.querySelectorAll('button, [role="tab"], a')).find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (b.innerText.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)}); }); if (el) { el.click(); return true; } return false; })()`);
}
async function openSection(name) {
  if (await clickText(name)) return true;
  if (await clickText('More')) { await sleep(400); return clickText(name); }
  return false;
}
async function clickLabel(re) {
  return evaluate(`(() => { const el = Array.from(document.querySelectorAll('button')).find((b) => new RegExp(${JSON.stringify(re)}, 'i').test(b.getAttribute('aria-label') || b.title || '')); if (el) { el.click(); return el.getAttribute('aria-label') || el.title; } return null; })()`);
}
async function ask(text) {
  await evaluate(`(async () => {
    const input = document.querySelector('textarea, input[type="text"], input:not([type])');
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('button[aria-label="Send query"]')?.click();
  })()`);
  await sleep(3500);
}

await shot('00-first-launch');
// Get past the first-launch screen if shown.
await evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /connect/i.test(x.innerText)); if (b) b.click(); return !!b; })()`);
await sleep(3000);
await shot('01-home');
if (!(await clickText('Chat'))) console.log('Chat: NOT REACHABLE by tapping visible controls');
await shot('02-chat-empty');
await ask('What is my battery level?');
await ask('Find my resume');
await ask('Explain how React hooks work in detail with examples');
await shot('03-chat-messages');
// scroll position after messages: is the latest message visible?
const scrollInfo = await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('*')).filter(e => { const st = getComputedStyle(e); return /(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 4; }).map(e => ({ cls: String(e.className).slice(0, 50), scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, scrollTop: Math.round(e.scrollTop) })))`);
console.log('scroll containers:', scrollInfo);
const sidebar = await clickLabel('sidebar|menu|conversation|history');
await shot('04-sidebar');
if (sidebar) await clickLabel('sidebar|menu|close');
for (const tab of ['Pending', 'Tasks', 'Goals', 'Clean-Up', 'Integrations', 'Memory']) {
  if (await openSection(tab)) await shot(`05-tab-${tab.toLowerCase()}`);
  else console.log(`${tab}: NOT REACHABLE by tapping visible controls`);
}
await clickText('Chat');
if (await clickLabel('settings')) await shot('06-settings');

writeFileSync(`${outDir}/${tag}-report.json`, JSON.stringify(report, null, 2));
await send('Target.closeTarget', { targetId });
browser.close();
process.exit(0);
