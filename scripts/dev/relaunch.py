"""Restart Sandbox Studio and wait until its world is loaded again.

    python scripts/dev/relaunch.py [timeout]

**Why this exists rather than `exitPlayMode`.** The art loop is: edit source, rebuild `.dist`,
enter play mode, capture, judge, edit again. Only the editor writes `.dist`, and it can only
write it when its world is loaded - which play mode unloads. So every iteration has to leave
play mode, and `action_editor(exitPlayMode)` is the one call in this project that reliably
kills the app: it times out while succeeding, then a BrowserWindow event fires against a
destroyed window and takes the main process with it. See the note in ART-MASTER §15.

Restarting costs about ninety seconds and always works, which beats a coin flip that
sometimes costs ninety seconds AND an error dialog. Nothing is lost: the scene is on disk and
the editor reloads it.

Exit code 0 once the window title is back and the app has had time to load its world; 1 on
timeout. Poll `query_editor(getState)` afterwards for the authoritative answer - this only
knows about the window, not about the world inside it.
"""
import subprocess
import sys
import time

EXE = r'C:\Program Files\Sandbox-Studio-Staging\Sandbox-Studio-Staging.exe'
TITLE = 'Sandbox Studio Staging'


def titles() -> list[str]:
    out = subprocess.run(
        ['powershell', '-NoProfile', '-Command',
         "Get-Process -Name Sandbox-Studio-Staging -ErrorAction SilentlyContinue "
         "| Where-Object {$_.MainWindowTitle -ne ''} | ForEach-Object {$_.MainWindowTitle}"],
        capture_output=True, text=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]


def main() -> int:
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 180.0
    subprocess.run(['powershell', '-NoProfile', '-Command',
                    'Stop-Process -Name Sandbox-Studio-Staging -Force -ErrorAction SilentlyContinue'],
                   capture_output=True)
    time.sleep(3)
    subprocess.Popen(['powershell', '-NoProfile', '-Command', f"Start-Process '{EXE}'"])

    deadline = time.time() + budget
    while time.time() < deadline:
        time.sleep(5)
        got = titles()
        # An "Error" title is the crash dialog from a PREVIOUS life still on screen; the
        # launch has not finished until the real title is the one showing.
        if TITLE in got:
            # The title appears before the project finishes its TypeScript build. There is no
            # window signal for that, so give it a fixed grace period and let the caller's
            # getState be the real gate.
            time.sleep(30)
            print(f'up after {int(budget - (deadline - time.time()))}s: {got}')
            return 0
    print(f'TIMEOUT after {budget:.0f}s, titles={titles()}', file=sys.stderr)
    return 1


sys.exit(main())
