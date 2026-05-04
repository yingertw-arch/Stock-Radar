from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from app.cache import cache_get, cache_set
from app.concepts import AI_CONCEPTS, MATERIAL_CONCEPTS
from app.fetchers import fetch_chart, fetch_quotes, fetch_tw_fundamentals
from app.indicators import (
    average,
    clamp,
    ema,
    macd,
    moving_average,
    percent_change,
    rsi,
    safe_float,
    volume_ratio,
)
from app.universe import MARKETS, Market, load_universe, market_for_symbol, normalize_symbol


# ---------------------------------------------------------------------------
# Core stock-level scoring (verbatim from original server.py)
# ---------------------------------------------------------------------------

def score_stock(
    close: float,
    quote: dict[str, Any],
    closes: list[float],
    volumes: list[float],
) -> dict[str, Any]:
    day = percent_change(closes, 1)
    week = percent_change(closes, 5)
    month = percent_change(closes, 20)
    ma20 = moving_average(closes, 20)
    ma60 = moving_average(closes, 60)
    rsi14 = rsi(closes, 14)
    vol_ratio = volume_ratio(volumes)
    high_52w = safe_float(quote.get("fiftyTwoWeekHigh")) or max(closes[-252:] or closes)
    low_52w = safe_float(quote.get("fiftyTwoWeekLow")) or min(closes[-252:] or closes)
    range_position = (
        ((close - low_52w) / (high_52w - low_52w) * 100) if high_52w != low_52w else 50
    )
    macd_data = macd(closes)
    ma20_distance = ((close / ma20 - 1) * 100) if ma20 else None
    avg_volume_5d = average(volumes, 5)
    avg_volume_20d = average(volumes, 20)
    turnover_value_5d = close * avg_volume_5d if avg_volume_5d is not None else None

    strength = 0.0
    strength += clamp((day or 0) * 4, -12, 18)
    strength += clamp((week or 0) * 2.4, -16, 24)
    strength += clamp((month or 0) * 1.2, -18, 28)
    strength += 14 if ma20 and close > ma20 else -8
    strength += 10 if ma60 and close > ma60 else -6
    strength += clamp((range_position - 50) * 0.22, -8, 12)
    strength += clamp(((vol_ratio or 1) - 1) * 8, -5, 14)
    if rsi14 is not None:
        if 50 <= rsi14 <= 75:
            strength += 10
        elif rsi14 > 85:
            strength -= 10
        elif rsi14 < 40:
            strength -= 8
    if macd_data["histogram"] is not None and macd_data["histogram"] > 0:
        strength += 7

    return {
        "score": round(clamp(50 + strength, 0, 100), 1),
        "dayChangePct": day,
        "weekChangePct": week,
        "monthChangePct": month,
        "ma20": ma20,
        "ma60": ma60,
        "ma20DistancePct": ma20_distance,
        "rsi14": rsi14,
        "volumeRatio": vol_ratio,
        "avgVolume5d": avg_volume_5d,
        "avgVolume20d": avg_volume_20d,
        "turnoverValue5d": turnover_value_5d,
        "rangePosition": range_position,
        "macd": macd_data,
    }


def capital_focus_score(item: dict[str, Any]) -> float:
    tech = item["technical"]
    volume_ratio_value = tech.get("volumeRatio") or 1
    week = tech.get("weekChangePct") or 0
    month = tech.get("monthChangePct") or 0
    turnover = tech.get("turnoverValue5d") or 0
    market_cap = item.get("marketCap") or 0
    turnover_pressure = (turnover / market_cap * 100) if market_cap else 0

    score = 0.0
    score += clamp((volume_ratio_value - 1) * 22, -8, 32)
    score += clamp(week * 2.8, -12, 26)
    score += clamp(month * 0.9, -12, 22)
    score += clamp(turnover_pressure * 8, 0, 18)
    score += 8 if tech.get("macd", {}).get("histogram") and tech["macd"]["histogram"] > 0 else 0
    return round(clamp(50 + score, 0, 100), 1)


