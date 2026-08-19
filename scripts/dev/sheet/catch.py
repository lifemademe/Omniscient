"""Serve the texture sheet, and accept the PNGs it posts back.

The browser pane cannot be screenshotted unless it is displayed, and the page's own downloads
are blocked in the viewer sandbox. So the page renders, encodes each canvas, and POSTs it here,
which writes it to disk where it can simply be looked at. Serving and receiving in one process
because two ports for one job is one port too many.

  python scripts/dev/sheet/catch.py [port]
"""

import base64
import pathlib
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'out'
OUT.mkdir(exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def do_POST(self):
        name = self.path.strip('/').replace('..', '') or 'frame'
        body = self.rfile.read(int(self.headers['Content-Length']))
        data = body.split(b',', 1)[1] if b',' in body[:64] else body
        path = OUT / f'{name}.png'
        path.write_bytes(base64.b64decode(data))
        print(f'wrote {path.name}  {path.stat().st_size} bytes', flush=True)
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        # No caching, ever. The whole point of this tool is that the bundle changes on every
        # pass, and a 304 on bundle.js means judging the change you just made against the
        # texture you had before it - which is worse than not looking at all, because it comes
        # with the confidence of having looked.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5199
print(f'serving {HERE} on {port}, POSTs land in out/', flush=True)
ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
