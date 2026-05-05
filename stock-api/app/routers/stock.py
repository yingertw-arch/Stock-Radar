from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query

from app.fetchers import fetch_chart, fetch_institutional, fetch_main_force, fetch_quotes
from app.indicators import (
    ai_win_rate,
    bollinger_bands,
    detect_patterns,
    key_price_levels,
    macd_series,
    main_force_signal,
    moving_average,
    percent_change,
    safe_float,
    stochastic_kd,
    technical_signals,
    technical_summary_table,
    trading_suggestion,
    volume_ratio,
)
from app.scoring import analyze_one_stock, overheat_score, score_stock
from app.universe import MARKETS, load_universe, market_for_symbol, normalize_symbol

router = APIRouter()


# ---------------------------------------------------------------------------
# Search: by name or symbol across both universes
# ---------------------------------------------------------------------------

@router.get("/search")
async def search_stocks(q: str = Query(..., min_length=1)):
    """模糊搜尋股票名稱或代號（台股＋美股）"""
    raw = q.strip().lower()
    cleaned = raw.replace("-", "").replace(" ", "").replace("ky", "")

    results: list[dict] = []
    for market_id, market in MARKETS.items():
        for s in load_universe(market):
            name_c = s["name"].lower().replace("-", "").replace(" ", "").replace("ky", "")
            sym_base = s["symbol"].lower().split(".")[0]
            if cleaned in name_c or cleaned in sym_base or sym_base.startswith(cleaned):
                results.append({**s, "market": market_id})

    # Sort: exact symbol match first, then starts-with, then contains
    def _rank(x: dict) -> int:
        b = x["symbol"].lower().split(".")[0]
        if b == cleaned or b == raw:
            return 0
        if b.startswith(cleaned):
            return 1
        return 2

    results.sort(key=_rank)
    return results[:10]


def _period_to_yf(period: str) -> tuple[str, str]:
    return {"60m": ("60d", "60m"), "1d": ("1y", "1d"), "1wk": ("2y", "1wk")}[period]


# ---------------------------------------------------------------------------
# Preserved endpoint
# ---------------------------------------------------------------------------

@router.get("/stock")
async def get_stock(
    symbol: str = Query(..., description="股票代號，例如 2330 或 AAPL"),
    market: str = Query("tw"),
):
    try:
        return await analyze_one_stock(symbol, market)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# New: K-line data
# ---------------------------------------------------------------------------

@router.get("/stock/{symbol}/kline")
async def get_kline(
    symbol: str = Path(...),
    period: str = Query("1d", pattern="^(60m|1d|1wk)$"),
):
    range_, interval = _period_to_yf(period)
    try:
        chart = await fetch_chart(symbol, range_=range_, interval=interval)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    bars = [
        {
            "t": chart["dates"][i],
            "o": chart["opens"][i],
            "h": chart["highs"][i],
            "l": chart["lows"][i],
            "c": chart["closes"][i],
            "v": chart["volumes"][i],
        }
        for i in range(len(chart["dates"]))
    ]
    return {"symbol": symbol, "period": period, "bars": bars}


# ---------------------------------------------------------------------------
# New: KD indicator
# ---------------------------------------------------------------------------

@router.get("/stock/{symbol}/kd")
async def get_kd(
    symbol: str = Path(...),
    period: str = Query("1d", pattern="^(1d|1wk)$"),
):
    range_, interval = _period_to_yf(period)
    try:
        chart = await fetch_chart(symbol, range_=range_, interval=interval)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    kd = stochastic_kd(chart["highs"], chart["lows"], chart["closes"])
    return {"symbol": symbol, "period": period, "dates": chart["dates"], "k": kd["k"], "d": kd["d"]}


# ---------------------------------------------------------------------------
# New: MACD series
# ---------------------------------------------------------------------------