def overheat_score(item: dict[str, Any]) -> tuple[float, list[str]]:
    tech = item["technical"]
    reasons: list[str] = []
    score = 0.0
    rsi_value = tech.get("rsi14")
    week = tech.get("weekChangePct")
    month = tech.get("monthChangePct")
    volume_ratio_value = tech.get("volumeRatio")
    ma20_distance = tech.get("ma20DistancePct")
    range_position = tech.get("rangePosition")

    if rsi_value is not None:
        if rsi_value >= 85:
            score += 34
            reasons.append("RSI 高於 85，短線追價風險很高")
        elif rsi_value >= 78:
            score += 24
            reasons.append("RSI 高於 78，動能偏熱")
    if week is not None:
        if week >= 12:
            score += 28
            reasons.append("5 日漲幅超過 12%，漲速偏快")
        elif week >= 7:
            score += 18
            reasons.append("5 日漲幅超過 7%，短線已有急漲")
    if month is not None and month >= 22:
        score += 14
        reasons.append("20 日漲幅偏大，容易出現獲利了結")
    if volume_ratio_value is not None and volume_ratio_value >= 2.0:
        score += 18
        reasons.append("成交量放大到 20 日均量 2 倍以上")
    elif volume_ratio_value is not None and volume_ratio_value >= 1.5:
        score += 10
        reasons.append("成交量明顯放大")
    if ma20_distance is not None:
        if ma20_distance >= 12:
            score += 22
            reasons.append("股價高於 20 日均線超過 12%，乖離偏大")
        elif ma20_distance >= 8:
            score += 14
            reasons.append("股價高於 20 日均線超過 8%")
    if range_position is not None and range_position >= 92:
        score += 10
        reasons.append("接近 52 週高檔區")

    label = "正常"
    if score >= 70:
        label = "高度過熱"
    elif score >= 45:
        label = "偏熱"
    elif score >= 25:
        label = "留意轉折"
    reasons = reasons[:3] or ["目前沒有明顯短線過熱訊號"]
    return round(clamp(score, 0, 100), 1), [label, *reasons]


def ai_concept_score(item: dict[str, Any]) -> float:
    tech = item["technical"]
    base = item["technical"].get("score") or 50
    focus = capital_focus_score(item)
    overheat, _ = overheat_score(item)
    week = tech.get("weekChangePct") or 0
    month = tech.get("monthChangePct") or 0
    volume_ratio_value = tech.get("volumeRatio") or 1

    score = base * 0.42 + focus * 0.34
    score += clamp(week * 1.4, -10, 16)
    score += clamp(month * 0.45, -8, 12)
    score += clamp((volume_ratio_value - 1) * 10, -5, 12)
    if overheat >= 70:
        score -= 12
    elif overheat >= 45:
        score -= 6
    return round(clamp(score, 0, 100), 1)


def material_concept_score(item: dict[str, Any]) -> float:
    tech = item["technical"]
    base = item["technical"].get("score") or 50
    focus = capital_focus_score(item)
    overheat, _ = overheat_score(item)
    week = tech.get("weekChangePct") or 0
    month = tech.get("monthChangePct") or 0
    volume_ratio_value = tech.get("volumeRatio") or 1
    ma20_distance = tech.get("ma20DistancePct") or 0

    score = base * 0.34 + focus * 0.42
    score += clamp(week * 1.2, -10, 14)
    score += clamp(month * 0.55, -8, 14)
    score += clamp((volume_ratio_value - 1) * 14, -6, 18)
    score += clamp(ma20_distance * 0.35, -5, 8)
    if overheat >= 75:
        score -= 10
    elif overheat >= 50:
        score -= 5
    return round(clamp(score, 0, 100), 1)


def candidate_stock_score(
    item: dict[str, Any], bias: dict[str, Any]
) -> tuple[float, list[str]]:
    tech = item["technical"]
    focus = capital_focus_score(item)
    overheat, overheat_notes = overheat_score(item)
    score = (tech.get("score") or 50) * 0.42 + focus * 0.34
    score += clamp((tech.get("weekChangePct") or 0) * 1.4, -10, 16)
    score += clamp((tech.get("volumeRatio") or 1) * 5, 0, 12)
    score += clamp((bias.get("score") or 50) - 50, -12, 14) * 0.35

    notes: list[str] = []
    if item["symbol"] in AI_CONCEPTS:
        score += 5
        notes.append("AI/半導體題材與美股科技股連動度較高")
    if item["symbol"] in MATERIAL_CONCEPTS:
        score += 3
        notes.append("屬於伺服器、PCB、材料等供應鏈觀察名單")
    if tech.get("ma20") and item["price"] > tech["ma20"]:
        notes.append("股價站上 20 日線，短線趨勢仍有支撐")
    if tech.get("volumeRatio") and tech["volumeRatio"] >= 1.2:
        notes.append("量能高於近期平均，資金關注度較高")
    if overheat >= 70:
        score -= 18
        notes.append("過熱分數偏高，若開高追價風險較大")
    elif overheat >= 45:
        score -= 7
        notes.append("已有短線升溫，適合等拉回或盤中確認")
    else:
        notes.append(overheat_notes[0])

    return round(clamp(score, 0, 100), 1), notes[:4]


