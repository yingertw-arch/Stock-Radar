from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException

from app.routers import market_analysis, markets, movers, sectors, stock, taiex


def create_app() -> FastAPI:
    app = FastAPI(
        title="Taiwan Stock Analysis API",
        version="2.0.0",
        description="股票分析 API — 支援個股儀表板、大盤、產業、自選股",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restrict to your GitHub Pages domain in production
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail},
        )

    app.include_router(markets.router, prefix="/api")
    app.include_router(stock.router, prefix="/api")
    app.include_router(market_analysis.router, prefix="/api")
    app.include_router(taiex.router, prefix="/api")
    app.include_router(sectors.router, prefix="/api")
    app.include_router(movers.router, prefix="/api")

    @app.get("/")
    def root():
        return {"status": "ok", "version": "2.0.0"}

    return app


app = create_app()
