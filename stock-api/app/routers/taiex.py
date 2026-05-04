from fastapi import APIRouter, HTTPException

from app.fetchers import fetch_chart, fetch_quotes
from app.indicators import safe_float

router = APIRouter()


@router.get("/taiex")
async def get_taiex():
    symbol = "^TWII"
    try:
        chart, quotes = await __import__("asyncio").gather(
            fetch_chart(symbol, range_="1y", interval="1d"),
            fetch_quotes([symbol]),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    quote = quotes.get(symbol, {})
    price = safe_float(quote.get("regularMarketPrice")) or (chart["closes"][-1] if chart["closes"] else None)
    return {
        "symbol": symbol,
        "name": "台股加權指數",
        "price": price,
        "dayChangePct": safe_float(quote.get("regularMarketChangePercent")),
        "dayChangeAbs": safe_float(quote.get("regularMarketChange")),
        "sparkline": chart["closes"][-60:],
        "dates": chart["dates"][-60:],
    }
