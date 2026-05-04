from fastapi import APIRouter, HTTPException, Query

from app.scoring import analyze_market

router = APIRouter()


@router.get("/analyze")
async def get_analysis(market: str = Query("tw")):
    try:
        return await analyze_market(market)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
