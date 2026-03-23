import aqt.reviewer
from aqt import mw, gui_hooks
from anki.cards import Card

try:
    from anki.notetypes_pb2 import StockNotetype
    _IO_STOCK_KIND = StockNotetype.OriginalStockKind.ORIGINAL_STOCK_KIND_IMAGE_OCCLUSION
except Exception:
    _IO_STOCK_KIND = 6  # fallback literal

# ── State ──────────────────────────────────────────────────────────────────

_active = False

# ── Helpers ────────────────────────────────────────────────────────────────

def _is_image_occlusion(card: Card) -> bool:
    return card.note_type().get("originalStockKind") == _IO_STOCK_KIND

# ── Hook: question shown ───────────────────────────────────────────────────

def _on_question_shown(card: Card) -> None:
    global _active
    _active = False
    if _is_image_occlusion(card):
        _active = True
        mw.reviewer.web.eval("ioInit();")

# ── Hook: answer shown ─────────────────────────────────────────────────────

def _on_answer_shown(card: Card) -> None:
    global _active
    _active = False

# ── Hook: intercept spacebar ───────────────────────────────────────────────

def _on_shortcuts_will_change(state: str, shortcuts: list) -> None:
    if state != "review":
        return
    for i, (key, fn) in enumerate(shortcuts):
        if key == " ":
            original_fn = fn

            def space_handler(orig=original_fn) -> None:
                if _active:
                    mw.reviewer.web.eval("ioRevealNext();")
                else:
                    orig()

            shortcuts[i] = (" ", space_handler)
            break

# ── Hook: handle pycmd from JS ─────────────────────────────────────────────

def _on_js_message(handled: tuple, message: str, context) -> tuple:
    if isinstance(context, aqt.reviewer.Reviewer) and message == "ioShowAnswer":
        global _active
        _active = False
        mw.reviewer._getTypedAnswer()
        return (True, None)
    return handled

# ── Hook: inject JS into reviewer ─────────────────────────────────────────

def _on_webview_will_set_content(web_content, context) -> None:
    if not isinstance(context, aqt.reviewer.Reviewer):
        return
    pkg = mw.addonManager.addonFromModule(__name__)
    web_content.js.append(f"/_addons/{pkg}/web/reviewer.js")

# ── Setup ──────────────────────────────────────────────────────────────────

mw.addonManager.setWebExports(__name__, r"web/.*\.js")
gui_hooks.reviewer_did_show_question.append(_on_question_shown)
gui_hooks.reviewer_did_show_answer.append(_on_answer_shown)
gui_hooks.state_shortcuts_will_change.append(_on_shortcuts_will_change)
gui_hooks.webview_did_receive_js_message.append(_on_js_message)
gui_hooks.webview_will_set_content.append(_on_webview_will_set_content)