# ---------------------------------------------------------------------------
# Explain / beginner guide (verbatim)
# ---------------------------------------------------------------------------

def explain(item: dict[str, Any]) -> list[str]:
    notes: list[str] = []
    tech = item["technical"]
    fundamentals = item["fundamentals"]
    if tech["ma20"] and item["price"] > tech["ma20"]:
        notes.append("價格站上20日均線，短線買盤偏積極。")
    if tech["ma60"] and item["price"] > tech["ma60"]:
        notes.append("價格也在60日均線之上，中期趨勢仍偏多。")
    if tech["rsi14"] is not None:
        if tech["rsi14"] > 80:
            notes.append("RSI偏熱，代表人氣強，但追價風險也變高。")
        elif tech["rsi14"] >= 50:
            notes.append("RSI在多方區，動能尚可。")
        else:
            notes.append("RSI未站上多方區，動能需要再觀察。")
    if tech["volumeRatio"] and tech["volumeRatio"] > 1.4:
        notes.append("成交量明顯放大，代表市場注意力升高。")
    pe = fundamentals.get("pe")
    if pe:
        if pe < 18:
            notes.append("本益比相對不高，估值壓力較小。")
        elif pe > 45:
            notes.append("本益比較高，市場已給不少成長期待。")
    if fundamentals.get("eps") and fundamentals["eps"] > 0:
        notes.append("近四季EPS為正，至少目前不是虧損公司。")
    return notes[:4]


def beginner_analysis(item: dict[str, Any]) -> list[dict[str, str]]:
    tech = item["technical"]
    fundamentals = item["fundamentals"]
    price = item["price"]
    trend_good = bool(
        tech["ma20"] and tech["ma60"] and price > tech["ma20"] and price > tech["ma60"]
    )
    rsi_value = tech["rsi14"]
    volume_value = tech["volumeRatio"]
    pe = fundamentals.get("pe")

    if trend_good:
        trend_text = "股價同時站上20日與60日均線，代表短線和中期趨勢都偏強。"
        trend_result = "趨勢偏強"
    elif tech["ma20"] and price > tech["ma20"]:
        trend_text = "股價站上20日均線，但還沒有完全確認中期趨勢，適合先觀察。"
        trend_result = "短線轉強"
    else:
        trend_text = "股價尚未穩定站上主要均線，代表買盤還不夠明確。"
        trend_result = "趨勢保守"

    if rsi_value is None:
        momentum_text = "RSI資料不足，先用漲幅與成交量輔助判斷。"
        momentum_result = "動能待確認"
    elif rsi_value > 80:
        momentum_text = "RSI超過80，人氣很旺，但新手要避免在情緒最熱時一次追太多。"
        momentum_result = "動能很熱"
    elif rsi_value >= 50:
        momentum_text = "RSI在50以上，代表買方力道目前比賣方強。"
        momentum_result = "動能偏多"
    else:
        momentum_text = "RSI低於50，代表目前動能還沒有回到多方優勢。"
        momentum_result = "動能偏弱"
    if volume_value and volume_value > 1.4:
        momentum_text += " 另外，成交量放大，表示市場注意力正在升高。"

    if pe is None:
        value_text = "目前抓不到完整本益比，基本面要再搭配財報、營收與新聞確認。"
        value_result = "估值資料不足"
    elif pe > 45:
        value_text = "本益比偏高，市場對未來成長期待高；如果成長不如預期，股價容易震盪。"
        value_result = "估值偏貴"
    elif pe < 18:
        value_text = "本益比相對不高，估值壓力較小，但仍要確認產業是否正在衰退。"
        value_result = "估值較低"
    else:
        value_text = "本益比在中間區間，可以再比較同產業公司是否合理。"
        value_result = "估值中性"

    if item["technical"]["score"] >= 75 and (rsi_value is None or rsi_value <= 82):
        conclusion = "這檔可以列入積極觀察名單；新手適合等回測均線或量縮整理時再評估。"
        conclusion_result = "可積極觀察"
    elif item["technical"]["score"] >= 60:
        conclusion = "這檔有部分優勢，但還不是無腦追高的狀態；建議設定觀察價與停損點。"
        conclusion_result = "觀察中"
    else:
        conclusion = "目前強勢條件不完整，新手可以先看懂原因，不急著進場。"
        conclusion_result = "先不要急"

    return [
        {"title": "第一步：看趨勢", "result": trend_result, "detail": trend_text},
        {"title": "第二步：看動能", "result": momentum_result, "detail": momentum_text},
        {"title": "第三步：看估值", "result": value_result, "detail": value_text},
        {"title": "第四步：做結論", "result": conclusion_result, "detail": conclusion},
    ]


