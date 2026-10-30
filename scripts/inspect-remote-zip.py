import urllib.request
import zipfile
import io

url = "https://huggingface.co/abhianand1093/llminferencedemo/resolve/main/gemma-3n-E2B-it-int4.task"

# Use standard zipfile with a seeking HTTP range file reader
class HTTPRangeReader(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            self.size = int(resp.headers.get('Content-Length'))
        self.pos = 0

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        return self.pos

    def tell(self):
        return self.pos

    def read(self, size=-1):
        if size == -1 or self.pos + size > self.size:
            size = self.size - self.pos
        if size <= 0:
            return b""
        end = self.pos + size - 1
        req = urllib.request.Request(self.url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Range': f'bytes={self.pos}-{end}'
        })
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
        self.pos += len(data)
        return data

try:
    reader = HTTPRangeReader(url)
    zf = zipfile.ZipFile(reader)
    print("Zip file list:", zf.namelist())
    if "METADATA" in zf.namelist():
        metadata = zf.read("METADATA")
        print("\n--- METADATA CONTENT ---")
        try:
            print(metadata.decode('utf-8'))
        except Exception:
            print(metadata[:500])
except Exception as e:
    import traceback
    traceback.print_exc()
