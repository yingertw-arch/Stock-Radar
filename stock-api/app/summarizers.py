from __future__ import annotations

from typing import Any

from app.concepts import AI_CONCEPTS, MATERIAL_CONCEPTS
from app.indicators import clamp
from app.scoring import (
    ai_concept_score,
    capital_focus_score,
    material_concept_score,
    overheat_score,
)


def summarize_market_pressure(analyzed: list[dict[str, Any]]) -> dict[str, Any]:
    enriched: list[dict[str, Any]] = []
    sector_map: dict[str, dict[str, Any]] = {}
    total_turnover = 0.0

    for item in analyzed:
        focus = capital_focus_score(item)
        overheat, overheat_notes = overheat_score(item)
        turnover = item["technical"].get("turnoverValue5d") or 0
        total_turnover += turnover
        enriched_item = {
            "symbol": item["symbol"],
            "name": item["name"],
            "sector": item["sector"],
            "currency": item["currency"],
            "price": item["price"],
            "marketCap": item.get("marketCap"),
            "focusScore": focus,
            "overheatScore": overheat,
            "overheatLabel": overheat_notes[0],
            "notes": overheat_notes[1:],
            "technical": {
                "weekChangePct": item["technical"].get("weekChangePct"),
                "monthChangePct": item["technical"].get("monthChangePct"),
                "volumeRatio": item["technical"].get("volumeRatio"),
                "rsi14": item["technical"].get("rsi14"),
                "ma20DistancePct": item["technical"].get("ma20DistancePct"),
                "turnoverValue5d": turnover,
            },
        }
        enriched.append(enriched_item)

        sector = item["sector"] or "未分類"
        bucket = sector_map.setdefault(
            sector,
            {"sector": sector, "turnoverValue5d": 0.0, "focusScoreTotal": 0.0, "count": 0, "leaders": []},
        )
        bucket["turnoverValue5d"] += turnover
        bucket["focusScoreTotal"] += focus
        bucket["count"] += 1
        bucket["leaders"].append(enriched_item)

    focused_stocks = sorted(enriched, key=lambda row: row["focusScore"], reverse=True)[:8]
    overheated_stocks = sorted(enriched, key=lambda row: row["overheatScore"], reverse=True)[:8]

    sectors: list[dict[str, Any]] = []
    for bucket in sector_map.values():
        leaders = sorted(bucket["leaders"], key=lambda row: row["focusScore"], reverse=True)[:3]
        share = (bucket["turnoverValue5d"] / total_turnover * 100) if total_turnover else None
        sectors.append({
            "sector": bucket["sector"],
            "count": bucket["count"],
            "turnoverSharePct": share,
            "avgFocusScore": round(bucket["focusScoreTotal"] / bucket["count"], 1) if bucket["count"] else None,
            "turnoverValue5d": bucket["turnoverValue5d"],
            "leaders": leaders,
        })

    sectors.sort(
        key=lambda row: ((row["turnoverSharePct"] or 0), (row["avgFocusScore"] or 0)),
        reverse=True,
    )
    return {
        "totalTurnoverValue5d": total_turnover,
        "sectors": sectors[:6],
        "focusedStocks": focused_stocks,
        "overheatedStocks": overheated_stocks,
        "method": "以近 5 日平均成交金額、量比、5/20 日漲幅、MACD 與市值周轉估算資金集中；以 RSI、乖離率、週漲幅、爆量與 52 週位置評估短線過熱。",
    }


