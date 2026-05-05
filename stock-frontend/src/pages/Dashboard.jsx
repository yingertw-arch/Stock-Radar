import { useEffect, useState } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../api'

function pct(v) {
  if (v == null) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}

function color(v) {
  if (v == null) return 'neutral'
  return v >= 0 ? 'up' : 'dn'
}

export default function Dashboard() {
  const [taiex, setTaiex] = useState(null)
  const [sectors, setSectors] = useState(null)
  const [movers, setMovers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    Promise.all([api.taiex(), api.sectors(), api.movers('tw')])
      .then(([t, s, m]) => { setTaiex(t); setSectors(s.sectors); setMovers(m) })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="spinner" />
  if (err) return <div className="page"><div className="err">載入失敗：{err}</div></div>

  const sparkData = (taiex?.sparkline || []).map((v, i) => ({ v }))

  return (
    <div className="page gap-16">

      {/* TAIEX */}
      <div className="card">
        <div className="card-title">台股加權指數</div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div>
            <div className="big-num">{taiex?.price?.toLocaleString() ?? '—'}</div>
            <div className={`sub-num ${color(taiex?.dayChangePct)}`}>
              {pct(taiex?.dayChangePct)}
              {taiex?.dayChangeAbs != null && ` (${taiex.dayChangeAbs >= 0 ? '+' : ''}${taiex.dayChangeAbs.toFixed(0)})`}
            </div>
          </div>
          <div style={{ flex: 1, height: 60 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={taiex?.dayChangePct >= 0 ? 'var(--green)' : 'var(--red)'}
                  dot={false}
                  strokeWidth={1.5}
                />
                <Tooltip
                  content={({ payload }) =>
                    payload?.[0] ? <div className="card" style={{ padding: '4px 8px', fontSize: 12 }}>{payload[0].value?.toLocaleString()}</div> : null
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sectors */}
      <div className="card">
        <div className="card-title">產業 ETF</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {sectors?.map(s => (
            <div key={s.symbol} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{s.name}</span>
                <span className={`badge ${s.dayChangePct >= 0 ? 'badge-green' : 'badge-red'}`}>{pct(s.dayChangePct)}</span>
              </div>
              <div style={{ color: 'var(--text2)', fontSize: 11 }}>{s.sector}</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{s.price?.toFixed(2) ?? '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Movers */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">🟢 今日強勢</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>代號</th>
                <th>名稱</th>
                <th style={{ textAlign: 'right' }}>漲跌%</th>
              </tr>
            </thead>
            <tbody>
              {movers?.gainers?.slice(0, 8).map(r => (
                <tr key={r.symbol}>
                  <td><span style={{ fontWeight: 700 }}>{r.symbol.replace('.TW', '')}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{r.name}</td>
                  <td style={{ textAlign: 'right' }}><span className="up">{pct(r.dayChangePct)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">🔴 今日弱勢</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>代號</th>
                <th>名稱</th>
                <th style={{ textAlign: 'right' }}>漲跌%</th>
              </tr>
            </thead>
            <tbody>
              {movers?.losers?.slice(0, 8).map(r => (
                <tr key={r.symbol}>
                  <td><span style={{ fontWeight: 700 }}>{r.symbol.replace('.TW', '')}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{r.name}</td>
                  <td style={{ textAlign: 'right' }}><span className="dn">{pct(r.dayChangePct)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
