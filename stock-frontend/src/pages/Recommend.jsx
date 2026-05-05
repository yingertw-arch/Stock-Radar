import { useEffect, useState } from 'react'
import { api } from '../api'

function pct(v) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function ScoreBar({ value }) {
  const color = value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--accent)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="score-bar" style={{ flex: 1 }}>
        <div className="score-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28 }}>{value}</span>
    </div>
  )
}

export default function Recommend() {
  const [market, setMarket] = useState('tw')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    setLoading(true)
    setErr(null)
    api.analyze(market)
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [market])

  const bias = data?.marketBias
  const candidates = data?.candidates || []

  return (
    <div className="page gap-16">
      <div className="mkt-sel">
        {[['tw', '🇹🇼 台股'], ['us', '🇺🇸 美股']].map(([id, label]) => (
          <button key={id} className={`mkt-btn${market === id ? ' active' : ''}`} onClick={() => setMarket(id)}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="spinner" />}
      {err && <div className="err">載入失敗：{err}</div>}

      {!loading && !err && <>
        {/* Market Bias */}
        {bias && (
          <div className="card">
            <div className="card-title">今日市場偏向</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div className="big-num" style={{ fontSize: 22 }}>{bias.label ?? '—'}</div>
                <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>{bias.reason ?? ''}</div>
              </div>
              {bias.score != null && (
                <div style={{ flex: 1, minWidth: 200 }}>
                  <ScoreBar value={bias.score} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Candidates */}
        <div className="card">
          <div className="card-title">📋 今日候選股（觀察名單，非買賣建議）</div>
          {candidates.length === 0
            ? <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 24 }}>暫無候選股資料</div>
            : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>代號</th>
                    <th>名稱</th>
                    <th>綜合分</th>
                    <th>今日%</th>
                    <th>週%</th>
                    <th>月%</th>
                    <th>RSI</th>
                    <th>量比</th>
                    <th style={{ minWidth: 200 }}>觀察重點</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map(c => {
                    const tech = c.technical || {}
                    const notes = c.notes || []
                    const sym = (c.symbol || '').replace('.TW', '')
                    return (
                      <tr key={c.symbol}>
                        <td><span style={{ fontWeight: 700 }}>{sym}</span></td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>{c.name || '—'}</td>
                        <td>
                          <ScoreBar value={c.score ?? tech.score ?? 0} />
                        </td>
                        <td><span className={tech.dayChangePct >= 0 ? 'up' : 'dn'}>{pct(tech.dayChangePct)}</span></td>
                        <td><span className={tech.weekChangePct >= 0 ? 'up' : 'dn'}>{pct(tech.weekChangePct)}</span></td>
                        <td><span className={tech.monthChangePct >= 0 ? 'up' : 'dn'}>{pct(tech.monthChangePct)}</span></td>
                        <td style={{ color: 'var(--text2)' }}>{tech.rsi14?.toFixed(0) ?? '—'}</td>
                        <td style={{ color: 'var(--text2)' }}>{tech.volumeRatio?.toFixed(1) ?? '—'}</td>
                        <td>
                          <ul className="notes">
                            {notes.slice(0, 3).map((n, i) => <li key={i}>{n}</li>)}
                          </ul>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          }
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text2)' }}>
            ⚠️ 以上為技術面觀察名單，不構成投資建議，最後是否進場請自行判斷。
          </div>
        </div>
      </>}
    </div>
  )
}
