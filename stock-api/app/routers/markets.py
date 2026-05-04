from fastapi import APIRouter

from app.universe import MARKETS

router = APIRouter()


@router.get("/markets")
def get_markets():
    return [m.__dict__ for m in MARKETS.values()]
