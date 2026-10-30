const prompt = `<start_of_turn>user
[System Instructions]
You are Foundry. If user asks for battery, output: {"tool": "getBatteryInformation", "arguments": {}}

What is my battery level?<end_of_turn>
<start_of_turn>model
`;

const res = await fetch('http://127.0.0.1:9225/json');
const targets = await res.json();
const page = targets.find(t => t.type === 'page');
if (!page) {
  console.error('No page target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `window.__TAURI_INTERNALS__.invoke('android_local_ai_chat', { prompt: ${JSON.stringify(prompt)} })`,
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
      console.log('Model Response:\n', msg.result?.result?.value);
    }
    ws.close();
    process.exit(0);
  }
});
