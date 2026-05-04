from fastapi import APIRouter, HTTPException, Query

from app.fetchers import fetch_quotes
from app.indicators import safe_float
from app.universe import MARKETS, load_universe

router = APIRouter()


@router.get("/movers")
async def get_movers(market: str = Query("tw")):
    m = MARKETS.get(market, MARKETS["tw"])
    universe = load_universe(m)
    symbols = [row["symbol"] for row in universe]

    try:
        quotes = await fetch_quotes(symbols)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    rows = []
    for sym, q in quotes.items():
        change = safe_float(q.get("regularMarketChangePercent"))
        if change is None:
            continue
        rows.append({
            "symbol": sym,
            "name": q.get("shortName") or sym,
            "price": safe_float(q.get("regularMarketPrice")),
            "dayChangePct": change,
        })

    rows.sort(key=lambda x: x["dayChangePct"], reverse=True)
    return {
        "market": market,
        "gainers": rows[:10],
        "losers": rows[-10:][::-1],
    }
