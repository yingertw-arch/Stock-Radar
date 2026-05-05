import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Recommend from './pages/Recommend'
import Watchlist from './pages/Watchlist'
import StockDetail from './pages/StockDetail'

const TABS = [
  { id: 'dashboard', label: '📊 大盤' },
  { id: 'recommend', label: '🔥 推薦股' },
  { id: 'watchlist', label: '⭐ 自選股' },
  { id: 'stock',     label: '📈 個股' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <>
      <nav className="nav">
        <span className="nav-title">台股雷達 📡</span>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1 }}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'recommend' && <Recommend />}
        {tab === 'watchlist' && <Watchlist />}
        {tab === 'stock'     && <StockDetail />}
      </main>
    </>
  )
}
