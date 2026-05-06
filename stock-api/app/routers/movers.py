import asyncio

from fastapi import APIRouter, Query

from app.fetchers import fetch_chart, fetch_quotes
from app.indicators import safe_float
from app.universe import MARKETS, load_universe

router = APIRouter()


def _quote_from_chart_meta(meta: dict, closes: list) -> dict:
    price = safe_float(meta.get("regularMarketPrice")) or (closes[-1] if closes else None)
    prev  = safe_float(meta.get("chartPreviousClose")) or safe_float(meta.get("previousClose"))
    pct   = round((price - prev) / prev * 100, 2) if price and prev and prev != 0 else None
    return {
        "regularMarketPrice":         price,
        "regularMarketChangePercent": pct,
        "shortName": meta.get("shortName"),
        "longName":  meta.get("longName"),
    }


@router.get("/movers")
async def get_movers(market: str = Query("tw")):
    m = MARKETS.get(market, MARKETS["tw"])
    universe = load_universe(m)
    symbols = [row["symbol"] for row in universe]
    name_map = {row["symbol"]: row["name"] for row in universe}

    # Try v7 batch quote
    try:
        quotes = await fetch_quotes(symbols)
    except Exception:
        quotes = {}

    # For symbols missing change%, fall back to v8 chart (works on Vercel)
    missing = [s for s in symbols if quotes.get(s, {}).get("regularMarketChangePercent") is None]
    if missing:
        charts = await asyncio.gather(
            *[fetch_chart(s, range_="5d", interval="1d") for s in missing],
            return_exceptions=True,
        )
        for sym, chart in zip(missing, charts):
            if not isinstance(chart, Exception):
                quotes[sym] = _quote_from_chart_meta(chart.get("meta", {}), chart.get("closes", []))

    rows = []
    for sym in symbols:
        q = quotes.get(sym, {})
        change = safe_float(q.get("regularMarketChangePercent"))
        if change is None:
            continue
        rows.append({
            "symbol":      sym,
            "name":        name_map.get(sym) or q.get("shortName") or sym,
            "price":       safe_float(q.get("regularMarketPrice")),
            "dayChangePct": change,
        })

    rows.sort(key=lambda x: x["dayChangePct"], reverse=True)
    return {
        "market":  market,
        "gainers": rows[:10],
        "losers":  rows[-10:][::-1],
    }
