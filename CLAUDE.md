# 台股雷達 Stock-Radar — Claude 工作手冊

> 請在任何修改之前，完整讀完這份文件。這是本專案的唯一設計權威來源。

---

## 專案目標

打造一個台股分析系統，讓使用者點選「推薦股」或「自選股」中的任意一支股票，就能彈出完整的**個股儀表板**（含 K 線、KD、MACD、三大法人、主力進出、AI勝率等，參考世芯-KY 3661 的截圖樣式）。

---

## 部署架構

```
Stock-Radar/                    ← 本 repo 根目錄（Google Drive 同步）
├── stock-api/                  ← FastAPI 後端，部署到 Vercel
├── stock-frontend/             ← React + Vite + Recharts，部署到 GitHub Pages
├── 啟動股票雷達.bat             ← 本機一鍵啟動
├── CLAUDE.md                   ← ← 你正在讀的檔案
└── README.md
```

**GitHub Repo**: https://github.com/yingertw-arch/Stock-Radar  
**生產前端（GitHub Pages）**: https://yingertw-arch.github.io/Stock-Radar/  
**生產後端（Vercel）**: https://stock-radar-api.vercel.app/api  
**本機後端 port**: 8001  
**本機前端 port**: 5173  
**Python 路徑（本機）**: `C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`

---

## 前端架構（stock-frontend/src/）

### 正確的檔案結構（不要更動）

```
src/
├── App.jsx                     ← 3 個 Tab（大盤/推薦股/自選股）+ StockDashboard overlay
├── App.css                     ← 空的 override 檔
├── index.css                   ← 所有 CSS 變數和全域樣式
├── main.jsx                    ← React 進入點
├── api.js                      ← 所有 API 呼叫（含 /dashboard、/search）
├── firebase.js                 ← Firebase Firestore 自選股同步
├── utils.js                    ← fmt / pctColor / pctSign / shortDate
├── hooks/
│   └── useFetch.js             ← 自訂 fetch hook（含 mounted ref 防 leak）
├── components/
│   ├── SparkLine.jsx           ← 迷你折線圖
│   └── StockDashboard.jsx      ← ⭐ 完整個股儀表板（核心功能）
└── pages/
    ├── MarketPage.jsx          ← 大盤頁：TAIEX + 產業ETF + 漲跌排行
    ├── RecommendPage.jsx       ← 推薦股頁：候選股卡片（點擊→開儀表板）
    └── WatchlistPage.jsx       ← 自選股頁：Firebase 實時同步（點擊→開儀表板）
```

### ⚠️ 絕對不要做的事

- ❌ 不要新增「個股」第 4 個 Tab（個股儀表板是 overlay，不是獨立 Tab）
- ❌ 不要把 Firebase 改成 localStorage（自選股必須跨裝置同步）
- ❌ 不要刪除 `StockDashboard.jsx`（這是最核心的功能）
- ❌ 不要改 `api.js` 的 `dashboard` 函式或 `VITE_API_BASE` 變數名稱
- ❌ 不要改 CSS 變數名稱（`--surface`、`--muted`、`--blue`、`--orange` 等）

### CSS 變數（index.css）

```css
--bg:       #0d1117   /* 最深背景 */
--surface:  #161b22   /* 卡片背景 */
--surface2: #1c2230   /* 卡片內區塊 */
--border:   #30363d
--text:     #e6edf3
--muted:    #8b949e
--red:      #f85149   /* 台股上漲用紅色 */
--green:    #3fb950   /* 台股下跌用綠色 */
--yellow:   #d29922
--blue:     #58a6ff
--orange:   #f0883e
```

### 核心 UX 流程

```
使用者點擊推薦股/自選股/漲跌排行中任一股票
  → App.jsx 的 openStock({ symbol, name, sector }) 被呼叫
  → selected state 設定
  → StockDashboard 覆蓋整個畫面（不是新頁面）
  → StockDashboard 呼叫 api.dashboard(symbol)
  → /api/stock/{symbol}/dashboard 回傳所有資料
  → 顯示 K線 + KD + MACD + 三大法人 + ... 完整儀表板
  → 使用者點「←」回到原來的 Tab
```

### 自選股（WatchlistPage）運作方式

- 使用者在輸入框打代號或中文名稱 → 下拉自動補全（搜尋 /api/search）
- 選到或打好代號後按「＋ 加入自選」→ 呼叫 api.dashboard(sym) 確認股票存在
- 成功後寫入 Firebase Firestore（collection: `watchlist`）
- 每張卡片右上角有 ✕ 按鈕可移除
- Firebase 即時同步 → 跨裝置即時更新

---

## 後端架構（stock-api/）

### 檔案結構

