const res = await fetch('http://127.0.0.1:9225/json');
const targets = await res.json();
const page = targets.find(t => t.type === 'page');
if (!page) {
  console.error('No page');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: 'window.__TAURI_INTERNALS__.invoke("android_local_ai_status")',
      awaitPromise: true,
      returnByValue: true
    }
  }));
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data.toString());
  console.log('Full CDP response:', JSON.stringify(msg, null, 2));
  ws.close();
  process.exit(0);
});
