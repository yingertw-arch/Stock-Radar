from fastapi import APIRouter, HTTPException

from app.fetchers import fetch_quotes
from app.indicators import safe_float

router = APIRouter()

TW_SECTOR_INDICES = [
    {"symbol": "0050.TW", "name": "元大台灣50", "sector": "大型股"},
    {"symbol": "0051.TW", "name": "元大中型100", "sector": "中型股"},
    {"symbol": "00892.TW", "name": "富邦台灣半導體", "sector": "半導體"},
    {"symbol": "00881.TW", "name": "國泰台灣5G+", "sector": "5G/科技"},
    {"symbol": "00733.TW", "name": "富邦臺灣中小", "sector": "中小型股"},
    {"symbol": "00941.TW", "name": "中信關鍵半導體", "sector": "IC設計"},
    {"symbol": "0056.TW", "name": "元大高股息", "sector": "高股息"},
    {"symbol": "00878.TW", "name": "國泰永續高股息", "sector": "ESG"},
]


@router.get("/sectors")
async def get_sectors():
    symbols = [s["symbol"] for s in TW_SECTOR_INDICES]
    try:
        quotes = await fetch_quotes(symbols)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = []
    for entry in TW_SECTOR_INDICES:
        q = quotes.get(entry["symbol"], {})
        result.append({
            "symbol": entry["symbol"],
            "name": entry["name"],
            "sector": entry["sector"],
            "price": safe_float(q.get("regularMarketPrice")),
            "dayChangePct": safe_float(q.get("regularMarketChangePercent")),
            "dayChangeAbs": safe_float(q.get("regularMarketChange")),
        })
    return {"sectors": result}
