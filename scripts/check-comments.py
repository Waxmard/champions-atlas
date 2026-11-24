#!/usr/bin/env python3
from __future__ import annotations

import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

KEEP_PREFIXES = (
    "SPDX-License-Identifier:",
    "biome-ignore format:",
    "prettier-ignore",
    "ponytail:",
)
URL_RE = re.compile(r"https?://\S+")
SUPPRESSION_RE = re.compile(
    r"(?:eslint-disable|biome-ignore(?! format:)|svelte-ignore|@ts-ignore"
    r"|@ts-expect-error|#\s*noqa\b|#\s*type:\s*ignore\b)"
)
ALLOWED_SUPPRESSIONS: set[str] = set()
TARGET_SUFFIXES = frozenset(
    {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".svelte"}
)
REGEX_PRECEDERS = frozenset("(,=:[!&|?{};+-*%~^")
REGEX_KEYWORDS = frozenset(
    {
        "return",
        "typeof",
        "case",
        "void",
        "delete",
        "in",
        "of",
        "throw",
        "new",
        "do",
        "else",
        "yield",
        "await",
    }
)
WORD_END_RE = re.compile(r"[A-Za-z_$][\w$]*$")
SVELTE_BLOCK_RE = re.compile(
    r"<(script|style)\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>(.*?)</\1>", re.S
)
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
MESSAGE = (
    "disallowed comment; delete narration or encode the constraint in a type, "
    "lint, or test"
)


def is_kept(comment: str, *, allow_docstrings: bool = False) -> bool:
    if comment.startswith("#!"):
        return True
    if SUPPRESSION_RE.search(comment) and not any(
        a in comment for a in ALLOWED_SUPPRESSIONS
    ):
        return False
    body = comment.removeprefix("<!--").lstrip("#/").lstrip("*").strip()
    if body.startswith(KEEP_PREFIXES) or URL_RE.search(body):
        return True
    return allow_docstrings and comment.startswith("/**")


def _skip_js_string(text: str, start: int, line: int) -> tuple[int, int]:
    quote = text[start]
    i, n = start + 1, len(text)
    while i < n:
        ch = text[i]
        if ch == "\\" and i + 1 < n:
            if text[i + 1] == "\n":
                line += 1
            i += 2
            continue
        if ch == "\n":
            line += 1
        i += 1
        if ch == quote:
            break
    return i, line


def _starts_js_regex(text: str, i: int) -> bool:
    j = i - 1
    while j >= 0 and text[j] in " \t\r\n":
        j -= 1
    if j < 0 or text[j] in REGEX_PRECEDERS or text.endswith("=>", 0, j + 1):
        return True
    word = WORD_END_RE.search(text, max(0, j - 10), j + 1)
    return word is not None and word.group() in REGEX_KEYWORDS


def _skip_js_regex(text: str, start: int) -> int:
    i, n, in_class = start + 1, len(text), False
    while i < n and text[i] != "\n":
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "[":
            in_class = True
        elif ch == "]":
            in_class = False
        elif ch == "/" and not in_class:
            return i + 1
        i += 1
    return i


def scan_js_comments(text: str) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    i, n, line = 0, len(text), 1
    while i < n:
        ch = text[i]
        if ch == "\n":
            line += 1
            i += 1
            continue
        if ch in ("'", '"', "`"):
            i, line = _skip_js_string(text, i, line)
            continue
        if text.startswith("//", i):
            end = text.find("\n", i)
            end = n if end == -1 else end
            found.append((line, text[i:end]))
            i = end
            continue
        if text.startswith("/*", i):
            start_line = line
            end = text.find("*/", i + 2)
            end = n if end == -1 else end + 2
            line += text[i:end].count("\n")
            found.append((start_line, text[i:end]))
            i = end
            continue
        if ch == "/" and _starts_js_regex(text, i):
            i = _skip_js_regex(text, i)
            continue
        i += 1
    return found


def scan_svelte_comments(text: str) -> list[tuple[int, str]]:
    def line_at(pos: int) -> int:
        return text.count("\n", 0, pos) + 1

    found: list[tuple[int, str]] = []
    for block in SVELTE_BLOCK_RE.finditer(text):
        start = block.start(2)
        if block.group(1) == "script":
            base = line_at(start) - 1
            found.extend(
                (base + line, body) for line, body in scan_js_comments(block.group(2))
            )
        else:
            found.extend(
                (line_at(start + css.start()), css.group())
                for css in CSS_COMMENT_RE.finditer(block.group(2))
            )
    markup = SVELTE_BLOCK_RE.sub(lambda b: "\n" * b.group().count("\n"), text)
    found.extend(
        (markup.count("\n", 0, html.start()) + 1, html.group())
        for html in HTML_COMMENT_RE.finditer(markup)
    )
    return sorted(found)


def comments_in(path: Path, text: str) -> list[tuple[int, str]]:
    if path.suffix == ".py":
        tokens = tokenize.generate_tokens(io.StringIO(text).readline)
        return [(t.start[0], t.string) for t in tokens if t.type == tokenize.COMMENT]
    if path.suffix == ".svelte":
        return scan_svelte_comments(text)
    return scan_js_comments(text)


def iter_target_files(args: list[str]) -> list[Path]:
    names = (
        args
        or subprocess.run(
            ["git", "ls-files", "-z"], capture_output=True, text=True, check=True
        ).stdout.split("\0")
    )
    return [Path(name) for name in names if Path(name).suffix in TARGET_SUFFIXES]


def main() -> int:
    failed = False
    for path in iter_target_files(sys.argv[1:]):
        if not path.is_file():
            continue
        for line, comment in comments_in(path, path.read_text(encoding="utf-8")):
            if not is_kept(comment):
                print(f"{path}:{line}: {MESSAGE}", file=sys.stderr)
                failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