# ---------------------------------------------------------------------------
# Async build functions
# ---------------------------------------------------------------------------

def _profile_for_symbol(
    symbol: str, market: Market, quote: dict[str, Any]
) -> dict[str, str]:
    for candidate_market in MARKETS.values():
        for row in load_universe(candidate_market):
            if row["symbol"] == symbol:
                return row
    return {
        "symbol": symbol,
        "name": quote.get("shortName") or quote.get("longName") or symbol,
        "sector": quote.get("sector") or "自訂觀察",
    }


async def build_stock_item(
    symbol: str,
    market: Market,
    profile: dict[str, str] | None = None,
    chart: dict[str, list] | None = None,
    quote: dict[str, Any] | None = None,
    tw_fundamentals: dict | None = None,
) -> dict[str, Any]:
    if chart is None:
        chart = await fetch_chart(symbol)
    closes = chart["closes"]
    volumes = chart["volumes"]
    if len(closes) < 60:
        raise ValueError("這檔股票的歷史資料不足，暫時無法分析。")

    if quote is None:
        quotes = await fetch_quotes([symbol])
        quote = quotes.get(symbol, {})

    if profile is None:
        profile = _profile_for_symbol(symbol, market, quote)

    if tw_fundamentals is None:
        tw_fundamentals = await fetch_tw_fundamentals() if symbol.endswith(".TW") else {}

    fallback = tw_fundamentals.get(symbol, {})
    price = safe_float(quote.get("regularMarketPrice")) or closes[-1]
    technical = score_stock(price, quote, closes, volumes)

    item: dict[str, Any] = {
        "symbol": symbol,
        "name": profile["name"],
        "sector": profile.get("sector", "自訂觀察"),
        "currency": quote.get("currency") or market.currency,
        "price": price,
        "marketCap": safe_float(quote.get("marketCap")),
        "fundamentals": {
            "pe": safe_float(quote.get("trailingPE")) or fallback.get("pe"),
            "forwardPe": safe_float(quote.get("forwardPE")),
            "pb": safe_float(quote.get("priceToBook")) or fallback.get("pb"),
            "eps": safe_float(quote.get("epsTrailingTwelveMonths")),
            "dividendYield": safe_float(quote.get("dividendYield"))
            or (
                fallback.get("dividendYield") / 100
                if fallback.get("dividendYield") is not None
                else None
            ),
        },
        "technical": technical,
        "sparkline": closes[-60:],
        "updatedFrom": chart["dates"][-1] if chart["dates"] else None,
    }
    item["reasons"] = explain(item)
    item["beginnerGuide"] = beginner_analysis(item)
    return item


async def analyze_one_stock(
    raw_symbol: str, preferred_market_id: str = "tw"
) -> dict[str, Any]:
    symbol = normalize_symbol(raw_symbol, preferred_market_id)
    market = market_for_symbol(symbol, preferred_market_id)
    item = await build_stock_item(symbol, market)
    return {
        "market": {"id": market.id, "name": market.name},
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "stock": item,
        "method": {
            "summary": "單股分析會先看趨勢，再看動能，最後用基本面資料提醒估值風險。",
            "warning": "這是學習與研究工具，不是買賣建議。",
        },
    }


