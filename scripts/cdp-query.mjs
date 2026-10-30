// CDP Query helper
let targets;
try {
  const res = await fetch('http://127.0.0.1:9225/json', { signal: AbortSignal.timeout(3000) });
  targets = await res.json();
} catch (e) {
  console.error('CDP fetch error:', e.message);
  process.exit(1);
}
const page = targets?.find?.(t => t.type === 'page');
if (!page) {
  console.error('No page target found. Targets:', JSON.stringify(targets));
  process.exit(1);
}

const action = process.argv[2];
const text = process.argv[3];

const ws = new WebSocket(page.webSocketDebuggerUrl);

setTimeout(() => {
  try { ws?.close(); } catch {}
  process.exit(0);
}, 35000);

function evaluate(expression, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 100000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      resolve('');
    }, timeoutMs);
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          resolve(msg.result?.result?.value ?? '');
        }
      } catch {}
    };
    ws.addEventListener('message', handler);
    try {
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          expression,
          awaitPromise: expression.includes('await'),
          returnByValue: true
        }
      }));
    } catch {
      clearTimeout(timer);
      resolve('');
    }
  });
}

ws.addEventListener('open', async () => {
  if (action === 'send') {
    console.log(`Sending query: "${text}"`);
    const script = `
      (async () => {
        const input = document.querySelector('input, textarea');
        if (!input) return 'No input found';
        
        // Native React setter
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
                             Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, ${JSON.stringify(text)});
        } else {
          input.value = ${JSON.stringify(text)};
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Find send button
        await new Promise(r => setTimeout(r, 200));
        const btn = document.querySelector('button[aria-label="Send query"], button[aria-label="Send message"], button[type="submit"]') ||
                    document.querySelector('form button');
        if (btn) {
          btn.click();
          return 'Clicked button: ' + (btn.getAttribute('aria-label') || btn.innerText || btn.tagName);
        }
        
        // Try form submit
        const form = input.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return 'Submitted form';
        }
        return 'Neither button nor form found';
      })()
    `;
    const res = await evaluate(script);
    console.log('Action result:', res);
  } else if (action === 'eval') {
    const res = await evaluate(text);
    console.log(typeof res === 'object' ? JSON.stringify(res, null, 2) : (res ?? ''));
  } else if (action === 'latest') {
    const latest = await evaluate(`
      (() => {
        const isThinking = !!document.querySelector('.animate-spin') || !!document.querySelector('input:disabled');
        const assistantElements = Array.from(document.querySelectorAll('.rounded-bl-xs'));
        const last = assistantElements[assistantElements.length - 1];
        return JSON.stringify({
          isThinking,
          count: assistantElements.length,
          latestText: last ? last.innerText : ''
        });
      })()
    `);
    console.log(latest || '');
  } else if (action === 'read') {
    const text = await evaluate(`
      document.body ? document.body.innerText : ''
    `);
    console.log(text || '');
  } else if (action === 'status') {
    const status = await evaluate(`
      ({
        inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({ tag: i.tagName, placeholder: i.placeholder, val: i.value })),
        buttons: Array.from(document.querySelectorAll('button')).map(b => ({ label: b.getAttribute('aria-label'), text: b.innerText }))
      })
    `);
    console.log('Status:\n', JSON.stringify(status, null, 2));
  }
  ws.close();
  process.exit(0);
});
