#!/usr/bin/env node
/**
 * Foundry end-to-end chat harness.
 *
 * Drives the REAL running app through the Chrome DevTools Protocol: types each question into the chat box,
 * presses send, waits for the answer and checks it against the suite's expectations. Works for:
 *   - the desktop app (WebView2 started with --remote-debugging-port, see docs/TESTING.md)
 *   - the Android app (adb forward to the WebView devtools socket)
 *
 * Usage: node scripts/e2e-chat.mjs --port 9222 --suite tests/e2e/desktop-suite.json [--out report.json] [--only id1,id2]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const port = Number(args.port || 9222);
const suite = JSON.parse(readFileSync(args.suite, 'utf8'));
const only = args.only ? new Set(args.only.split(',')) : null;
const defaultTimeout = Number(args.timeout || suite.timeoutSec || 180);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
if (!page) {
  console.error('No app page found on CDP port', port, JSON.stringify(targets.map((t) => t.url)));
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let nextId = 1;
function evaluate(expression) {
  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => resolve(undefined), 15000);
    const onMessage = (event) => {
      const msg = JSON.parse(event.data.toString());
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve(msg.result?.result?.value);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A snapshot can be missing while the page is busy or reloading; treat that as "not ready yet".
async function snapshot() {
  const raw = await evaluate(SNAPSHOT);
  try {
    const s = JSON.parse(raw);
    return typeof s?.body === 'string' ? s : null;
  } catch {
    return null;
  }
}

// Reads chat state. New builds expose data-turn-role on each bubble; older builds fall back to page text.
const SNAPSHOT = `(() => {
  const turns = Array.from(document.querySelectorAll('[data-turn-role="assistant"]'));
  const status = Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.innerText).join(' ');
  const input = document.querySelector('textarea, input[type="text"], input:not([type])');
  const thinking = /thinking|searching your/i.test(status) || !!(input && input.disabled);
  const last = turns[turns.length - 1];
  return JSON.stringify({
    hooks: turns.length > 0 || !!document.querySelector('[data-turn-role]'),
    count: turns.length,
    thinking,
    text: last ? last.innerText : '',
    tools: last ? (last.getAttribute('data-tools') || '') : '',
    files: last ? Number(last.getAttribute('data-file-count') || 0) : 0,
    body: document.body ? document.body.innerText : '',
  });
})()`;

function sendScript(text) {
  return `(async () => {
    const input = document.querySelector('textarea, input[type="text"], input:not([type])');
    if (!input) return 'no-input';
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const btn = document.querySelector('button[aria-label="Send query"], button[aria-label="Send message"], form button[type="submit"]');
    if (btn && !btn.disabled) { btn.click(); return 'clicked'; }
    const form = input.closest('form');
    if (form) { form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return 'submitted'; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return 'enter';
  })()`;
}

// Clock placeholders for date/time cases, computed inside the app's page so they use the same device
// clock and time zone as the app: {{weekday}} {{day}} {{month}} {{year}}, {{tomorrowWeekday}}
// {{tomorrowDay}} {{tomorrowMonth}}, and {{time}} (a regex matching the current minute +/- 1).
const CLOCK = `(() => {
  const now = new Date();
  const f = (d, o) => new Intl.DateTimeFormat('en-US', o).format(d);
  const tomorrow = new Date(now.getTime() + 864e5);
  const times = [-60e3, 0, 60e3].map((dt) => {
    const p = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(now.getTime() + dt));
    const g = (t) => p.find((x) => x.type === t).value;
    return g('hour') + ':' + g('minute') + '\\\\s?' + g('dayPeriod').toLowerCase()[0] + '\\\\.?m';
  });
  return JSON.stringify({
    weekday: f(now, { weekday: 'long' }), day: f(now, { day: 'numeric' }), month: f(now, { month: 'long' }), year: f(now, { year: 'numeric' }),
    tomorrowWeekday: f(tomorrow, { weekday: 'long' }), tomorrowDay: f(tomorrow, { day: 'numeric' }), tomorrowMonth: f(tomorrow, { month: 'long' }),
    time: '\\\\b(?:' + times.join('|') + ')',
  });
})()`;

function expand(re, clock) {
  return clock ? re.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in clock ? clock[k] : m)) : re;
}

function check(c, ans, clock) {
  const failures = [];
  const t = ans.text;
  const x = (re) => expand(re, clock);
  for (const re of (c.expect?.all || []).map(x)) if (!new RegExp(re, 'i').test(t)) failures.push(`missing /${re}/`);
  const any = (c.expect?.any || []).map(x);
  if (any.length && !any.some((re) => new RegExp(re, 'i').test(t))) failures.push(`none of ${any.map((r) => `/${r}/`).join(' ')}`);
  for (const re of (c.expect?.none || []).map(x)) if (new RegExp(re, 'i').test(t)) failures.push(`must not match /${re}/`);
  if (ans.hooks && c.expect?.minFiles != null && ans.files < c.expect.minFiles) failures.push(`expected >=${c.expect.minFiles} file cards, got ${ans.files}`);
  if (c.expect?.maxSeconds && ans.seconds > c.expect.maxSeconds) failures.push(`took ${ans.seconds}s > ${c.expect.maxSeconds}s`);
  return failures;
}

// The app may open on another tab (e.g. Today): switch to the chat view first.
await evaluate(`(() => {
  const chat = Array.from(document.querySelectorAll('button, [role="tab"], a')).find((b) => b.innerText.trim() === 'Chat');
  if (chat) chat.click();
  return !!chat;
})()`);
await sleep(1000);

const results = [];
for (const c of suite.cases) {
  if (only && !only.has(c.id)) continue;
  // wait until idle
  let before = null;
  for (let i = 0; i < 60; i++) {
    before = await snapshot();
    if (before && !before.thinking) break;
    await sleep(1000);
  }
  if (!before) {
    results.push({ id: c.id, query: c.query, ok: false, seconds: 0, failures: ['app page not responding'], answer: '' });
    console.log(`FAIL  ${c.id}: app page not responding`);
    continue;
  }
  const started = Date.now();
  const how = await evaluate(sendScript(c.query));
  let ans = { text: '', tools: '', files: 0, hooks: before.hooks, timedOut: true };
  const limit = (c.timeoutSec || defaultTimeout) * 1000;
  await sleep(1500);
  let lastTail = null;
  while (Date.now() - started < limit) {
    const s = await snapshot();
    if (!s) { await sleep(1000); continue; }
    if (s.hooks) {
      if (s.count > before.count && !s.thinking) {
        ans = { text: s.text, tools: s.tools, files: s.files, hooks: true, timedOut: false };
        break;
      }
    } else {
      // Older builds without test hooks: the answer is the page text after the last copy of the question,
      // accepted once it is non-empty and unchanged between two polls.
      const at = s.body.lastIndexOf(c.query);
      const tail = at >= 0 ? s.body.slice(at + c.query.length).trim() : '';
      if (!s.thinking && tail.length > 0 && tail === lastTail && !/thinking|searching your/i.test(tail.slice(0, 200))) {
        ans = { text: tail.slice(0, 1500), tools: '', files: 0, hooks: false, timedOut: false };
        break;
      }
      lastTail = tail;
    }
    await sleep(2000);
  }
  ans.seconds = Math.round((Date.now() - started) / 100) / 10;
  const usesClock = JSON.stringify(c.expect || {}).includes('{{');
  const clock = usesClock ? await evaluate(CLOCK).then((v) => JSON.parse(v)).catch(() => null) : null;
  const failures = ans.timedOut ? ['timed out'] : check(c, ans, clock);
  const ok = failures.length === 0;
  results.push({ id: c.id, query: c.query, ok, seconds: ans.seconds, tools: ans.tools, files: ans.files, failures, answer: ans.text, send: how });
  const preview = ans.text.replace(/\s+/g, ' ').slice(0, 140);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(ans.seconds).padStart(6)}s  ${c.id.padEnd(18)} ${preview}${ok ? '' : `\n        -> ${failures.join('; ')}`}`);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
if (args.out) writeFileSync(args.out, JSON.stringify({ suite: args.suite, at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
ws.close();
process.exit(passed === results.length ? 0 : 1);