@router.get("/stock/{symbol}/macd")
async def get_macd_endpoint(
    symbol: str = Path(...),
    period: str = Query("1d", pattern="^(1d|1wk)$"),
):
    range_, interval = _period_to_yf(period)
    try:
        chart = await fetch_chart(symbol, range_=range_, interval=interval)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    result = macd_series(chart["closes"])
    offset = len(chart["closes"]) - len(result["lines"])
    dates = chart["dates"][offset:]
    return {
        "symbol": symbol,
        "period": period,
        "dates": dates,
        "line": result["lines"],
        "signal": result["signals"],
        "histogram": result["histograms"],
    }


# ---------------------------------------------------------------------------
# New: 三大法人
# ---------------------------------------------------------------------------

@router.get("/stock/{symbol}/institutional")
async def get_institutional(symbol: str = Path(...)):
    data = await fetch_institutional(symbol)
    return {"symbol": symbol, "data": data}


# ---------------------------------------------------------------------------
# New: /dashboard — combined endpoint for the full stock analysis screen
# ---------------------------------------------------------------------------

@router.get("/stock/{symbol}/dashboard")
async def get_dashboard(symbol: str = Path(...)):
    """
    Single combined endpoint that returns all data needed for the individual
    stock dashboard screen (K線, KD, MACD, 布林通道, 三大法人, 技術燈號, etc.)
    """
    sym = normalize_symbol(symbol)
    # For pure-digit Taiwan codes, also prepare the .TWO variant as fallback
    raw_digits = symbol.strip().upper().replace(" ", "")
    sym_two = f"{raw_digits}.TWO" if raw_digits.isdigit() else None
    market = market_for_symbol(sym)

    try:
        # Parallel fetch of all data sources
        (
            chart_daily,
            chart_60m,
            chart_weekly,
            quotes_result,
            institutional,
            main_force,
        ) = await asyncio.gather(
            fetch_chart(sym, range_="1y", interval="1d"),
            fetch_chart(sym, range_="60d", interval="60m"),
            fetch_chart(sym, range_="2y", interval="1wk"),
            fetch_quotes([sym]),
            fetch_institutional(sym),
            fetch_main_force(sym),
            return_exceptions=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # Handle per-fetch exceptions gracefully
    def _safe(v: Any, fallback: Any) -> Any:
        return fallback if isinstance(v, Exception) else v

    chart = _safe(chart_daily, {"dates": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []})
    c60m = _safe(chart_60m, {"dates": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []})
    cwk = _safe(chart_weekly, {"dates": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []})
    institutional = _safe(institutional, [])
    main_force = _safe(main_force, [])

    quotes_map = _safe(quotes_result, {})
    quote = quotes_map.get(sym, {})

    closes = chart["closes"]
    volumes = chart["volumes"]
    highs = chart["highs"]
    lows = chart["lows"]

    # If .TW had insufficient data, retry with .TWO (上櫃股)
    if len(closes) < 20 and sym_two and sym_two != sym:
        sym = sym_two
        market = market_for_symbol(sym)
        try:
            (
                chart_daily,
                chart_60m,
                chart_weekly,
                quotes_result,
                institutional,
                main_force,
            ) = await asyncio.gather(
                fetch_chart(sym, range_="1y", interval="1d"),
                fetch_chart(sym, range_="60d", interval="60m"),
                fetch_chart(sym, range_="2y", interval="1wk"),
                fetch_quotes([sym]),
                fetch_institutional(sym),
                fetch_main_force(sym),
                return_exceptions=True,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        chart = _safe(chart_daily, {"dates": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []})
        c60m = _safe(chart_60m, {"dates": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []})
        cwk = _safe(chart_weekly, {"dates": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []})
        institutional = _safe(institutional, [])
        main_force = _safe(main_force, [])
        quotes_map = _safe(quotes_result, {})
        quote = quotes_map.get(sym, {})
        closes = chart["closes"]
        volumes = chart["volumes"]
        highs = chart["highs"]
        lows = chart["lows"]

    if len(closes) < 20:
        raise HTTPException(status_code=404, detail="歷史資料不足，無法產生儀表板。")

    price = safe_float(quote.get("regularMarketPrice")) or closes[-1]
    day_change_abs = safe_float(quote.get("regularMarketChange"))
    day_change_pct = safe_float(quote.get("regularMarketChangePercent"))
    vol_raw = safe_float(quote.get("regularMarketVolume"))
    bid = safe_float(quote.get("bid"))
    ask = safe_float(quote.get("ask"))

    # Technical scores
    tech = score_stock(price, quote, closes, volumes)
    dummy_item = {"symbol": sym, "price": price, "technical": tech, "marketCap": safe_float(quote.get("marketCap"))}
    oh_score, _ = overheat_score(dummy_item)

    # Indicators
    bb = bollinger_bands(closes, 20, 2)
    kd = stochastic_kd(highs, lows, closes)
    macd_result = macd_series(closes)
    macd_offset = len(closes) - len(macd_result["lines"])

    # Key price levels
    key_levels = key_price_levels(highs, lows, closes)

    # Signals
    signals = technical_signals(chart, quote, closes, volumes)
    mf_signal = main_force_signal(
        oh_score, tech["score"], tech.get("volumeRatio"), tech.get("weekChangePct")
    )
    win_rate = ai_win_rate(tech["score"], oh_score, tech.get("volumeRatio"), tech.get("rsi14"))
    patterns = detect_patterns(highs, lows, closes)
    suggestion = trading_suggestion(key_levels, tech["score"], oh_score, tech.get("rsi14"))
    tech_table = technical_summary_table(closes, volumes, quote)

    # Multi-period mini chart data (last 60 bars of each period)
    def _mini_bars(c: dict) -> list[dict]:
        n = min(60, len(c["dates"]))
        return [
            {"t": c["dates"][i], "o": c["opens"][i], "h": c["highs"][i],
             "l": c["lows"][i], "c": c["closes"][i], "v": c["volumes"][i]}
            for i in range(len(c["dates"]) - n, len(c["dates"]))
        ]

    def _period_trend(c: dict, label: str) -> dict[str, str]:
        cl = c.get("closes", [])
        if len(cl) < 5:
            return {"trend": "資料不足", "state": label}
        w = percent_change(cl, min(5, len(cl) - 1)) or 0
        m = percent_change(cl, min(20, len(cl) - 1)) or 0
        ma20v = moving_average(cl, min(20, len(cl)))
        if w > 3 and m > 8:
            trend = "主升段" if label == "週K（長線）" else "多頭趨勢"
        elif w > 0 and ma20v and cl[-1] > ma20v:
            trend = "波段強勢" if label == "週K（長線）" else "高檔整理"
        elif w < -3:
            trend = "空頭趨勢"
        else:
            trend = "高檔震盪"
        return {"trend": trend, "state": label}

    return {
        "symbol": sym,
        "name": quote.get("shortName") or quote.get("longName") or sym,
        "price": price,
        "dayChangePct": day_change_pct,
        "dayChangeAbs": day_change_abs,
        "volume": int(vol_raw) if vol_raw else None,
        "bid": bid,
        "ask": ask,
        "chart": {
            "dates": chart["dates"],
            "opens": chart["opens"],
            "highs": highs,
            "lows": lows,
            "closes": closes,
            "volumes": volumes,
            "bollinger": bb,
        },
        "kd": {
            "dates": chart["dates"],
            "k": kd["k"],
            "d": kd["d"],
        },
        "macd": {
            "dates": chart["dates"][macd_offset:],
            "line": macd_result["lines"],
            "signal": macd_result["signals"],
            "histogram": macd_result["histograms"],
        },
        "institutional": institutional[:5],
        "mainForce": main_force[:5],
        "keyPriceLevels": key_levels,
        "technicalSignals": signals,
        "mainForceSignal": mf_signal,
        "aiWinRate": win_rate,
        "patternAnalysis": patterns,
        "technicalSummary": tech_table,
        "tradingSuggestion": suggestion,
        "multiPeriodCharts": {
            "60m": {**_period_trend(c60m, "60分K（短線）"), "bars": _mini_bars(c60m)},
            "1d": {**_period_trend(chart, "日K（中線）"), "bars": _mini_bars(chart)},
            "1wk": {**_period_trend(cwk, "週K（長線）"), "bars": _mini_bars(cwk)},
        },
    }
