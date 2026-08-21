"""Bundle the shader check and inline it, so it runs from a plain http server.

Inlined rather than linked because the preview pane will not fetch a sibling script from a
file:// page, and served over http rather than opened directly because it will not open a
1.2MB local page either. Both of those cost a round trip to discover; this is here so the
next person spends none.

  python scripts/dev/shader/build.py
"""
import pathlib
import subprocess

here = pathlib.Path(__file__).parent
subprocess.run(
    ['npx', 'esbuild', 'scripts/dev/shader/entry.ts', '--bundle',
     f'--outfile={here / "bundle.js"}', '--format=iife', '--log-level=error'],
    check=True, shell=True,
)
bundle = (here / 'bundle.js').read_text(encoding='utf-8')
(here / 'index.html').write_text(
    '<!doctype html><meta charset="utf-8"><title>shader</title>\n'
    '<style>body{background:#0b0f0d;font:13px ui-monospace,Consolas,monospace;padding:16px}\n'
    'pre{white-space:pre-wrap;font-size:15px}</style>\n'
    '<pre id="out">running...</pre>\n'
    '<script>\ntry {\n' + bundle +
    "\n} catch (err) { const o = document.getElementById('out');"
    " o.textContent = 'THREW: ' + String(err); o.style.color = '#ff6b52'; }\n</script>\n",
    encoding='utf-8',
)
print(f'{len(bundle)} bytes inlined')
