import urllib.request
import json

queries = ['task', 'mediapipe', 'gemma', 'genai', 'llminference']
found = set()

for q in queries:
    url = f"https://huggingface.co/api/models?search={q}&limit=50"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            models = json.loads(resp.read().decode())
            for m in models:
                mid = m.get('id')
                if mid in found:
                    continue
                found.add(mid)
                try:
                    m_req = urllib.request.Request(f"https://huggingface.co/api/models/{mid}", headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(m_req) as m_resp:
                        m_data = json.loads(m_resp.read().decode())
                        tasks = [s for s in m_data.get('siblings', []) if s.get('rfilename', '').endswith('.task')]
                        if tasks:
                            print(f"{mid}: {[t.get('rfilename') for t in tasks]}")
                except Exception:
                    pass
    except Exception as e:
        print(f"Error for {q}: {e}")
