// Uses built-in global WebSocket
const expr = process.argv[2] || 'window.__TAURI__.core.invoke("android_local_ai_status")';

async function run() {
  const res = await fetch('http://127.0.0.1:9225/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page');
  if (!page) {
    console.error('No page target found');
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('open', () => {
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
      if (msg.result?.exceptionDetails) {
        console.error('Exception:', JSON.stringify(msg.result.exceptionDetails, null, 2));
      } else {
        console.log('Result:', JSON.stringify(msg.result?.result?.value, null, 2));
      }
      ws.close();
      process.exit(0);
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('WS Error:', err);
    process.exit(1);
  });
}

run();
