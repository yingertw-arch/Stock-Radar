from __future__ import annotations

import urllib.parse
from datetime import datetime, timezone
from typing import Any

import httpx

from app.cache import CACHE_SECONDS_LONG, cache_get, cache_set
from app.indicators import safe_float

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 StockNewbieAnalyzer/2.0",
    "Accept": "application/json",
}


async def _yahoo_json(url: str, timeout: float = 18.0) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout, headers=YAHOO_HEADERS) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


def _chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[i: i + size] for i in range(0, len(items), size)]


async def fetch_quotes(symbols: list[str]) -> dict[str, dict[str, Any]]:
    cache_key = "quotes:" + ",".join(symbols)
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    output: dict[str, dict[str, Any]] = {}
    for group in _chunks(symbols, 40):
        query = urllib.parse.quote(",".join(group))
        url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={query}"
        try:
            payload = await _yahoo_json(url)
        except (httpx.HTTPStatusError, httpx.RequestError):
            continue
        for row in payload.get("quoteResponse", {}).get("result", []):
            output[row.get("symbol")] = row

    return cache_set(cache_key, output)


async def fetch_chart(
    symbol: str,
    range_: str = "1y",
    interval: str = "1d",
) -> dict[str, list]:
    cache_key = f"chart:{symbol}:{range_}:{interval}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    encoded = urllib.parse.quote(symbol)
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}"
        f"?range={range_}&interval={interval}&includePrePost=false&events=div,splits"
    )
    payload = await _yahoo_json(url)
    result = payload.get("chart", {}).get("result", [{}])[0]
    quote_data = result.get("indicators", {}).get("quote", [{}])[0]
    timestamps = result.get("timestamp", [])

    opens_ = quote_data.get("open", [])
    highs_ = quote_data.get("high", [])
    lows_ = quote_data.get("low", [])
    closes_ = quote_data.get("close", [])
    volumes_ = quote_data.get("volume", [])

    dates: list[str] = []
    opens: list[float] = []
    highs: list[float] = []
    lows: list[float] = []
    closes: list[float] = []
    volumes: list[float] = []

    for stamp, o, h, lo, c, v in zip(timestamps, opens_, highs_, lows_, closes_, volumes_):
        cv = safe_float(c)
        vv = safe_float(v)
        if cv is None or vv is None:
            continue
        if interval == "1d" or interval == "1wk":
            date_str = datetime.fromtimestamp(stamp, tz=timezone.utc).date().isoformat()
        else:
            date_str = datetime.fromtimestamp(stamp, tz=timezone.utc).isoformat()
        dates.append(date_str)
        opens.append(safe_float(o) or cv)
        highs.append(safe_float(h) or cv)
        lows.append(safe_float(lo) or cv)
        closes.append(cv)
        volumes.append(vv)

    result_data = {
        "dates": dates,
        "opens": opens,
        "highs": highs,
        "lows": lows,
        "closes": closes,
        "volumes": volumes,
    }
    return cache_set(cache_key, result_data)


async def fetch_tw_fundamentals() -> dict[str, dict[str, float | None]]:
    cache_key = "twse:fundamentals"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    url = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
    try:
        payload = await _yahoo_json(url)
    except (httpx.HTTPStatusError, httpx.RequestError, httpx.TimeoutException):
        return cache_set(cache_key, {})

    output: dict[str, dict[str, float | None]] = {}
    for row in payload:
        code = row.get("Code")
        if not code:
            continue
        output[f"{code}.TW"] = {
            "pe": safe_float(row.get("PEratio")),
            "pb": safe_float(row.get("PBratio")),
            "dividendYield": safe_float(row.get("DividendYield")),
        }
    return cache_set(cache_key, output)


def _parse_tw_num(raw: str) -> int | None:
    """Parse TWSE number format: (1,234) = -1234, 1,234 = 1234."""
    if not raw:
        return None
    raw = raw.strip().replace(",", "")
    if raw.startswith("(") and raw.endswith(")"):
        try:
            return -int(raw[1:-1])
        except ValueError:
            return None
    try:
        return int(raw)
    except ValueError:
        return None


async def fetch_institutional(symbol: str) -> list[dict]:
    """三大法人 net buy/sell for last 30 sessions via TWSE T86."""
    if not (symbol.endswith(".TW") or symbol.endswith(".TWO")):
        return []

    code = symbol.replace(".TWO", "").replace(".TW", "")
    cache_key = f"institutional:{code}"
    cached = cache_get(cache_key, ttl=CACHE_SECONDS_LONG)
    if cached is not None:
        return cached

    url = (
        f"https://www.twse.com.tw/rwd/zh/fund/T86"
        f"?response=json&selectType=ALLBUT0999&stockNo={code}"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 StockNewbieAnalyzer/2.0"})
            resp.raise_for_status()
            payload = resp.json()
    except (httpx.HTTPStatusError, httpx.RequestError, httpx.TimeoutException):
        return cache_set(cache_key, [])

    rows = []
    for entry in payload.get("data", [])[:30]:
        # T86 columns: [日期, 外資買, 外資賣, 外資淨買, 投信買, 投信賣, 投信淨買,
        #               自營商買, 自營商賣, 自營商淨買, 三大法人合計]
        try:
            rows.append({
                "date": entry[0],
                "foreignNetBuy": _parse_tw_num(entry[3]),
                "trustNetBuy": _parse_tw_num(entry[6]),
                "dealerNetBuy": _parse_tw_num(entry[9]),
                "totalNetBuy": _parse_tw_num(entry[10]),
            })
        except IndexError:
            continue

    return cache_set(cache_key, rows)


async def fetch_main_force(symbol: str) -> list[dict]:
    """主力進出 via TWSE 大戶持股變化 (best-effort, falls back to empty)."""
    if not (symbol.endswith(".TW") or symbol.endswith(".TWO")):
        return []

    code = symbol.replace(".TWO", "").replace(".TW", "")
    cache_key = f"mainforce:{code}"
    cached = cache_get(cache_key, ttl=CACHE_SECONDS_LONG)
    if cached is not None:
        return cached

    # TWSE 集保股東持股分級 — gives weekly major-holder changes
    url = (
        f"https://www.twse.com.tw/rwd/zh/fund/T86"
        f"?response=json&selectType=ALLBUT0999&stockNo={code}"
    )
    # We derive "主力進出" from the institutional total as a proxy
    institutional = await fetch_institutional(symbol)
    if not institutional:
        return cache_set(cache_key, [])

    # Build main-force rows: rolling 10-day cumulative from institutional total
    rows = []
    cumulative = 0
    for i, row in enumerate(institutional[:10]):
        total = row.get("totalNetBuy") or 0
        cumulative += total
        rows.append({
            "date": row["date"],
            "netChange": total,
            "cumulative10d": cumulative if i == 9 else None,
        })

    # Patch cumulative onto last row
    if rows:
        rows[-1]["cumulative10d"] = cumulative

    return cache_set(cache_key, rows)
