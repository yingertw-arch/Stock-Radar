from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


@dataclass(frozen=True)
class Market:
    id: str
    name: str
    universe_file: str
    currency: str


MARKETS: dict[str, Market] = {
    "tw": Market("tw", "台股大型股觀察池", "tw_universe.json", "TWD"),
    "us": Market("us", "美股大型股觀察池", "us_universe.json", "USD"),
}


def load_universe(market: Market) -> list[dict[str, str]]:
    path = DATA / market.universe_file
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_symbol(raw_symbol: str, market_id: str = "tw") -> str:
    symbol = raw_symbol.strip().upper().replace(" ", "")
    if not symbol:
        raise ValueError("請輸入股票代號。")
    if symbol.isdigit() and market_id == "tw":
        return f"{symbol}.TW"
    return symbol


def market_for_symbol(symbol: str, preferred_market_id: str = "tw") -> Market:
    if symbol.endswith(".TW") or symbol.endswith(".TWO"):
        return MARKETS["tw"]
    if preferred_market_id == "tw" and symbol.isdigit():
        return MARKETS["tw"]
    return MARKETS.get(preferred_market_id, MARKETS["us"])
