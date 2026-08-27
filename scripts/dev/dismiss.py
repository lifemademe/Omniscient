"""Dismiss Sandbox Studio's "Object has been destroyed" error dialog.

    python scripts/dev/dismiss.py          # click OK if the dialog is up
    python scripts/dev/dismiss.py --wait 30  # wait up to 30s for it, then click

Sandbox-Studio-Staging's MAIN process throws when a BrowserWindow event fires after the
window is gone - reliably reproducible by calling MCP `exitPlayMode` while play mode is
still starting:

    TypeError: Object has been destroyed
        at BrowserWindow.<anonymous> (app.asar/dist/src/electro...:42)

The app's window title becomes `Error`, the game window disappears and the MCP bridge goes
`app_offline`, while the processes stay alive so tasklist looks perfectly healthy. It is an
editor bug and the vendor is fixing it; Paul's standing instruction is to click OK and carry
on, which is what this does.

Clicks the BUTTON, not a coordinate. The dialog is a native Win32 message box, so its OK is
a real child window with a real handle - BM_CLICK on that handle cannot miss, cannot be
thrown off by DPI, and cannot land on something else if the dialog opens somewhere new. The
coordinate fallback exists only for the case where enumeration finds nothing.

Related trap, and the reason to prefer not needing this at all: the first `exitPlayMode`
TIMES OUT while actually succeeding. A timeout is not a reason to call it again - re-query
`getState` instead. Only exit play mode when `playMode.isStarting` and `busy.isBusy` are
both false.
"""
import ctypes
import ctypes.wintypes as w
import sys
import time

u = ctypes.windll.user32
u.SetProcessDPIAware()

BM_CLICK = 0x00F5
WM_GETTEXT = 0x000D
WM_GETTEXTLENGTH = 0x000E

ENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, w.HWND, w.LPARAM)


def text_of(handle: int) -> str:
    length = u.SendMessageW(handle, WM_GETTEXTLENGTH, 0, 0)
    buffer = ctypes.create_unicode_buffer(length + 1)
    u.SendMessageW(handle, WM_GETTEXT, length + 1, buffer)
    return buffer.value


def class_of(handle: int) -> str:
    buffer = ctypes.create_unicode_buffer(64)
    u.GetClassNameW(handle, buffer, 64)
    return buffer.value


def find_ok(dialog: int) -> int | None:
    found: list[int] = []

    def visit(child, _):
        if class_of(child).lower() == 'button' and text_of(child).replace('&', '') == 'OK':
            found.append(child)
            return False
        return True

    u.EnumChildWindows(dialog, ENUMPROC(visit), 0)
    return found[0] if found else None


def dismiss() -> str | None:
    dialog = u.FindWindowW(None, 'Error')
    if not dialog:
        return None
    button = find_ok(dialog)
    if button:
        u.SendMessageW(button, BM_CLICK, 0, 0)
        return 'clicked the OK button by handle'
    # Fallback: the dialog exists but has no enumerable button. Press the default.
    u.SetForegroundWindow(dialog)
    time.sleep(0.2)
    u.PostMessageW(dialog, 0x0100, 0x0D, 0)  # WM_KEYDOWN VK_RETURN
    u.PostMessageW(dialog, 0x0101, 0x0D, 0)  # WM_KEYUP
    return 'no OK button found; sent Return to the dialog'


def main() -> None:
    deadline = 0.0
    if '--wait' in sys.argv:
        deadline = time.time() + float(sys.argv[sys.argv.index('--wait') + 1])

    while True:
        result = dismiss()
        if result:
            print(result)
            return
        if time.time() >= deadline:
            print('no error dialog is up')
            return
        time.sleep(1.0)


if __name__ == '__main__':
    main()
