const BASE = import.meta.env.VITE_API_BASE || '/api'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  markets:      ()             => get('/markets'),
  taiex:        ()             => get('/taiex'),
  sectors:      ()             => get('/sectors'),
  movers:       (market='tw') => get(`/movers?market=${market}`),
  analyze:      (market='tw') => get(`/analyze?market=${market}`),
  stock:        (sym, mkt)    => get(`/stock?symbol=${sym}&market=${mkt||'tw'}`),
  dashboard:    (sym)         => get(`/stock/${encodeURIComponent(sym)}/dashboard`),
  kline:        (sym, period) => get(`/stock/${encodeURIComponent(sym)}/kline?period=${period}`),
  kd:           (sym, period) => get(`/stock/${encodeURIComponent(sym)}/kd?period=${period}`),
  macd:         (sym, period) => get(`/stock/${encodeURIComponent(sym)}/macd?period=${period}`),
  institutional:(sym)         => get(`/stock/${encodeURIComponent(sym)}/institutional`),
  search:       (q)           => get(`/search?q=${encodeURIComponent(q)}`),
}

