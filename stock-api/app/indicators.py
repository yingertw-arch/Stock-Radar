from __future__ import annotations

import math
import statistics
from typing import Any


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        result = float(value)
        if math.isnan(result) or math.isinf(result):
            return None
        return result
    except (TypeError, ValueError):
        return None


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[index: index + size] for index in range(0, len(items), size)]


def moving_average(values: list[float], days: int) -> float | None:
    if len(values) < days:
        return None
    return sum(values[-days:]) / days


def percent_change(values: list[float], days: int) -> float | None:
    if len(values) <= days or values[-days - 1] == 0:
        return None
    return (values[-1] / values[-days - 1] - 1) * 100


def rsi(values: list[float], days: int = 14) -> float | None:
    if len(values) <= days:
        return None
    gains: list[float] = []
    losses: list[float] = []
    recent = values[-days - 1:]
    for previous, current in zip(recent, recent[1:]):
        change = current - previous
        gains.append(max(change, 0))
        losses.append(abs(min(change, 0)))
    average_gain = sum(gains) / days
    average_loss = sum(losses) / days
    if average_loss == 0:
        return 100.0
    relative_strength = average_gain / average_loss
    return 100 - (100 / (1 + relative_strength))


def ema(values: list[float], days: int) -> float | None:
    if len(values) < days:
        return None
    multiplier = 2 / (days + 1)
    result = sum(values[:days]) / days
    for value in values[days:]:
        result = (value - result) * multiplier + result
    return result


def macd(values: list[float]) -> dict[str, float | None]:
    if len(values) < 35:
        return {"line": None, "signal": None, "histogram": None}
    macd_values: list[float] = []
    for index in range(26, len(values) + 1):
        short = ema(values[:index], 12)
        long_ = ema(values[:index], 26)
        if short is not None and long_ is not None:
            macd_values.append(short - long_)
    signal = ema(macd_values, 9)
    line = macd_values[-1] if macd_values else None
    histogram = line - signal if line is not None and signal is not None else None
    return {"line": line, "signal": signal, "histogram": histogram}


def macd_series(closes: list[float]) -> dict[str, list[float | None]]:
    """Full MACD series for charting (all bars aligned to closes)."""
    macd_line_vals: list[float] = []
    for i in range(26, len(closes) + 1):
        short = ema(closes[:i], 12)
        long_ = ema(closes[:i], 26)
        if short is not None and long_ is not None:
            macd_line_vals.append(short - long_)

    lines: list[float | None] = []
    signals: list[float | None] = []
    histograms: list[float | None] = []

    for i in range(len(macd_line_vals)):
        line_val = macd_line_vals[i]
        if i < 8:
            lines.append(None)
            signals.append(None)
            histograms.append(None)
        else:
            sig = ema(macd_line_vals[: i + 1], 9)
            lines.append(round(line_val, 4))
            signals.append(round(sig, 4) if sig is not None else None)
            hist = (line_val - sig) if sig is not None else None
            histograms.append(round(hist, 4) if hist is not None else None)

    return {"lines": lines, "signals": signals, "histograms": histograms}


def volume_ratio(volumes: list[float]) -> float | None:
    if len(volumes) < 21:
        return None
    baseline = statistics.mean(volumes[-21:-1])
    if baseline == 0:
        return None
    return volumes[-1] / baseline


def average(values: list[float], days: int) -> float | None:
    if len(values) < days:
        return None
    return statistics.mean(values[-days:])


def pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 20 or len(xs) != len(ys):
        return None
    mean_x = statistics.mean(xs)
    mean_y = statistics.mean(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denominator_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denominator_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if denominator_x == 0 or denominator_y == 0:
        return None
    return numerator / (denominator_x * denominator_y)


def rolling_correlation(
    first: dict[str, list[float]],
    second: dict[str, list[float]],
    days: int = 60,
) -> float | None:
    first_returns = daily_returns_by_date(first)
    second_returns = daily_returns_by_date(second)
    common_dates = sorted(set(first_returns) & set(second_returns))[-days:]
    if len(common_dates) < 20:
        return None
    return pearson(
        [first_returns[date] for date in common_dates],
        [second_returns[date] for date in common_dates],
    )


def correlation_label(value: float | None) -> str:
    if value is None:
        return "資料不足"
    if value >= 0.7:
        return "高度連動"
    if value >= 0.45:
        return "明顯連動"
    if value >= 0.2:
        return "低度連動"
    if value <= -0.2:
        return "反向連動"
    return "關聯偏弱"


def daily_returns_by_date(chart: dict[str, list]) -> dict[str, float]:
    dates = chart.get("dates", [])
    closes = chart.get("closes", [])
    output: dict[str, float] = {}
    for index in range(1, min(len(dates), len(closes))):
        previous = closes[index - 1]
        current = closes[index]
        if previous:
            output[dates[index]] = (current / previous - 1) * 100
    return output


def stochastic_kd(
    highs: list[float | None],
    lows: list[float | None],
    closes: list[float | None],
    k_period: int = 9,
    d_period: int = 3,
    smooth_k: int = 3,
) -> dict[str, list[float | None]]:
    """Taiwan-style KD (9,3,3) with RSV → K → D smoothing, seeded at 50."""
    n = len(closes)
    rsv_list: list[float | None] = []

    for i in range(n):
        if i < k_period - 1:
            rsv_list.append(None)
            continue
        window_h = [h for h in highs[i - k_period + 1: i + 1] if h is not None]
        window_l = [lo for lo in lows[i - k_period + 1: i + 1] if lo is not None]
        c = closes[i]
        if not window_h or not window_l or c is None:
            rsv_list.append(None)
            continue
        hh = max(window_h)
        ll = min(window_l)
        rsv_list.append(50.0 if hh == ll else (c - ll) / (hh - ll) * 100)

    k_vals: list[float | None] = []
    d_vals: list[float | None] = []
    prev_k = 50.0
    prev_d = 50.0
    w = 1.0 / smooth_k
    dw = 1.0 / d_period

    for rsv in rsv_list:
        if rsv is None:
            k_vals.append(None)
            d_vals.append(None)
        else:
            k = prev_k * (1 - w) + rsv * w
            d = prev_d * (1 - dw) + k * dw
            k_vals.append(round(k, 2))
            d_vals.append(round(d, 2))
            prev_k = k
            prev_d = d

    return {"k": k_vals, "d": d_vals}


def bollinger_bands(
    closes: list[float],
    period: int = 20,
    std_dev: float = 2.0,
) -> dict[str, list[float | None]]:
    """Bollinger Bands (20,2) — returns upper, middle, lower aligned with closes."""
    upper: list[float | None] = []
    middle: list[float | None] = []
    lower: list[float | None] = []

    for i in range(len(closes)):
        if i < period - 1:
            upper.append(None)
            middle.append(None)
            lower.append(None)
        else:
            window = closes[i - period + 1: i + 1]
            ma = sum(window) / period
            sd = statistics.stdev(window)
            upper.append(round(ma + std_dev * sd, 4))
            middle.append(round(ma, 4))
            lower.append(round(ma - std_dev * sd, 4))

    return {"upper": upper, "middle": middle, "lower": lower}


def key_price_levels(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    lookback: int = 60,
) -> dict[str, list[float]]:
    """Auto-calculate support/pullback/resistance zones from recent swing highs/lows."""
    h = highs[-lookback:]
    lo = lows[-lookback:]

    recent_high = max(h)
    recent_low = min(lo)
    price_range = recent_high - recent_low
    if price_range == 0:
        mid = recent_high
        return {
            "resistance": [mid, mid],
            "pullback": [mid, mid],
            "support": [mid, mid],
        }

    # Find pivot highs (local maxima) and lows
    pivot_highs = sorted(
        [h[i] for i in range(1, len(h) - 1) if h[i] >= h[i - 1] and h[i] >= h[i + 1]],
        reverse=True,
    )
    pivot_lows = sorted(
        [lo[i] for i in range(1, len(lo) - 1) if lo[i] <= lo[i - 1] and lo[i] <= lo[i + 1]],
    )

    top_highs = pivot_highs[:5] if pivot_highs else [recent_high]
    top_lows = pivot_lows[:5] if pivot_lows else [recent_low]

    resistance_center = sum(top_highs) / len(top_highs)
    support_center = sum(top_lows) / len(top_lows)
    pullback_center = (resistance_center + support_center) / 2

    band = price_range * 0.04

    def _round(v: float) -> float:
        step = 10 if v > 500 else (1 if v > 50 else 0.1)
        return round(round(v / step) * step, 2)

    return {
        "resistance": [_round(resistance_center - band), _round(resistance_center + band)],
        "pullback": [_round(pullback_center - band), _round(pullback_center + band)],
        "support": [_round(support_center - band), _round(support_center + band)],
    }


def detect_patterns(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    lookback: int = 60,
) -> dict[str, Any]:
    """Simple W底 / M頭 detection via pivot points in the lookback window."""
    h = highs[-lookback:]
    lo = lows[-lookback:]
    c = closes[-lookback:]
    n = len(c)

    pivot_lows_idx = [i for i in range(1, n - 1) if lo[i] <= lo[i - 1] and lo[i] <= lo[i + 1]]
    pivot_highs_idx = [i for i in range(1, n - 1) if h[i] >= h[i - 1] and h[i] >= h[i + 1]]

    # W底: two pivot lows close in price, second not lower than first, price now above neckline
    w_bottom = False
    w_detail = "右肩未完成，且頸線未突破"
    if len(pivot_lows_idx) >= 2:
        p1, p2 = pivot_lows_idx[-2], pivot_lows_idx[-1]
        v1, v2 = lo[p1], lo[p2]
        price_diff_pct = abs(v2 - v1) / v1 * 100 if v1 else 100
        if price_diff_pct < 8 and p2 - p1 >= 5:
            neckline = max(h[p1:p2 + 1])
            if c[-1] > neckline:
                w_bottom = True
                w_detail = "已形成W底並突破頸線"
            else:
                w_detail = "雙底形態中，尚未突破頸線"

    # M頭: two pivot highs close in price, price now below neckline
    m_top = False
    m_detail = "右峰未確認，且跌破頸線"
    if len(pivot_highs_idx) >= 2:
        p1, p2 = pivot_highs_idx[-2], pivot_highs_idx[-1]
        v1, v2 = h[p1], h[p2]
        price_diff_pct = abs(v2 - v1) / v1 * 100 if v1 else 100
        if price_diff_pct < 8 and p2 - p1 >= 5:
            neckline = min(lo[p1:p2 + 1])
            if c[-1] < neckline:
                m_top = True
                m_detail = "已形成M頭且跌破頸線"
            else:
                m_detail = "雙頂形態中，尚未跌破頸線"

    return {
        "wBottom": {"formed": w_bottom, "detail": w_detail},
        "mTop": {"formed": m_top, "detail": m_detail},
    }


def technical_signals(
    chart: dict[str, list],
    quote: dict[str, Any],
    closes: list[float],
    volumes: list[float],
) -> list[dict[str, str]]:
    """Generate 6 technical signal bullets matching the dashboard screenshot."""
    price = safe_float(quote.get("regularMarketPrice")) or (closes[-1] if closes else 0)
    ma5 = moving_average(closes, 5)
    ma20 = moving_average(closes, 20)
    ma60 = moving_average(closes, 60)
    rsi14 = rsi(closes, 14)
    vol_ratio = volume_ratio(volumes)
    bb = bollinger_bands(closes, 20, 2)
    bb_upper = bb["upper"][-1]
    bb_lower = bb["lower"][-1]
    bb_middle = bb["middle"][-1]
    week_chg = percent_change(closes, 5) or 0
    month_chg = percent_change(closes, 20) or 0

    signals: list[dict[str, str]] = []

    # 1. 趨勢方向
    if ma5 and ma20 and ma60 and ma5 > ma20 > ma60:
        signals.append({"label": "趨勢方向", "value": "多頭趨勢", "color": "red"})
    elif ma5 and ma20 and ma5 < ma20:
        signals.append({"label": "趨勢方向", "value": "空頭趨勢", "color": "green"})
    else:
        signals.append({"label": "趨勢方向", "value": "趨勢整理", "color": "yellow"})

    # 2. 價格位置
    if bb_upper and price >= bb_upper * 0.98:
        signals.append({"label": "價格位置", "value": "高檔整理（貼近上軌）", "color": "yellow"})
    elif bb_lower and price <= bb_lower * 1.02:
        signals.append({"label": "價格位置", "value": "低檔支撐（貼近下軌）", "color": "yellow"})
    elif bb_middle and price > bb_middle:
        signals.append({"label": "價格位置", "value": "中軌以上，偏強", "color": "red"})
    else:
        signals.append({"label": "價格位置", "value": "中軌以下，偏弱", "color": "green"})

    # 3. 均線排列
    if ma5 and ma20 and ma60:
        if ma5 > ma20 > ma60:
            signals.append({"label": "均線排列", "value": f"多頭排列（5>20>60）", "color": "red"})
        elif ma5 < ma20 < ma60:
            signals.append({"label": "均線排列", "value": f"空頭排列（5<20<60）", "color": "green"})
        else:
            signals.append({"label": "均線排列", "value": "均線糾結，方向待定", "color": "yellow"})
    else:
        signals.append({"label": "均線排列", "value": "資料不足", "color": "yellow"})

    # 4. 量價關係
    if vol_ratio is not None:
        if vol_ratio >= 1.5 and week_chg > 0:
            signals.append({"label": "量價關係", "value": "量增價漲，動能充足", "color": "red"})
        elif vol_ratio < 0.8 and week_chg > 0:
            signals.append({"label": "量價關係", "value": "量縮上漲，動能降溫", "color": "yellow"})
        elif vol_ratio >= 1.5 and week_chg < 0:
            signals.append({"label": "量價關係", "value": "量增價跌，賣壓沉重", "color": "green"})
        else:
            signals.append({"label": "量價關係", "value": "量價平穩，觀望為主", "color": "yellow"})
    else:
        signals.append({"label": "量價關係", "value": "量能資料不足", "color": "yellow"})

    # 5. 布林位置
    if bb_upper and bb_lower:
        band_width = bb_upper - bb_lower
        position = (price - bb_lower) / band_width * 100 if band_width else 50
        if position >= 90:
            signals.append({"label": "布林位置", "value": "貼近上軌（過熱）", "color": "yellow"})
        elif position <= 10:
            signals.append({"label": "布林位置", "value": "貼近下軌（超賣）", "color": "yellow"})
        elif position >= 60:
            signals.append({"label": "布林位置", "value": "中上段，偏強", "color": "red"})
        else:
            signals.append({"label": "布林位置", "value": "中下段，偏弱", "color": "green"})
    else:
        signals.append({"label": "布林位置", "value": "資料不足", "color": "yellow"})

    # 6. 布林通道開口
    if len(bb["upper"]) >= 10:
        recent_widths = [
            (bb["upper"][i] - bb["lower"][i])
            for i in range(-10, 0)
            if bb["upper"][i] is not None and bb["lower"][i] is not None
        ]
        if len(recent_widths) >= 2:
            expanding = recent_widths[-1] > recent_widths[0] * 1.05
            contracting = recent_widths[-1] < recent_widths[0] * 0.95
            if expanding:
                signals.append({"label": "布林通道", "value": "開口擴大（趨勢加速）", "color": "yellow"})
            elif contracting:
                signals.append({"label": "布林通道", "value": "開口收窄（蓄勢）", "color": "yellow"})
            else:
                signals.append({"label": "布林通道", "value": "通道穩定", "color": "yellow"})
        else:
            signals.append({"label": "布林通道", "value": "資料不足", "color": "yellow"})
    else:
        signals.append({"label": "布林通道", "value": "資料不足", "color": "yellow"})

    return signals


def main_force_signal(
    overheat_score_val: float,
    technical_score_val: float,
    vol_ratio: float | None,
    week_chg: float | None,
) -> dict[str, str]:
    """Derive 主力燈號 from existing scores."""
    v = vol_ratio or 1
    w = week_chg or 0

    if overheat_score_val >= 65 and w < 0:
        return {"label": "出貨初期", "description": "主力開始調節，需留意短線風險"}
    if overheat_score_val >= 65 and v >= 2:
        return {"label": "高度過熱", "description": "追高風險大，等待回落再評估"}
    if technical_score_val >= 75 and v >= 1.5 and w > 5:
        return {"label": "主升段", "description": "量價齊揚，主力積極拉抬"}
    if technical_score_val >= 65 and v >= 1.2:
        return {"label": "吸籌中", "description": "資金持續關注，可留意回檔布局"}
    if technical_score_val < 45:
        return {"label": "弱勢整理", "description": "主力缺席，不宜積極追多"}
    return {"label": "盤整觀察", "description": "方向未明，等待突破訊號"}


def ai_win_rate(
    technical_score_val: float,
    overheat_score_val: float,
    vol_ratio: float | None,
    rsi14: float | None,
) -> dict[str, int]:
    """Simple statistical model returning up/down/sideways probability."""
    v = vol_ratio or 1
    r = rsi14 or 50

    bullish = 0.0
    bullish += clamp(technical_score_val - 50, -25, 30)
    bullish += clamp((v - 1) * 8, -8, 12)
    bullish += clamp((r - 50) * 0.3, -12, 12)
    bullish -= clamp(overheat_score_val * 0.2, 0, 20)

    up = int(clamp(42 + bullish, 15, 75))
    down = int(clamp(38 - bullish * 0.6, 15, 70))
    sideways = max(5, 100 - up - down)

    total = up + down + sideways
    return {
        "up": round(up * 100 / total),
        "down": round(down * 100 / total),
        "sideways": 100 - round(up * 100 / total) - round(down * 100 / total),
    }


def trading_suggestion(
    key_levels: dict[str, list[float]],
    technical_score_val: float,
    overheat_score_val: float,
    rsi14: float | None,
) -> dict[str, str]:
    r = rsi14 or 50
    resistance = key_levels.get("resistance", [0, 0])
    pullback = key_levels.get("pullback", [0, 0])
    support = key_levels.get("support", [0, 0])

    if overheat_score_val >= 65:
        strategy = "不追高，等待回檔布局"
    elif technical_score_val >= 70:
        strategy = "趨勢偏強，回檔可積極布局"
    elif technical_score_val >= 55:
        strategy = "中性偏多，等量縮整理後再進場"
    else:
        strategy = "弱勢格局，建議觀望為主"

    return {
        "strategy": strategy,
        "buyZone": f"{pullback[0]:g} ～ {pullback[1]:g}",
        "breakoutTarget": f"突破 {resistance[1]:g} 且放量",
        "stopLoss": f"跌破 {support[1]:g} 轉弱 / 跌破 {support[0]:g} 出場",
    }


def technical_summary_table(
    closes: list[float],
    volumes: list[float],
    quote: dict[str, Any],
) -> list[dict[str, str]]:
    """Build the 技術指標總覽 table from the screenshot."""
    kd = stochastic_kd(closes, closes, closes)
    k_val = next((v for v in reversed(kd["k"]) if v is not None), None)
    d_val = next((v for v in reversed(kd["d"]) if v is not None), None)
    macd_data = macd(closes)
    ma5 = moving_average(closes, 5)
    ma20 = moving_average(closes, 20)
    ma60 = moving_average(closes, 60)
    vol = volume_ratio(volumes)
    vol_raw = safe_float(quote.get("regularMarketVolume"))

    def _dir(v: float | None, threshold: float = 0) -> str:
        if v is None:
            return "neutral"
        return "up" if v > threshold else "down"

    rows = []

    # KD
    if k_val is not None and d_val is not None:
        kd_dir = "up" if k_val > d_val else "down"
        kd_interp = "高檔鈍化" if k_val > 80 else ("低檔鈍化" if k_val < 20 else ("偏多" if k_val > 50 else "偏空"))
        rows.append({"indicator": "KD", "value": f"{k_val} / {d_val}", "direction": kd_dir, "interpretation": kd_interp})

    # MACD
    if macd_data["line"] is not None:
        macd_interp = "多頭延續" if (macd_data["histogram"] or 0) > 0 else "空頭延續"
        rows.append({"indicator": "MACD", "value": f"DIF {macd_data['line']:.2f}", "direction": _dir(macd_data["histogram"]), "interpretation": macd_interp})

    # 均線排列
    if ma5 and ma20 and ma60:
        if ma5 > ma20 > ma60:
            rows.append({"indicator": "均線排列", "value": "5 > 20 > 60", "direction": "up", "interpretation": "多頭排列"})
        elif ma5 < ma20 < ma60:
            rows.append({"indicator": "均線排列", "value": "5 < 20 < 60", "direction": "down", "interpretation": "空頭排列"})
        else:
            rows.append({"indicator": "均線排列", "value": "均線糾結", "direction": "neutral", "interpretation": "方向待定"})

    # 布林通道
    bb = bollinger_bands(closes, 20, 2)
    bb_widths = [
        (bb["upper"][i] - bb["lower"][i])
        for i in range(-10, 0)
        if bb["upper"][i] is not None and bb["lower"][i] is not None
    ]
    if len(bb_widths) >= 2:
        expanding = bb_widths[-1] > bb_widths[0] * 1.05
        rows.append({
            "indicator": "布林通道",
            "value": "開口擴大" if expanding else "開口收窄",
            "direction": "up" if expanding else "neutral",
            "interpretation": "趨勢加速" if expanding else "蓄勢整理",
        })

    # 成交量
    if vol is not None:
        vol_label = f"{int(vol_raw // 1000)}（略縮）" if vol_raw and vol < 0.9 else (
            f"{int(vol_raw // 1000)}（放大）" if vol_raw and vol >= 1.3 else f"{int(vol_raw // 1000) if vol_raw else '—'}"
        )
        rows.append({
            "indicator": "成交量",
            "value": vol_label,
            "direction": "up" if vol >= 1.2 else ("down" if vol < 0.85 else "neutral"),
            "interpretation": "量能擴張" if vol >= 1.3 else ("量能萎縮" if vol < 0.85 else "量能平穩"),
        })

    return rows
