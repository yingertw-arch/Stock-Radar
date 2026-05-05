const BASE = import.meta.env.VITE_API_URL || ''

async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json()
}

export const api = {
  taiex: () => get('/api/taiex'),
  sectors: () => get('/api/sectors'),
  movers: (market = 'tw') => get(`/api/movers?market=${market}`),
  analyze: (market = 'tw') => get(`/api/analyze?market=${market}`),
  stock: (symbol, market = 'tw') => get(`/api/stock?symbol=${symbol}&market=${market}`),
  markets: () => get('/api/markets'),
}
