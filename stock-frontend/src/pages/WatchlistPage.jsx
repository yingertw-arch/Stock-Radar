import { useState, useEffect } from 'react'
import { subscribeWatchlist, addToWatchlist, removeFromWatchlist } from '../firebase'
import { api } from '../api'
import { fmt, pctColor, pctSign } from '../utils'

export default function WatchlistPage({ onSelectStock }) {
  const [list,    setList]    = useState([])
  const [quotes,  setQuotes]  = useState({})
  const [input,   setInput]   = useState('')
  const [adding,  setAdding]  = useState(false)
  const [errMsg,  setErrMsg]  = useState('')
  const [fbErr,   setFbErr]   = useState(false)

  // Firebase realtime subscription
  useEffect(() => {
    let unsub
    try {
      unsub = subscribeWatchlist(setList)
    } catch {
      setFbErr(true)
    }
    return () => unsub?.()
  }, [])

  // Fetch live quotes for watchlist symbols
  useEffect(() => {
    if (!list.length) { setQuotes({}); return }
    const symbols = list.map(s => s.symbol)
    api.analyze('tw').catch(() => null)   // warm cache
    Promise.allSettled(symbols.map(sym => api.dashboard(sym))).then(results => {
      const map = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          map[symbols[i]] = r.value
        }
      })
      setQuotes(map)
    })
  }, [list.map(s => s.symbol).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    const sym = input.trim().toUpperCase().replace(/\s/g, '')
    if (!sym) return
    setAdding(true); setErrMsg('')
    try {
      const data = await api.dashboard(sym)
      await addToWatchlist({ symbol: data.symbol || sym, name: data.name || sym, sector: '' })
      setInput('')
    } catch (e) {
      setErrMsg(e.message || '找不到此股票')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Add stock ── */}
      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="輸入股票代號，例如 2330 或 AAPL"
          style={{
            flex: 1, padding: '8px 12px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 6, outline: 'none', fontSize: 14,
          }}
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          style={{
            padding: '8px 18px', borderRadius: 6,
            background: 'var(--blue)', color: '#000',
            fontWeight: 700, opacity: adding ? .6 : 1,
          }}>
          {adding ? '查詢中…' : '＋ 加入自選'}
        </button>
        {errMsg && <span style={{ color: 'var(--red)', fontSize: 12 }}>⚠ {errMsg}</span>}
      </div>

      {fbErr && (
        <div className="card" style={{ color: 'var(--yellow)', fontSize: 13 }}>
          ⚠ Firebase 尚未設定，自選股不會跨裝置同步。請在 <code>.env</code> 填入 Firebase 設定。
        </div>
      )}

      {/* ── Watchlist table ── */}
      {list.length === 0 ? (
        <div className="loading" style={{ height: 200 }}>
          ⭐ 還沒有自選股，在上方輸入代號加入吧！
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
          {list.map(item => {
            const q = quotes[item.symbol]
            return (
              <WatchCard
                key={item.symbol}
                item={item}
                quote={q}
                onSelect={() => onSelectStock(item)}
                onRemove={() => removeFromWatchlist(item.symbol)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function WatchCard({ item, quote, onSelect, onRemove }) {
  const pct = quote?.dayChangePct
  return (
    <div className="card" style={{ cursor: 'pointer', position: 'relative', transition: 'border-color .15s' }}
         onClick={onSelect}
         onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
         onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      {/* Remove button */}
      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        title="移除自選股"
        style={{
          position: 'absolute', top: 8, right: 8,
          color: 'var(--muted)', fontSize: 16, lineHeight: 1,
          padding: 2,
        }}>✕</button>

      <div style={{ fontWeight: 700, fontSize: 15, paddingRight: 20 }}>{item.name}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{item.symbol}</div>

      <div style={{ marginTop: 12, display: 'flex', gap: 20, alignItems: 'flex-end' }}>
        {quote ? (
          <>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>股價</div>
              <div style={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(quote.price, 2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>漲跌%</div>
              <div style={{ fontWeight: 700, fontSize: 16 }} className={pctColor(pct)}>
                {pct != null ? `${pctSign(pct)}${fmt(pct,2)}%` : '—'}
              </div>
            </div>
            {quote.aiWinRate && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>上漲機率</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--blue)' }}>{quote.aiWinRate.up}%</div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>載入中…</div>
        )}
      </div>

      {quote?.technicalSignals?.[0] && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          {quote.technicalSignals[0].label}：{quote.technicalSignals[0].value}
        </div>
      )}
    </div>
  )
}
