from __future__ import annotations

import csv
import json
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TWSE_LISTED_URLS = [
    "http://dts.twse.com.tw/opendata/t187ap03_L.csv",
    "https://mopsfin.twse.com.tw/opendata/t187ap03_L.csv",
]
TPEX_OTC_URLS = [
    "http://dts.twse.com.tw/opendata/t187ap03_O.csv",
    "https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv",
]
REMOTE_TW_TTL_SECONDS = 60 * 60 * 24
FALLBACK_TW_TTL_SECONDS = 60 * 5
TW_INDUSTRY_NAMES = {
    "00": "其他",
    "01": "水泥工業",
    "02": "食品工業",
    "03": "塑膠工業",
    "04": "紡織纖維",
    "05": "電機機械",
    "06": "電器電纜",
    "08": "玻璃陶瓷",
    "09": "造紙工業",
    "10": "鋼鐵工業",
    "11": "橡膠工業",
    "12": "汽車工業",
    "14": "建材營造",
    "15": "航運業",
    "16": "觀光餐旅",
    "17": "金融保險",
    "18": "貿易百貨",
    "19": "綜合",
    "20": "其他",
    "21": "化學工業",
    "22": "生技醫療業",
    "23": "油電燃氣業",
    "24": "半導體業",
    "25": "電腦及週邊設備業",
    "26": "光電業",
    "27": "通信網路業",
    "28": "電子零組件業",
    "29": "電子通路業",
    "30": "資訊服務業",
    "31": "其他電子業",
    "32": "文化創意業",
    "33": "農業科技業",
    "35": "綠能環保",
    "36": "數位雲端",
    "37": "運動休閒",
    "38": "居家生活",
    "80": "管理股票",
}


@dataclass(frozen=True)
class Market:
    id: str
    name: str
    universe_file: str
    currency: str


MARKETS: dict[str, Market] = {
    "tw": Market("tw", "台股完整上市上櫃股票池", "tw_universe.json", "TWD"),
    "us": Market("us", "美股大型股觀察池", "us_universe.json", "USD"),
}

_tw_universe_cache: tuple[float, int, list[dict[str, str]]] | None = None


def _load_local_universe(market: Market) -> list[dict[str, str]]:
    path = DATA / market.universe_file
    return json.loads(path.read_text(encoding="utf-8"))


def _fetch_csv_text(urls: list[str]) -> str:
    last_error: Exception | None = None
    for url in urls:
        request = urllib.request.Request(url, headers={"User-Agent": "Stock-Radar/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                text = response.read().decode("utf-8-sig")
            if "公司代號" in text and "公司簡稱" in text:
                return text
            last_error = RuntimeError(f"{url} 回傳內容不是股票池 CSV")
        except urllib.error.URLError as exc:
            last_error = exc
            if url.startswith("https://") and "CERTIFICATE_VERIFY_FAILED" in str(exc):
                context = ssl._create_unverified_context()
                try:
                    with urllib.request.urlopen(request, timeout=8, context=context) as response:
                        text = response.read().decode("utf-8-sig")
                    if "公司代號" in text and "公司簡稱" in text:
                        return text
                    last_error = RuntimeError(f"{url} 回傳內容不是股票池 CSV")
                except Exception as retry_exc:
                    last_error = retry_exc
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"無法下載官方股票池 CSV: {last_error}")


def _remote_tw_rows(urls: list[str], suffix: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    text = _fetch_csv_text(urls)
    for row in csv.DictReader(StringIO(text)):
        code = (row.get("公司代號") or "").strip()
        name = (row.get("公司簡稱") or row.get("公司名稱") or "").strip()
        sector_code = (row.get("產業別") or "").strip()
        sector = TW_INDUSTRY_NAMES.get(sector_code, sector_code)
        if not code.isdigit() or not name:
            continue
        rows.append({"symbol": f"{code}.{suffix}", "name": name, "sector": sector})
    return rows


def _load_remote_tw_universe() -> list[dict[str, str]]:
    listed = _remote_tw_rows(TWSE_LISTED_URLS, "TW")
    otc = _remote_tw_rows(TPEX_OTC_URLS, "TWO")
    if len(listed) + len(otc) < 1000:
        raise RuntimeError("台股官方股票池資料筆數異常。")
    return listed + otc


def _merge_by_symbol(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: dict[str, dict[str, str]] = {}
    for row in rows:
        symbol = row["symbol"].upper()
        merged[symbol] = {**row, "symbol": symbol}
    return list(merged.values())


def load_universe(market: Market) -> list[dict[str, str]]:
    if market.id != "tw":
        return _load_local_universe(market)

    global _tw_universe_cache
    now = time.time()
    if _tw_universe_cache:
        cached_at, ttl, rows = _tw_universe_cache
        if now - cached_at < ttl:
            return rows

    local_rows = _load_local_universe(market)
    try:
        rows = _merge_by_symbol(_load_remote_tw_universe() + local_rows)
        ttl = REMOTE_TW_TTL_SECONDS
    except Exception:
        rows = local_rows
        ttl = FALLBACK_TW_TTL_SECONDS

    _tw_universe_cache = (now, ttl, rows)
    return rows


def find_universe_stock(symbol: str, preferred_market_id: str = "tw") -> dict[str, str] | None:
    target = normalize_symbol(symbol, preferred_market_id)
    aliases = {target, target.split(".")[0]}
    if target.endswith(".TW"):
        aliases.add(target.replace(".TW", ".TWO"))
    if target.endswith(".TWO"):
        aliases.add(target.replace(".TWO", ".TW"))

    markets = [market_for_symbol(target, preferred_market_id)]
    markets.extend(m for m in MARKETS.values() if m not in markets)

    for market in markets:
        for row in load_universe(market):
            row_symbol = row["symbol"].upper()
            if row_symbol in aliases or row_symbol.split(".")[0] in aliases:
                return row
    return None


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
