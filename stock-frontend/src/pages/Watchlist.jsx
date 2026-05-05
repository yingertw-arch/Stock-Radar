import { useEffect, useState, useRef } from 'react'
import { api } from '../api'

// Simple localStorage watchlist (Firebase optional upgrade)
function loadList() {
  try { return JSON.parse(localStorage.getItem('watchlist') || '[]') } catch { return [] }
}
function saveList(list) {
  localStorage.setItem('watchlist', JSON.stringify(list))
}

function pct(v) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export default function Watchlist() {
  const [symbols, setSymbols] = useState(loadList)
  const [quotes, setQuotes] = useState({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  // Fetch quotes for all watchlist symbols
  useEffect(() => {
    if (symbols.length === 0) return
    setLoading(true)
    Promise.allSettled(
      symbols.map(sym => {
        const market = /^\d/.test(sym) ? 'tw' : 'us'
        return api.stock(sym, market).then(d => [sym, d])
      })
    ).then(results => {
      const map = {}
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          const [sym, d] = r.value
          map[sym] = d
        }
      })
      setQuotes(map)
    }).finally(() => setLoading(false))
  }, [symbols.join(',')])

  function add() {
    const sym = input.trim().toUpperCase()
    if (!sym || symbols.includes(sym)) return
    const next = [...symbols, sym]
    setSymbols(next)
    saveList(next)
    setInput('')
    inputRef.current?.focus()
  }

  function remove(sym) {
    const next = symbols.filter(s => s !== sym)
    setSymbols(next)
    saveList(next)
  }

  return (
    <div className="page gap-16">
      <div className="card">
        <div className="card-title">⭐ 自選股（儲存於此裝置）</div>

        {/* Add */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            ref={inputRef}
            className="input"
            placeholder="輸入代號，例如 2330 / AAPL / 2454"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={add}>加入</button>
        </div>

        {symbols.length === 0 && (
          <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 32 }}>
            尚未加入任何股票
          </div>
        )}

        {loading && symbols.length > 0 && <div className="spinner" />}

        {!loading && symbols.map(sym => {
          const d = quotes[sym]
          const tech = d?.technical || {}
          const dayChg = tech.dayChangePct
          const price = d?.price
          const name = d?.name || sym

          return (
            <div key={sym} className="wl-item">
              <span className="wl-sym">{sym.replace('.TW', '')}</span>
              <span className="wl-name">{name}</span>
              {price != null
                ? <>
                    <span className="wl-price">{price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className={`wl-chg ${dayChg >= 0 ? 'up' : 'dn'}`}>{pct(dayChg)}</span>
                  </>
                : <span className="wl-price neutral">—</span>
              }
              {tech.score != null && (
                <span className="badge badge-blue" style={{ minWidth: 42 }}>分 {tech.score}</span>
              )}
              <button className="btn-ghost" onClick={() => remove(sym)}>移除</button>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
        💡 自選股目前儲存於瀏覽器本機（localStorage），清除瀏覽器資料後會消失。
      </div>
    </div>
  )
}
