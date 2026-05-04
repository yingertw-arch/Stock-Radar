from __future__ import annotations

from typing import Any

from app.cache import cache_get, cache_set
from app.fetchers import fetch_chart, fetch_quotes
from app.indicators import (
    clamp,
    correlation_label,
    daily_returns_by_date,
    rolling_correlation,
    safe_float,
)
from app.scoring import score_stock

US_BENCHMARKS: list[dict[str, str]] = [
    {"symbol": "^GSPC", "name": "S&P 500", "role": "美股大盤風險胃納"},
    {"symbol": "^IXIC", "name": "NASDAQ", "role": "科技成長股動能"},
    {"symbol": "^DJI", "name": "Dow Jones", "role": "大型價值股溫度"},
    {"symbol": "^SOX", "name": "Philadelphia Semiconductor", "role": "半導體供應鏈領先訊號"},
    {"symbol": "^VIX", "name": "VIX", "role": "市場恐慌與避險壓力"},
]


async def benchmark_snapshot(symbol: str, name: str, role: str) -> dict[str, Any]:
    chart = await fetch_chart(symbol)
    closes = chart["closes"]
    volumes = chart["volumes"]
    quotes = await fetch_quotes([symbol])
    quote = quotes.get(symbol, {})
    price = safe_float(quote.get("regularMarketPrice")) or closes[-1]
    return {
        "symbol": symbol,
        "name": name,
        "role": role,
        "price": price,
        "currency": quote.get("currency") or "USD",
        "updatedFrom": chart["dates"][-1] if chart["dates"] else None,
        "technical": score_stock(price, quote, closes, volumes),
        "sparkline": closes[-60:],
    }


async def summarize_us_taiwan_link() -> dict[str, Any]:
    cache_key = "macro:us-taiwan-link"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    import asyncio

    benchmarks: list[dict[str, Any]] = []
    charts: dict[str, dict[str, list]] = {}
    errors: list[str] = []

    for bm in US_BENCHMARKS:
        sym = bm["symbol"]
        try:
            charts[sym] = await fetch_chart(sym)
            benchmarks.append(await benchmark_snapshot(sym, bm["name"], bm["role"]))
        except Exception as exc:
            errors.append(f"{sym}: {exc}")

    try:
        charts["^TWII"] = await fetch_chart("^TWII")
        twii = await benchmark_snapshot("^TWII", "TAIEX", "台股加權指數")
    except Exception as exc:
        twii = None
        errors.append(f"^TWII: {exc}")

    relations: list[dict[str, Any]] = []
    if twii and "^TWII" in charts:
        for bm in benchmarks:
            corr = rolling_correlation(charts[bm["symbol"]], charts["^TWII"], 60)
            relations.append({
                "symbol": bm["symbol"],
                "name": bm["name"],
                "role": bm["role"],
                "correlation60d": round(corr, 3) if corr is not None else None,
                "label": correlation_label(corr),
                "weekChangePct": bm["technical"].get("weekChangePct"),
                "monthChangePct": bm["technical"].get("monthChangePct"),
            })

    by_symbol = {row["symbol"]: row for row in benchmarks}
    spx = by_symbol.get("^GSPC", {}).get("technical", {})
    nasdaq = by_symbol.get("^IXIC", {}).get("technical", {})
    sox = by_symbol.get("^SOX", {}).get("technical", {})
    vix = by_symbol.get("^VIX", {}).get("technical", {})

    score = 50.0
    score += clamp((spx.get("weekChangePct") or 0) * 2.2, -14, 14)
    score += clamp((nasdaq.get("weekChangePct") or 0) * 2.0, -14, 14)
    score += clamp((sox.get("weekChangePct") or 0) * 2.4, -18, 18)
    score += clamp((spx.get("monthChangePct") or 0) * 0.7, -10, 10)
    score += clamp((sox.get("monthChangePct") or 0) * 0.8, -12, 12)
    score -= clamp((vix.get("weekChangePct") or 0) * 0.9, -12, 18)
    score = round(clamp(score, 0, 100), 1)

    if score >= 70:
        label = "美股順風"
        summary = "美股與半導體動能偏強，台股電子權值股較容易得到外部支撐。"
    elif score >= 55:
        label = "中性偏多"
        summary = "美股趨勢仍可支撐台股，但需要留意漲多後的震盪。"
    elif score >= 40:
        label = "中性震盪"
        summary = "美股訊號分歧，台股較可能回到個股與族群輪動。"
    else:
        label = "美股逆風"
        summary = "美股風險偏弱或 VIX 升溫，台股短線承壓機率提高。"

    result = {
        "label": label,
        "score": score,
        "summary": summary,
        "benchmarks": benchmarks,
        "taiwan": twii,
        "relations": sorted(
            relations,
            key=lambda row: abs(row["correlation60d"] or 0),
            reverse=True,
        ),
        "method": "以 S&P 500、NASDAQ、Dow、SOX、VIX 的 1 日/5 日/20 日變化與均線位置評估美股風向，並用最近 60 個共同交易日的日報酬計算與台股加權指數的 Pearson 相關係數。",
        "errors": errors[:6],
    }
    return cache_set(cache_key, result)


