import { useState, useEffect, useRef } from 'react'
import { subscribeWatchlist, addToWatchlist, removeFromWatchlist } from '../firebase'
import { api } from '../api'
import { fmt, pctColor, pctSign } from '../utils'

export default function WatchlistPage({ onSelectStock }) {
  const [list,        setList]        = useState([])
  const [quotes,      setQuotes]      = useState({})
  const [input,       setInput]       = useState('')
  const [adding,      setAdding]      = useState(false)
  const [errMsg,      setErrMsg]      = useState('')
  const [fbErr,       setFbErr]       = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showDrop,    setShowDrop]    = useState(false)
  const debounceRef   = useRef(null)
  const wrapperRef    = useRef(null)

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
    Promise.allSettled(symbols.map(sym => api.dashboard(sym))).then(results => {
      const map = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') map[symbols[i]] = r.value
      })
      setQuotes(map)
    })
  }, [list.map(s => s.symbol).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autocomplete: debounce search as user types
  useEffect(() => {
    const q = input.trim()
    if (!q) { setSuggestions([]); setShowDrop(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.search(q)
        setSuggestions(res || [])
        setShowDrop((res || []).length > 0)
      } catch {
        setSuggestions([])
      }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [input])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectSuggestion(s) {
    setInput(s.symbol)
    setSuggestions([])
    setShowDrop(false)
  }

  async function handleAdd() {
    const sym = input.trim().replace(/\s/g, '')
    if (!sym) return
    setAdding(true); setErrMsg('')
    try {
      const data = await api.dashboard(sym)
      await addToWatchlist({ symbol: data.symbol || sym, name: data.name || sym, sector: '' })
      setInput('')
      setSuggestions([])
    } catch (e) {
      setErrMsg(e.message || '找不到此股票')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Add stock with autocomplete ── */}
      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }} ref={wrapperRef}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setErrMsg('') }}
            onKeyDown={e => {
              if (e.key === 'Enter') { setShowDrop(false); handleAdd() }
              if (e.key === 'Escape') setShowDrop(false)
            }}
            onFocus={() => suggestions.length > 0 && setShowDrop(true)}
            placeholder="輸入股票代號或中文名稱，例如 2330 / 台積電"
            style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 6, outline: 'none', fontSize: 14, color: 'var(--text)',
            }}
          />

          {/* Dropdown suggestions */}
          {showDrop && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.4)',
              overflow: 'hidden',
            }}>
              {suggestions.map(s => (
                <div
                  key={s.symbol}
                  onMouseDown={() => selectSuggestion(s)}
                  style={{
                    padding: '8px 14px', cursor: 'pointer', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{s.symbol}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>
                    {s.sector}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => { setShowDrop(false); handleAdd() }}
          disabled={adding}
          style={{
            padding: '8px 18px', borderRadius: 6, whiteSpace: 'nowrap',
            background: 'var(--blue)', color: '#000',
            fontWeight: 700, opacity: adding ? .6 : 1, flexShrink: 0,
          }}>
          {adding ? '查詢中…' : '＋ 加入自選'}
        </button>

        {errMsg && <span style={{ color: 'var(--red)', fontSize: 12, whiteSpace: 'nowrap' }}>⚠ {errMsg}</span>}
      </div>

      {fbErr && (
        <div className="card" style={{ color: 'var(--yellow)', fontSize: 13 }}>
          ⚠ Firebase 尚未設定，自選股不會跨裝置同步。請在 <code>.env</code> 填入 Firebase 設定。
        </div>
      )}

      {/* ── Watchlist cards ── */}
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
      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        title="移除自選股"
        style={{ position: 'absolute', top: 8, right: 8, color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: 2 }}>
        ✕
      </button>

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
