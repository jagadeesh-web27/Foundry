// Built-in global WebSocket

async function run() {
  const res = await fetch('http://127.0.0.1:9225/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page');

  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('open', () => {
    // Invoke search_files_live
    const expr = `window.__TAURI_INTERNALS__.invoke('search_files_live', { query: 'resume', limit: 10 })`;
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: expr,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id === 1) {
      console.log('search_files_live Result:', JSON.stringify(msg.result, null, 2));
      ws.close();
      process.exit(0);
    }
  });
}

run();
