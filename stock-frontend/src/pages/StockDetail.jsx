import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid
} from 'recharts'
import { api } from '../api'

function pct(v) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function num(v, d = 2) { return v != null ? v.toFixed(d) : '—' }

function ScoreBar({ value }) {
  const color = value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--accent)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <div className="score-bar" style={{ flex: 1, height: 6 }}>
        <div className="score-fill" style={{ width: `${value}%`, background: color, height: '100%' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

export default function StockDetail() {
  const [sym, setSym] = useState('')
  const [market, setMarket] = useState('tw')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  function search(s, m) {
    const symbol = (s ?? sym).trim()
    const mkt = m ?? market
    if (!symbol) return
    setLoading(true)
    setErr(null)
    setData(null)
    api.stock(symbol, mkt)
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }

  const tech = data?.technical || {}
  const fund = data?.fundamentals || {}
  const steps = data?.beginnerAnalysis || []
  const explain = data?.explain || []
  const candles = data?.chart?.closes || []
  const dates = data?.chart?.dates || []
  const chartData = candles.map((c, i) => ({ date: dates[i]?.slice(5) || i, price: c }))

  return (
    <div className="page gap-16">
      {/* Search */}
      <div className="card">
        <div className="card-title">個股查詢</div>
        <div className="mkt-sel">
          {[['tw', '🇹🇼 台股'], ['us', '🇺🇸 美股']].map(([id, label]) => (
            <button key={id} className={`mkt-btn${market === id ? ' active' : ''}`}
              onClick={() => { setMarket(id); if (data) search(sym, id) }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder={market === 'tw' ? '輸入代號，例如 2330、2454' : '輸入代號，例如 AAPL、NVDA'}
            value={sym}
            onChange={e => setSym(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={() => search()}>查詢</button>
        </div>
      </div>

      {loading && <div className="spinner" />}
      {err && <div className="err">查詢失敗：{err}</div>}

      {data && !loading && <>
        {/* Header */}
        <div className="card">
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{data.symbol?.replace('.TW', '')}
                <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 14, marginLeft: 8 }}>{data.name}</span>
              </div>
              <div className="big-num" style={{ marginTop: 8 }}>
                {data.price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}
              </div>
              <div style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span className={tech.dayChangePct >= 0 ? 'up' : 'dn'}>今日 {pct(tech.dayChangePct)}</span>
                <span className={tech.weekChangePct >= 0 ? 'up' : 'dn'}>週 {pct(tech.weekChangePct)}</span>
                <span className={tech.monthChangePct >= 0 ? 'up' : 'dn'}>月 {pct(tech.monthChangePct)}</span>
              </div>
            </div>
            <div style={{ minWidth: 160 }}>
              <div className="card-title">技術分</div>
              <ScoreBar value={tech.score ?? 0} />
            </div>
          </div>
        </div>

        {/* Price Chart */}
        {chartData.length > 0 && (
          <div className="card">
            <div className="card-title">收盤價走勢（近一年）</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text2)' }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--text2)' }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip
                    content={({ payload, label }) =>
                      payload?.[0]
                        ? <div className="card" style={{ padding: '4px 8px', fontSize: 12 }}>{label}：{payload[0].value?.toLocaleString()}</div>
                        : null
                    }
                  />
                  {tech.ma20 && <ReferenceLine y={tech.ma20} stroke="var(--accent)" strokeDasharray="4 2" strokeOpacity={0.6} label={{ value: 'MA20', fontSize: 10, fill: 'var(--accent)' }} />}
                  {tech.ma60 && <ReferenceLine y={tech.ma60} stroke="var(--yellow)" strokeDasharray="4 2" strokeOpacity={0.6} label={{ value: 'MA60', fontSize: 10, fill: 'var(--yellow)' }} />}
                  <Line type="monotone" dataKey="price" stroke="var(--text)" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Technical Grid */}
        <div className="grid-2">
          <div className="card">
            <div className="card-title">技術指標</div>
            <table className="tbl">
              <tbody>
                {[
                  ['RSI (14)', num(tech.rsi14, 1)],
                  ['MA20', num(tech.ma20)],
                  ['MA60', num(tech.ma60)],
                  ['20日乖離', tech.ma20DistancePct != null ? pct(tech.ma20DistancePct) : '—'],
                  ['量比', num(tech.volumeRatio, 2)],
                  ['52週位置', tech.rangePosition != null ? `${num(tech.rangePosition, 0)}%` : '—'],
                  ['MACD 柱', num(tech.macd?.histogram, 4)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: 'var(--text2)' }}>{k}</td>
                    <td style={{ fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">基本面</div>
            <table className="tbl">
              <tbody>
                {[
                  ['市值', fund.marketCap ? `${(fund.marketCap / 1e8).toFixed(0)} 億` : '—'],
                  ['本益比 (PE)', num(fund.pe, 1)],
                  ['預估 PE', num(fund.forwardPe, 1)],
                  ['EPS', num(fund.eps)],
                  ['殖利率', fund.dividendYield != null ? pct(fund.dividendYield * 100) : '—'],
                  ['PBR', num(fund.pb, 2)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: 'var(--text2)' }}>{k}</td>
                    <td style={{ fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Beginner 4-step */}
        {steps.length > 0 && (
          <div className="card">
            <div className="card-title">新手四步驟分析</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {steps.map(s => (
                <div key={s.title} className="step-card">
                  <div className="step-label">{s.title}</div>
                  <div className="step-result"
                    style={{ color: s.result.includes('強') || s.result.includes('多') || s.result.includes('積極') ? 'var(--green)' : s.result.includes('弱') || s.result.includes('追') || s.result.includes('不要') ? 'var(--red)' : 'var(--accent)' }}>
                    {s.result}
                  </div>
                  <div className="step-detail">{s.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explain notes */}
        {explain.length > 0 && (
          <div className="card">
            <div className="card-title">分析摘要</div>
            <ul className="notes" style={{ gap: 8 }}>
              {explain.map((n, i) => <li key={i} style={{ fontSize: 13 }}>{n}</li>)}
            </ul>
          </div>
        )}
      </>}
    </div>
  )
}
