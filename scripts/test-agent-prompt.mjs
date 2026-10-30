// Test multi-turn follow-up when searchFiles returns []
const systemPrompt = `You are Foundry, an intelligent on-device assistant.
If tools were called and returned no files or results, use your general knowledge to answer the user's question directly and informatively.`;

const prompt = `<start_of_turn>user
[System Instructions]
${systemPrompt}

What is React?<end_of_turn>
<start_of_turn>model
{"tool": "searchFiles", "arguments": {"query": "React"}}<end_of_turn>
<start_of_turn>user
Tool result for searchFiles:
[]

No local files found. Please answer the user's question directly.<end_of_turn>
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
      console.log('--- FOLLOW-UP GEMMA OUTPUT ---');
      console.log(msg.result?.result?.value);
      console.log('------------------------------');
    }
    ws.close();
    process.exit(0);
  }
});