```
stock-api/
├── api/index.py                ← Vercel 入口：from app.main import app
├── app/
│   ├── main.py                 ← FastAPI + CORS（allow_origins=["*"]）
│   ├── cache.py                ← in-memory TTL cache（20分鐘/1小時）
│   ├── indicators.py           ← 所有技術指標純數學函式
│   ├── fetchers.py             ← async httpx 資料抓取
│   ├── scoring.py              ← 股票評分 + asyncio.gather 並行
│   ├── concepts.py             ← AI/材料概念股分類字典
│   ├── correlation.py          ← 美台連動分析
│   ├── summarizers.py          ← 市場摘要文字產生
│   ├── universe.py             ← Market dataclass + 股票池載入
│   └── routers/
│       ├── markets.py          ← GET /api/markets
│       ├── stock.py            ← GET /api/stock + /dashboard + /kline + /kd + /macd + /institutional + /search
│       ├── market_analysis.py  ← GET /api/analyze
│       ├── taiex.py            ← GET /api/taiex
│       ├── sectors.py          ← GET /api/sectors
│       └── movers.py           ← GET /api/movers
├── data/
│   ├── tw_universe.json        ← 40 支台股（自動補全用）
│   └── us_universe.json        ← 25 支美股（自動補全用）
├── vercel.json
└── requirements.txt
```

### 關鍵 API 端點

| 端點 | 說明 |
|------|------|
| `GET /api/taiex` | TAIEX 指數 + sparkline[60] |
| `GET /api/sectors` | 8 個產業 ETF 報價 |
| `GET /api/movers?market=tw` | 漲跌幅前 10 |
| `GET /api/analyze?market=tw` | 全市場分析（候選股/偏向/概念股）|
| `GET /api/stock?symbol=2330&market=tw` | 單股分析（舊版相容）|
| `GET /api/stock/{symbol}/dashboard` | ⭐ 個股完整儀表板（一次呼叫回傳所有資料）|
| `GET /api/search?q=關鍵字` | 搜尋股票名稱或代號（台股＋美股）|

### /api/search 說明

- 搜尋 `tw_universe.json` 和 `us_universe.json`
- 支援中文名稱模糊搜尋（e.g. `台積` → 台積電）
- 支援代號搜尋（e.g. `233` → 2330.TW）
- 回傳最多 10 筆，含 symbol / name / sector / market

### /dashboard 上櫃股自動偵測

- 純數字代號預設試 `.TW`（上市股）
- 若歷史資料 < 20 根，自動 retry `.TWO`（上櫃股）
- 例如輸入 `6274` → 先試 6274.TW → 失敗 → 自動改 6274.TWO

### /dashboard 回傳的 21 個欄位

`symbol`, `name`, `price`, `dayChangePct`, `dayChangeAbs`, `volume`, `bid`, `ask`, `chart`（含 bollinger）, `kd`, `macd`, `institutional`, `mainForce`, `keyPriceLevels`, `technicalSignals`, `mainForceSignal`, `aiWinRate`, `patternAnalysis`, `technicalSummary`, `tradingSuggestion`, `multiPeriodCharts`

---

## 環境設定

### 前端 .env（stock-frontend/.env）

```env
VITE_API_BASE=https://stock-radar-api.vercel.app/api
VITE_FIREBASE_API_KEY=（存放於 GitHub Secrets，請勿在此填寫）
VITE_FIREBASE_AUTH_DOMAIN=stock-radar-8b1b5.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=stock-radar-8b1b5
VITE_FIREBASE_STORAGE_BUCKET=stock-radar-8b1b5.firebasestorage.app
VITE_FIREBASE_MSG_SENDER=842343604406
VITE_FIREBASE_APP_ID=1:842343604406:web:ac49875b8762034c994617
```

### GitHub Secrets（已設定完畢）

```
VITE_API_BASE
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MSG_SENDER
VITE_FIREBASE_APP_ID
```

### 本機啟動

```bash
# 後端
cd stock-api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload

# 前端（另一個終端）
cd stock-frontend
npm run dev
```

或直接執行根目錄的 `啟動股票雷達.bat`

---

## 待辦事項（優先順序）

- [ ] 中優先：測試自選股完整流程（加入、顯示報價、移除、跨裝置同步）
- [ ] 中優先：測試個股儀表板（點擊推薦股/自選股 → K線/KD/MACD 是否正常渲染）
- [ ] 低優先：美股個股儀表板支援（目前只支援台股 symbol）
- [ ] 低優先：自選股支援美股代號（AAPL、NVDA 等，需確認 dashboard 是否正常）
- [ ] 低優先：tw_universe.json 擴充更多台股（目前 40 支，autocomplete 範圍有限）

---

## 歷史紀錄

| 日期 | 事件 |
|------|------|
| 2026-04-29 | 舊 repo（SimpleHTTPServer）最後更新 |
| 2026-05-05 | 全面改寫為 FastAPI + React，初始 commit 推送至 GitHub |
| 2026-05-05 | 另一台電腦誤將前端簡化（移除 StockDashboard、改 localStorage）→ 已修復 |
| 2026-05-05 | 建立 CLAUDE.md 防止未來方向偏移 |
| 2026-05-05 | 後端部署到 Vercel：https://stock-radar-api.vercel.app |
| 2026-05-05 | 前端部署到 GitHub Pages：https://yingertw-arch.github.io/Stock-Radar/ |
| 2026-05-06 | Firebase 設定完成（stock-radar-8b1b5），自選股跨裝置同步啟用 |
| 2026-05-06 | 新增 /api/search 端點：中文名稱/代號模糊搜尋 |
| 2026-05-06 | 自選股輸入框加入 autocomplete 下拉補全 |
| 2026-05-06 | 後端 dashboard 加入 .TWO 上櫃股自動 fallback |