def summarize_ai_concepts(analyzed: list[dict[str, Any]]) -> dict[str, Any]:
    concept_items: list[dict[str, Any]] = []
    theme_map: dict[str, dict[str, Any]] = {}

    for item in analyzed:
        concept = AI_CONCEPTS.get(item["symbol"])
        if not concept:
            continue

        focus = capital_focus_score(item)
        overheat, overheat_notes = overheat_score(item)
        ai_score = ai_concept_score(item)
        row = {
            "symbol": item["symbol"],
            "name": item["name"],
            "theme": concept["theme"],
            "role": concept["role"],
            "currency": item["currency"],
            "price": item["price"],
            "aiScore": ai_score,
            "focusScore": focus,
            "overheatScore": overheat,
            "overheatLabel": overheat_notes[0],
            "notes": overheat_notes[1:],
            "technical": {
                "score": item["technical"].get("score"),
                "weekChangePct": item["technical"].get("weekChangePct"),
                "monthChangePct": item["technical"].get("monthChangePct"),
                "volumeRatio": item["technical"].get("volumeRatio"),
                "rsi14": item["technical"].get("rsi14"),
                "ma20DistancePct": item["technical"].get("ma20DistancePct"),
                "turnoverValue5d": item["technical"].get("turnoverValue5d"),
            },
        }
        concept_items.append(row)

        theme = concept["theme"]
        bucket = theme_map.setdefault(
            theme,
            {"theme": theme, "scoreTotal": 0.0, "focusTotal": 0.0, "count": 0, "leaders": []},
        )
        bucket["scoreTotal"] += ai_score
        bucket["focusTotal"] += focus
        bucket["count"] += 1
        bucket["leaders"].append(row)

    theme_rows: list[dict[str, Any]] = []
    for bucket in theme_map.values():
        leaders = sorted(bucket["leaders"], key=lambda row: row["aiScore"], reverse=True)[:3]
        theme_rows.append({
            "theme": bucket["theme"],
            "count": bucket["count"],
            "avgAiScore": round(bucket["scoreTotal"] / bucket["count"], 1),
            "avgFocusScore": round(bucket["focusTotal"] / bucket["count"], 1),
            "leaders": leaders,
        })

    theme_rows.sort(key=lambda row: (row["avgAiScore"], row["avgFocusScore"]), reverse=True)
    concept_items.sort(key=lambda row: row["aiScore"], reverse=True)

    return {
        "themes": theme_rows,
        "leaders": concept_items[:10],
        "overheated": sorted(concept_items, key=lambda row: row["overheatScore"], reverse=True)[:8],
        "method": "AI 概念分數綜合原本強弱分數、資金集中分數、週/月動能與量比；若 RSI、乖離或急漲過熱，會扣分並列入風險提示。",
        "coverage": "台股以半導體、AI server、散熱與電源鏈為主；美股以 GPU/ASIC、雲端平台、AI 軟體與終端裝置為主。",
    }


def summarize_material_concepts(analyzed: list[dict[str, Any]]) -> dict[str, Any]:
    concept_items: list[dict[str, Any]] = []
    theme_map: dict[str, dict[str, Any]] = {}

    for item in analyzed:
        concept = MATERIAL_CONCEPTS.get(item["symbol"])
        if not concept:
            continue

        focus = capital_focus_score(item)
        overheat, overheat_notes = overheat_score(item)
        mat_score = material_concept_score(item)
        row = {
            "symbol": item["symbol"],
            "name": item["name"],
            "theme": concept["theme"],
            "role": concept["role"],
            "currency": item["currency"],
            "price": item["price"],
            "materialScore": mat_score,
            "focusScore": focus,
            "overheatScore": overheat,
            "overheatLabel": overheat_notes[0],
            "notes": overheat_notes[1:],
            "technical": {
                "score": item["technical"].get("score"),
                "weekChangePct": item["technical"].get("weekChangePct"),
                "monthChangePct": item["technical"].get("monthChangePct"),
                "volumeRatio": item["technical"].get("volumeRatio"),
                "rsi14": item["technical"].get("rsi14"),
                "ma20DistancePct": item["technical"].get("ma20DistancePct"),
                "turnoverValue5d": item["technical"].get("turnoverValue5d"),
            },
        }
        concept_items.append(row)

        theme = concept["theme"]
        bucket = theme_map.setdefault(
            theme,
            {"theme": theme, "scoreTotal": 0.0, "focusTotal": 0.0, "count": 0, "leaders": []},
        )
        bucket["scoreTotal"] += mat_score
        bucket["focusTotal"] += focus
        bucket["count"] += 1
        bucket["leaders"].append(row)

    theme_rows: list[dict[str, Any]] = []
    for bucket in theme_map.values():
        leaders = sorted(bucket["leaders"], key=lambda row: row["materialScore"], reverse=True)[:3]
        theme_rows.append({
            "theme": bucket["theme"],
            "count": bucket["count"],
            "avgMaterialScore": round(bucket["scoreTotal"] / bucket["count"], 1),
            "avgFocusScore": round(bucket["focusTotal"] / bucket["count"], 1),
            "leaders": leaders,
        })

    theme_rows.sort(key=lambda row: (row["avgMaterialScore"], row["avgFocusScore"]), reverse=True)
    concept_items.sort(key=lambda row: row["materialScore"], reverse=True)

    return {
        "themes": theme_rows,
        "leaders": concept_items[:10],
        "overheated": sorted(concept_items, key=lambda row: row["overheatScore"], reverse=True)[:8],
        "method": "材料供應鏈分數偏重資金集中、量比、5/20 日動能與 20 日乖離；若短線過熱會扣分並另外列入風險名單。",
        "coverage": "涵蓋高速 CCL、玻纖布、銅箔、PCB、ABF/IC 載板、散熱材料、矽晶圓與半導體耗材；AI server 整機股作為下游拉貨參考。",
    }
