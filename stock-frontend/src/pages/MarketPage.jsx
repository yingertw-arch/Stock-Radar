import { useFetch } from '../hooks/useFetch'
import { api }      from '../api'
import { SparkLine } from '../components/SparkLine'
import { fmt, pctColor, pctSign } from '../utils'

export default function MarketPage({ onSelectStock }) {
  const taiex   = useFetch(() => api.taiex(),   [])
  const sectors  = useFetch(() => api.sectors(), [])
  const movers   = useFetch(() => api.movers('tw'), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── TAIEX Hero ── */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>台股加權指數 TAIEX</div>
          {taiex.loading ? <div className="spin"/> : taiex.error ? <span style={{color:'var(--red)'}}>{taiex.error}</span> : (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(taiex.data?.price, 2)}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }} className={pctColor(taiex.data?.dayChangePct)}>
                {pctSign(taiex.data?.dayChangePct)}{fmt(taiex.data?.dayChangeAbs, 2)}&nbsp;
                ({pctSign(taiex.data?.dayChangePct)}{fmt(taiex.data?.dayChangePct, 2)}%)
              </div>
            </>
          )}
        </div>
        {taiex.data?.sparkline && (
          <div style={{ flex: 1, maxWidth: 320, height: 60 }}>
            <SparkLine data={taiex.data.sparkline} />
          </div>
        )}
      </div>

      {/* ── Sector ETFs ── */}
      <SectionTitle>產業 ETF 觀察</SectionTitle>
      {sectors.loading ? <Spinner/> : sectors.error ? <Err msg={sectors.error}/> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }}>
          {(sectors.data?.sectors || []).map(s => (
            <div key={s.symbol} className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sector}</div>
              <div style={{ fontWeight: 600, margin: '2px 0' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.symbol}</div>
              <div style={{ marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontWeight: 600 }}>{s.price != null ? fmt(s.price, 2) : '—'}</span>
                {s.dayChangePct != null && (
                  <span style={{ marginLeft: 6, fontSize: 12 }} className={pctColor(s.dayChangePct)}>
                    {pctSign(s.dayChangePct)}{fmt(s.dayChangePct, 2)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Movers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <SectionTitle>🔺 漲幅排行</SectionTitle>
          <MoverTable rows={movers.data?.gainers} loading={movers.loading} error={movers.error} isGain onSelect={onSelectStock} />
        </div>
        <div>
          <SectionTitle>🔻 跌幅排行</SectionTitle>
          <MoverTable rows={movers.data?.losers}  loading={movers.loading} error={movers.error} isGain={false} onSelect={onSelectStock} />
        </div>
      </div>
    </div>
  )
}

function MoverTable({ rows, loading, error, isGain, onSelect }) {
  if (loading) return <Spinner/>
  if (error)   return <Err msg={error}/>
  if (!rows?.length) return <div className="loading">市場休市或資料載入中…</div>
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <th style={th}>名稱</th>
            <th style={{...th, textAlign:'right'}}>股價</th>
            <th style={{...th, textAlign:'right'}}>漲跌%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.symbol}
                onClick={() => onSelect(r)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={{ padding: '8px 12px' }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.symbol}</div>
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(r.price, 2)}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                  className={pctColor(r.dayChangePct)}>
                {pctSign(r.dayChangePct)}{fmt(r.dayChangePct, 2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)' }
function SectionTitle({ children }) {
  return <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--muted)', marginBottom: 8, letterSpacing: '.5px', textTransform: 'uppercase' }}>{children}</div>
}
function Spinner() { return <div className="loading"><div className="spin"/></div> }
function Err({ msg }) { return <div className="error-msg">⚠ {msg}</div> }
