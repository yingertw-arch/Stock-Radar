import { useEffect, useState } from 'react'
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

const TAB_IDS = new Set(TABS.map(t => t.id))
const TAB_STORAGE_KEY = 'stock-radar-active-tab'

function readInitialTab() {
  if (typeof window === 'undefined') return 'market'
  const hashTab = window.location.hash.replace('#', '')
  if (TAB_IDS.has(hashTab)) return hashTab
  const savedTab = window.localStorage.getItem(TAB_STORAGE_KEY)
  return TAB_IDS.has(savedTab) ? savedTab : 'market'
}

export default function App() {
  const [tab, setTab]           = useState(readInitialTab)
  const [selected, setSelected] = useState(null)   // { symbol, name, sector }

  function openStock(stock) { setSelected(stock) }
  function closeStock()     { setSelected(null)  }
  function switchTab(nextTab) {
    setTab(nextTab)
    closeStock()
    window.localStorage.setItem(TAB_STORAGE_KEY, nextTab)
    if (window.location.hash !== `#${nextTab}`) {
      window.history.replaceState(null, '', `#${nextTab}`)
    }
  }

  useEffect(() => {
    if (window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`)
    }

    function handleHashChange() {
      const nextTab = window.location.hash.replace('#', '')
      if (TAB_IDS.has(nextTab)) {
        setTab(nextTab)
        setSelected(null)
        window.localStorage.setItem(TAB_STORAGE_KEY, nextTab)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [tab])

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
              onClick={() => switchTab(t.id)}
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
