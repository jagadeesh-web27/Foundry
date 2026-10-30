import urllib.request
import json

url = "https://huggingface.co/api/models?search=gemma"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        models = json.loads(resp.read().decode())
        print(f"Checking {len(models)} gemma models for .task files...")
        for m in models[:40]:
            mid = m.get("id")
            try:
                m_req = urllib.request.Request(f"https://huggingface.co/api/models/{mid}", headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(m_req) as m_resp:
                    m_data = json.loads(m_resp.read().decode())
                    task_files = [s.get("rfilename") for s in m_data.get("siblings", []) if s.get("rfilename", "").endswith(".task")]
                    if task_files:
                        print(f"Found in {mid}: {task_files}")
            except Exception:
                pass
except Exception as e:
    print("Error:", e)
