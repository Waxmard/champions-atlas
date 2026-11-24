#!/bin/bash
set -euo pipefail

python3 -B - <<'PY'
import json
import os
import sys

with open("doc-budgets.json", encoding="utf-8") as fh:
    budgets = json.load(fh)

failed = False
for path, cap in sorted(budgets.items()):
    if not os.path.exists(path):
        print(f"DOC BUDGET: missing {path} listed in doc-budgets.json", file=sys.stderr)
        failed = True
        continue
    size = os.path.getsize(path)
    if size > cap:
        print(
            f"DOC BUDGET: {path} is {size} bytes (max {cap}); "
            "move enforceable rules into linters/types or procedures into skills "
            "instead of growing prose",
            file=sys.stderr,
        )
        failed = True

if failed:
    sys.exit(1)
print(f"doc-budgets OK: {len(budgets)} file(s) checked")
PY