def today_taiwan_bias(us_taiwan_link: dict[str, Any]) -> dict[str, Any]:
    benchmarks = {row["symbol"]: row for row in us_taiwan_link.get("benchmarks", [])}
    spx = benchmarks.get("^GSPC", {}).get("technical", {})
    nasdaq = benchmarks.get("^IXIC", {}).get("technical", {})
    sox = benchmarks.get("^SOX", {}).get("technical", {})
    vix = benchmarks.get("^VIX", {}).get("technical", {})

    score = 50.0
    score += clamp((spx.get("dayChangePct") or 0) * 8.0, -18, 18)
    score += clamp((nasdaq.get("dayChangePct") or 0) * 7.0, -18, 18)
    score += clamp((sox.get("dayChangePct") or 0) * 8.5, -22, 22)
    score -= clamp((vix.get("dayChangePct") or 0) * 1.25, -16, 22)
    score += clamp((us_taiwan_link.get("score") or 50) - 50, -14, 14) * 0.45
    score = round(clamp(score, 0, 100), 1)

    if score >= 72:
        direction = "偏多開局"
        stance = "可優先觀察電子權值、AI、半導體供應鏈是否延續買盤。"
    elif score >= 58:
        direction = "中性偏多"
        stance = "可以找強勢股回檔不破線的機會，但追高要保守。"
    elif score >= 42:
        direction = "震盪整理"
        stance = "指數方向不夠明確，適合縮小部位並等盤中量價確認。"
    else:
        direction = "偏弱防守"
        stance = "先看支撐與風險控管，避免急著追高高波動股票。"

    latest_us_date = max(
        (row.get("updatedFrom") or "" for row in us_taiwan_link.get("benchmarks", [])),
        default=None,
    )
    return {
        "score": score,
        "direction": direction,
        "stance": stance,
        "latestUsDate": latest_us_date,
        "drivers": [
            {"name": "S&P 500", "symbol": "^GSPC", "dayChangePct": spx.get("dayChangePct")},
            {"name": "NASDAQ", "symbol": "^IXIC", "dayChangePct": nasdaq.get("dayChangePct")},
            {"name": "SOX 半導體", "symbol": "^SOX", "dayChangePct": sox.get("dayChangePct")},
            {"name": "VIX", "symbol": "^VIX", "dayChangePct": vix.get("dayChangePct")},
        ],
    }


def summarize_today_taiwan_playbook(
    analyzed: list[dict[str, Any]], us_taiwan_link: dict[str, Any]
) -> dict[str, Any]:
    from app.scoring import candidate_stock_score, capital_focus_score, overheat_score

    bias = today_taiwan_bias(us_taiwan_link)
    candidates: list[dict[str, Any]] = []

    for item in analyzed:
        score, notes = candidate_stock_score(item, bias)
        overheat, overheat_notes = overheat_score(item)
        if score < 58:
            continue
        candidates.append({
            "symbol": item["symbol"],
            "name": item["name"],
            "sector": item["sector"],
            "currency": item["currency"],
            "price": item["price"],
            "candidateScore": score,
            "focusScore": capital_focus_score(item),
            "overheatScore": overheat,
            "overheatLabel": overheat_notes[0],
            "notes": notes,
            "technical": {
                "score": item["technical"].get("score"),
                "dayChangePct": item["technical"].get("dayChangePct"),
                "weekChangePct": item["technical"].get("weekChangePct"),
                "monthChangePct": item["technical"].get("monthChangePct"),
                "volumeRatio": item["technical"].get("volumeRatio"),
                "rsi14": item["technical"].get("rsi14"),
                "ma20DistancePct": item["technical"].get("ma20DistancePct"),
            },
        })

    candidates.sort(
        key=lambda row: (row["candidateScore"], -row["overheatScore"]), reverse=True
    )
    return {
        "bias": bias,
        "candidates": candidates[:8],
        "disclaimer": "這是依前一個美股交易日與台股量價資料產生的觀察清單，不是買賣建議；是否進場、部位大小與停損停利仍由你自己決定。",
        "method": "前夜美股推演以 S&P 500、NASDAQ、SOX 與 VIX 的最近一日變化為主，再加入美股整體風向分數；候選股則用技術分數、資金關注、量能、題材連動與過熱風險排序。",
    }
