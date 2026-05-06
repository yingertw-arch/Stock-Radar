import asyncio

from fastapi import APIRouter

from app.fetchers import fetch_chart, fetch_quotes
from app.indicators import safe_float

router = APIRouter()

TW_SECTOR_INDICES = [
    {"symbol": "0050.TW",  "name": "元大台灣50",     "sector": "大型股"},
    {"symbol": "0051.TW",  "name": "元大中型100",    "sector": "中型股"},
    {"symbol": "00892.TW", "name": "富邦台灣半導體", "sector": "半導體"},
    {"symbol": "00881.TW", "name": "國泰台灣5G+",    "sector": "5G/科技"},
    {"symbol": "00733.TW", "name": "富邦臺灣中小",   "sector": "中小型股"},
    {"symbol": "00941.TW", "name": "中信關鍵半導體", "sector": "IC設計"},
    {"symbol": "0056.TW",  "name": "元大高股息",     "sector": "高股息"},
    {"symbol": "00878.TW", "name": "國泰永續高股息", "sector": "ESG"},
]


def _quote_from_chart_meta(meta: dict, closes: list) -> dict:
    price = safe_float(meta.get("regularMarketPrice")) or (closes[-1] if closes else None)
    prev  = safe_float(meta.get("chartPreviousClose")) or safe_float(meta.get("previousClose"))
    pct   = round((price - prev) / prev * 100, 2) if price and prev and prev != 0 else None
    return {
        "regularMarketPrice":         price,
        "regularMarketChangePercent": pct,
        "regularMarketChange":        round(price - prev, 2) if price and prev else None,
    }


@router.get("/sectors")
async def get_sectors():
    symbols = [s["symbol"] for s in TW_SECTOR_INDICES]

    # Try v7 batch quote first
    try:
        quotes = await fetch_quotes(symbols)
    except Exception:
        quotes = {}

    # For symbols missing price, fall back to v8 chart meta (works on Vercel)
    missing = [s for s in symbols if not safe_float(quotes.get(s, {}).get("regularMarketPrice"))]
    if missing:
        charts = await asyncio.gather(
            *[fetch_chart(s, range_="5d", interval="1d") for s in missing],
            return_exceptions=True,
        )
        for sym, chart in zip(missing, charts):
            if not isinstance(chart, Exception):
                quotes[sym] = _quote_from_chart_meta(chart.get("meta", {}), chart.get("closes", []))

    result = []
    for entry in TW_SECTOR_INDICES:
        q = quotes.get(entry["symbol"], {})
        result.append({
            "symbol":      entry["symbol"],
            "name":        entry["name"],
            "sector":      entry["sector"],
            "price":       safe_float(q.get("regularMarketPrice")),
            "dayChangePct": safe_float(q.get("regularMarketChangePercent")),
            "dayChangeAbs": safe_float(q.get("regularMarketChange")),
        })
    return {"sectors": result}
