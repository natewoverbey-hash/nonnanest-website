#!/usr/bin/env python3
"""
Nonnanest analytics sync.

Stamps the shared analytics <head> block — currently the OpenAI Ads Pixel
loader at /js/oaiq.js — into the top of <head> on every HTML page in the
repo.

Usage:
    python3 _partials/sync_analytics.py

Idempotent — safe to run repeatedly. Unlike sync.py this walks the repo
rather than using a hand-maintained page list, so newly added pages pick
the Pixel up automatically on the next run.

The block is wrapped in PARTIAL:analytics-* markers; a re-run replaces
whatever sits between them, so editing HEAD_BLOCK below and re-running is
the way to change the snippet site-wide.

On a page that has no markers yet the block goes in after the charset and
viewport metas, not straight after <head>. The parser only scans the first
1024 bytes for an encoding declaration, and this block plus the other head
scripts is easily enough to push charset past that — which costs nothing
while the host sends charset=utf-8, and mangles every non-ASCII character
the moment something serves the page without it.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

START = "<!-- PARTIAL:analytics-start -->"
END = "<!-- PARTIAL:analytics-end -->"

HEAD_BLOCK = """<!-- OpenAI Ads Pixel (base + page_viewed + oppref) -->
<script src="/js/oaiq.js"></script>"""

SKIP_DIRS = {".git", "_partials", "node_modules"}

marked = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
head_open = re.compile(r"<head\b[^>]*>", re.IGNORECASE)
# charset first, then an optional viewport. Anchored at the end of <head>
# and tolerant of any whitespace between the tags, so it does not depend on
# how the page happens to be line-broken.
head_meta = re.compile(
    r"\s*<meta[^>]*\bcharset=[^>]*>"
    r"(?:\s*<meta[^>]*name=[\"\']viewport[\"\'][^>]*>)?",
    re.IGNORECASE,
)


def insert_at(html: str, head_end: int) -> int:
    """Where a fresh block goes: after the charset/viewport metas if present.

    Keeps the encoding declaration inside the 1024 bytes a parser scans for
    it, instead of pushing it past that with the script tags.
    """
    m = head_meta.match(html, head_end)
    return m.end() if m else head_end


def pages():
    for path in sorted(REPO.rglob("*.html")):
        rel = path.relative_to(REPO)
        if SKIP_DIRS & set(rel.parts):
            continue
        yield path


def stamp(path: Path, report: list) -> None:
    html = path.read_text()
    orig = html
    block = f"{START}\n{HEAD_BLOCK}\n{END}"

    if marked.search(html):
        html = marked.sub(block, html, count=1)
    else:
        m = head_open.search(html)
        if not m:
            report.append(f"  ! {path.relative_to(REPO)} (no <head>, skipped)")
            return
        at = insert_at(html, m.end())
        html = html[:at] + "\n" + block + html[at:]

    if html != orig:
        path.write_text(html)
        report.append(f"  ✓ {path.relative_to(REPO)}")
    else:
        report.append(f"  = {path.relative_to(REPO)} (unchanged)")


def main() -> int:
    targets = list(pages())
    print(f"Syncing analytics head block across {len(targets)} pages...")
    report = []
    for path in targets:
        stamp(path, report)
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
