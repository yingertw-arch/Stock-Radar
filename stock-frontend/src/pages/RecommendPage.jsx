import { useFetch } from '../hooks/useFetch'
import { api }      from '../api'
import { SparkLine } from '../components/SparkLine'
import { fmt, pctColor, pctSign } from '../utils'

export default function RecommendPage({ onSelectStock }) {
  const { data, loading, error } = useFetch(() => api.analyze('tw'), [])

  if (loading) return <div className="loading"><div className="spin"/> 正在分析台股全市場…</div>
  if (error)   return <div className="error-msg">⚠ {error}</div>

  const playbook = data?.todayTaiwanPlaybook
  const bias     = playbook?.bias
  const candidates = playbook?.candidates || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Market bias ── */}
      {bias && (
        <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>今日台股偏向</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{bias.direction}</div>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12 }}>{bias.stance}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>台股偏向分數</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: biasColor(bias.score) }}>{bias.score}</div>
          </div>
        </div>
      )}

      {/* ── Candidate stocks ── */}
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        🔥 推薦觀察股 ({candidates.length})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
        {candidates.map(c => (
          <StockCard key={c.symbol} stock={c} onSelect={onSelectStock} />
        ))}
      </div>

      {/* ── Top 10 strongest ── */}
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 8 }}>
        💪 強勢股 Top 10
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
        {(data?.top || []).map(c => (
          <StockCard key={c.symbol} stock={{...c, candidateScore: c.technical?.score}} onSelect={onSelectStock} showSparkline />
        ))}
      </div>
    </div>
  )
}

function StockCard({ stock: s, onSelect, showSparkline }) {
  const week = s.technical?.weekChangePct ?? s.weekChangePct
  const rsi  = s.technical?.rsi14
  const score = s.candidateScore ?? s.technical?.score

  return (
    <div className="card" style={{ cursor: 'pointer', transition: 'border-color .15s' }}
         onClick={() => onSelect({ symbol: s.symbol, name: s.name, sector: s.sector })}
         onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
         onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.symbol} · {s.sector}</div>
        </div>
        {score != null && (
          <ScoreCircle value={score} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
        <Stat label="股價"  value={fmt(s.price, 2)} />
        <Stat label="週漲跌" value={`${pctSign(week)}${fmt(week,2)}%`} cls={pctColor(week)} />
        {rsi != null && <Stat label="RSI" value={fmt(rsi,1)} />}
      </div>

      {s.notes && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {s.notes.slice(0,2).map((n,i) => (
            <span key={i} style={{ fontSize: 10, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 3, color: 'var(--muted)' }}>{n}</span>
          ))}
        </div>
      )}

      {showSparkline && s.sparkline?.length > 0 && (
        <div style={{ height: 40, marginTop: 8 }}>
          <SparkLine data={s.sparkline} />
        </div>
      )}
    </div>
  )
}

function ScoreCircle({ value }) {
  const color = value >= 70 ? 'var(--red)' : value >= 55 ? 'var(--yellow)' : 'var(--muted)'
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%',
      border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 13, color,
      flexShrink: 0,
    }}>{Math.round(value)}</div>
  )
}

function Stat({ label, value, cls }) {
  return (
    <div>
      <div style={{ color: 'var(--muted)', fontSize: 10 }}>{label}</div>
      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} className={cls}>{value ?? '—'}</div>
    </div>
  )
}

function biasColor(score) {
  if (score >= 65) return 'var(--red)'
  if (score >= 45) return 'var(--yellow)'
  return 'var(--green)'
}
