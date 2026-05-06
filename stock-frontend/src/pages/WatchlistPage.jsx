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
  const [noResults,   setNoResults]   = useState(false)
  const debounceRef   = useRef(null)
  const wrapperRef    = useRef(null)

  useEffect(() => {
    let unsub
    try { unsub = subscribeWatchlist(setList) } catch { setFbErr(true) }
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (!list.length) { setQuotes({}); return }
    const symbols = list.map(s => s.symbol)
    Promise.allSettled(symbols.map(sym => api.dashboard(sym))).then(results => {
      const map = {}
      results.forEach((r, i) => { if (r.status === 'fulfilled') map[symbols[i]] = r.value })
      setQuotes(map)
    })
  }, [list.map(s => s.symbol).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = input.trim()
    if (!q) { setSuggestions([]); setShowDrop(false); setNoResults(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.search(q)
        setSuggestions(res || [])
        setShowDrop((res || []).length > 0)
        setNoResults((res || []).length === 0)
      } catch { setSuggestions([]); setNoResults(false) }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [input])

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectSuggestion(s) {
    setInput(s.symbol); setSuggestions([]); setShowDrop(false); setNoResults(false)
  }

  async function handleAdd() {
    const sym = input.trim().replace(/\s/g, '')
    if (!sym) return
    if (noResults && /[\u4e00-\u9fff]/.test(sym)) {
      setErrMsg('找不到「' + sym + '」，請輸入股票代號（如：6698）')
      return
    }
    setAdding(true); setErrMsg('')
    try {
      const data = await api.dashboard(sym)
      await addToWatchlist({ symbol: data.symbol || sym, name: data.name || sym, sector: data.sector || '' })
      setInput(''); setSuggestions([]); setNoResults(false)
    } catch (e) {
      setErrMsg(e.message || '找不到此股票')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            placeholder="輸入股票代號或中文名稱，例如 2330 / 台穌電"
            style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 6, outline: 'none', fontSize: 14, color: 'var(--text)',
            }}
          />

          {showDrop && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.4)',
              overflow: 'hidden',
            }}>
              {suggestions.map(s => (
                <div key={s.symbol} onMouseDown={() => selectSuggestion(s)}
                  style={{
                    padding: '8px 14px', cursor: 'pointer', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--border)', transition: 'background .1s',
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

          {noResults && !showDrop && input.trim() && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, marginTop: 4, padding: '8px 14px',
              fontSize: 12, color: 'var(--muted)',
            }}>
              找不到「{input.trim()}」，請嘗試輸入 4 位股票代號（如：6698）
            </div>
          )}
        </div>

        <button onClick={() => { setShowDrop(false); handleAdd() }} disabled={adding}
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
          ⚠ Firebase 尚未設定，自選股不會跨裝置同步。
        </div>
      )}

      {list.length === 0 ? (
        <div className="loading" style={{ height: 200 }}>⭐ 還沒有自選股，在上方輸入代號加入吧！</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
          {list.map(item => {
            const q = quotes[item.symbol]
            return (
              <WatchCard key={item.symbol} item={item} quote={q}
                onSelect={() => onSelectStock(item)}
                onRemove={() => removeFromWatchlist(item.symbol)} />
            )
          })}
        </div>
      )}
    </div>
  )
}

function WatchCard({ item, quote, onSelect, onRemove }) {
  const pct = quote?.dayChangePct
  const rsi = quote?.rsi14
  const winRate = quote?.aiWinRate?.up

  return (
    <div className="card" style={{ cursor: 'pointer', position: 'relative', transition: 'border-color .15s' }}
         onClick={onSelect}
         onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
         onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>

      <button onClick={e => { e.stopPropagation(); onRemove() }} title="移除自選股"
        style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: 4, cursor: 'pointer', zIndex: 1 }}>
        ✕
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, paddingRight: 24 }}>{item.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {item.symbol}{item.sector ? ' · ' + item.sector : ''}
          </div>
        </div>
        {winRate != null && (
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0, marginRight: 28,
            border: `2px solid ${winRate >= 65 ? 'var(--red)' : winRate >= 50 ? 'var(--yellow)' : 'var(--muted)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 12,
            color: winRate >= 65 ? 'var(--red)' : winRate >= 50 ? 'var(--yellow)' : 'var(--muted)',
          }}>
            {winRate}%
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
        <Stat label="股價" value={quote ? fmt(quote.price, 2) : null} />
        <Stat label="漲跌%" value={pct != null ? `${pctSign(pct)}${fmt(pct, 2)}%` : null} cls={pctColor(pct)} />
        {rsi != null && <Stat label="RSI" value={fmt(rsi, 1)} />}
        {!quote && <div style={{ color: 'var(--muted)', fontSize: 11 }}>載入中…</div>}
      </div>

      {quote?.technicalSignals?.[0] && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
          {quote.technicalSignals[0].label}：{quote.technicalSignals[0].value}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, cls }) {
  return (
    <div>
      <div style={{ color: 'var(--muted)', fontSize: 10 }}>{label}</div>
      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} className={cls}>
        {value ?? '—'}
      </div>
    </div>
  )
}
