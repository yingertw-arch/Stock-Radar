import { useState } from 'react'
import './index.css'
import './App.css'
import MarketPage     from './pages/MarketPage'
import WatchlistPage  from './pages/WatchlistPage'
import RecommendPage  from './pages/RecommendPage'
import StockDashboard from './components/StockDashboard'

const TABS = [
  { id: 'market',    label: '📊 大盤' },
  { id: 'recommend', label: '🔥 推薦股' },
  { id: 'watchlist', label: '⭐ 自選股' },
]

export default function App() {
  const [tab, setTab]           = useState('market')
  const [selected, setSelected] = useState(null)   // { symbol, name, sector }

  function openStock(stock) { setSelected(stock) }
  function closeStock()     { setSelected(null)  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ── */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        height: 48,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--blue)', letterSpacing: '-.5px' }}>
          📈 台股雷達
        </span>
        <nav style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); closeStock() }}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontWeight: tab === t.id ? 700 : 400,
                background: tab === t.id ? 'var(--surface2)' : 'none',
                color: tab === t.id ? 'var(--text)' : 'var(--muted)',
                border: tab === t.id ? '1px solid var(--border)' : '1px solid transparent',
                transition: 'all .15s',
              }}
            >{t.label}</button>
          ))}
        </nav>
      </header>

      {/* ── Content ── */}
      <main style={{ flex: 1, padding: '16px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
        {selected ? (
          <StockDashboard symbol={selected.symbol} name={selected.name} onClose={closeStock} />
        ) : (
          <>
            {tab === 'market'    && <MarketPage    onSelectStock={openStock} />}
            {tab === 'recommend' && <RecommendPage onSelectStock={openStock} />}
            {tab === 'watchlist' && <WatchlistPage onSelectStock={openStock} />}
          </>
        )}
      </main>
    </div>
  )
}
