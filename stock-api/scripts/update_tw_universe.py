from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.universe import MARKETS, _load_local_universe, _load_remote_tw_universe, _merge_by_symbol


def main() -> None:
    rows = _merge_by_symbol(_load_remote_tw_universe() + _load_local_universe(MARKETS["tw"]))
    path = ROOT / "data" / "tw_universe.json"
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    print(f"Updated {path} with {len(rows)} Taiwan stocks/ETFs.")


if __name__ == "__main__":
    main()