async def analyze_market(market_id: str) -> dict[str, Any]:
    from app.correlation import summarize_us_taiwan_link, summarize_today_taiwan_playbook
    from app.summarizers import (
        summarize_ai_concepts,
        summarize_market_pressure,
        summarize_material_concepts,
    )

    market = MARKETS.get(market_id, MARKETS["tw"])
    cache_key = f"analysis:{market.id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    universe = load_universe(market)
    symbol_to_profile = {row["symbol"]: row for row in universe}
    symbols = list(symbol_to_profile)

    # Parallel fetch of all charts + quotes + fundamentals
    chart_tasks = [fetch_chart(sym) for sym in symbols]
    quotes_task = fetch_quotes(symbols)
    fund_task = fetch_tw_fundamentals() if market.id == "tw" else asyncio.sleep(0)

    chart_results, quotes, tw_fundamentals = await asyncio.gather(
        asyncio.gather(*chart_tasks, return_exceptions=True),
        quotes_task,
        fund_task,
    )
    if not isinstance(tw_fundamentals, dict):
        tw_fundamentals = {}

    analyzed: list[dict[str, Any]] = []
    errors: list[str] = []

    for symbol, chart in zip(symbols, chart_results):
        if isinstance(chart, Exception):
            errors.append(f"{symbol}: {chart}")
            continue
        try:
            closes = chart["closes"]
            volumes = chart["volumes"]
            if len(closes) < 60:
                continue
            quote = quotes.get(symbol, {})
            price = safe_float(quote.get("regularMarketPrice")) or closes[-1]
            technical = score_stock(price, quote, closes, volumes)
            profile = symbol_to_profile[symbol]
            item: dict[str, Any] = {
                "symbol": symbol,
                "name": profile["name"],
                "sector": profile.get("sector", "未分類"),
                "currency": quote.get("currency") or market.currency,
                "price": price,
                "marketCap": safe_float(quote.get("marketCap")),
                "fundamentals": {
                    "pe": safe_float(quote.get("trailingPE")) or tw_fundamentals.get(symbol, {}).get("pe"),
                    "forwardPe": safe_float(quote.get("forwardPE")),
                    "pb": safe_float(quote.get("priceToBook")) or tw_fundamentals.get(symbol, {}).get("pb"),
                    "eps": safe_float(quote.get("epsTrailingTwelveMonths")),
                    "dividendYield": safe_float(quote.get("dividendYield"))
                    or (
                        tw_fundamentals.get(symbol, {}).get("dividendYield") / 100
                        if tw_fundamentals.get(symbol, {}).get("dividendYield") is not None
                        else None
                    ),
                },
                "technical": technical,
                "sparkline": closes[-60:],
                "updatedFrom": chart["dates"][-1] if chart["dates"] else None,
            }
            item["reasons"] = explain(item)
            analyzed.append(item)
        except Exception as exc:
            errors.append(f"{symbol}: {exc}")

    analyzed.sort(key=lambda row: row["technical"]["score"], reverse=True)
    us_taiwan_link = await summarize_us_taiwan_link()
    market_pressure = summarize_market_pressure(analyzed)
    ai_concepts = summarize_ai_concepts(analyzed)
    material_concepts = summarize_material_concepts(analyzed)
    today_playbook = summarize_today_taiwan_playbook(analyzed, us_taiwan_link) if market.id == "tw" else None

    result = {
        "market": {"id": market.id, "name": market.name},
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "top": analyzed[:10],
        "marketPressure": market_pressure,
        "aiConcepts": ai_concepts,
        "materialConcepts": material_concepts,
        "usTaiwanLink": us_taiwan_link,
        "todayTaiwanPlaybook": today_playbook,
        "count": len(analyzed),
        "errors": errors[:8],
        "method": {
            "summary": "強勢分數綜合日、週、月漲幅，20/60日均線，52週區間位置，成交量放大，RSI與MACD。",
            "warning": "這是學習與研究工具，不是買賣建議。排名高代表近期強，不代表一定會繼續漲。",
        },
    }
    return cache_set(cache_key, result)
