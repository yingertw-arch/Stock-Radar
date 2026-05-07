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

- [ ] 高優先：部署並實測 2026-05-07 的自選股修正（中文名稱、30 秒報價刷新、更新時間顯示）
- [ ] 中優先：測試自選股完整流程（加入、顯示報價、移除、跨裝置同步）
- [ ] 中優先：測試個股儀表板（點擊推薦股/自選股 → K線/KD/MACD 是否正常渲染）
- [ ] 低優先：美股個股儀表板支援（目前只支援台股 symbol）
- [ ] 低優先：自選股支援美股代號（AAPL、NVDA 等，需確認 dashboard 是否正常）
- [ ] 低優先：tw_universe.json 擴充更多台股（目前 40 支，autocomplete 範圍有限）

---

## 2026-05-07 Codex 修正紀錄（尚未部署）

### 使用者回報

- 自選股仍無法穩定顯示中文名稱。
- 自選股報價/連線更新訊息不夠即時，使用者不知道資料是否正在刷新。

### 已修改檔案

- `stock-api/app/universe.py`
  - 新增 `find_universe_stock(symbol, preferred_market_id="tw")`
  - 用股票池 `tw_universe.json` / `us_universe.json` 查詢股票中文名稱與產業。
  - 支援純代號、`.TW`、`.TWO` alias，例如 `6274` 可對到 `6274.TWO` 的「台燿」。

- `stock-api/app/routers/stock.py`
  - `/api/stock/{symbol}/dashboard` 現在優先使用股票池名稱：
    - `name`: 股票池中文名 → Yahoo `shortName` → Yahoo `longName` → symbol
    - `sector`: 股票池產業，找不到則空字串
  - `.TWO` fallback 後會重新查一次股票池 profile，避免上櫃股仍顯示代號或英文名。

- `stock-frontend/src/pages/WatchlistPage.jsx`
  - 自選股加入流程會保留 autocomplete 選到的 `name` / `sector`。
  - 若使用者直接輸入中文名稱後按 Enter，會從目前 suggestions 中找完全匹配名稱或代號的項目再加入。
  - 既有 Firebase watchlist 若已存成代號，前端顯示時會用 `dashboard` quote 回來的 `q.name` 補上中文名。
  - 自選股報價會立即抓一次，之後每 30 秒自動刷新。
  - 新增狀態文字：
    - `更新報價中…`
    - `報價更新於 HH:mm:ss`
    - `等待報價更新…`

### 已驗證

- 後端語法檢查通過：
  - `python -m compileall app`
- 股票池查名測試通過：
  - `find_universe_stock("2330")` → `台積電`
  - `find_universe_stock("6274")` → `台燿`
  - `find_universe_stock("6274.TWO")` → `台燿`
- `git diff --check` 無錯誤，只有 Windows LF/CRLF warning。

### 尚未完成 / 阻塞

- 前端尚未 build / deploy。
- 原因：`stock-frontend/node_modules` 在 Google Drive 同步目錄中不完整，`vite` 執行檔缺失。
  - `npm.cmd run build` 失敗：`vite is not recognized`
  - 檢查發現 `node_modules/vite` 只有部分檔案，`.bin` 不存在。
  - 嘗試 `npm.cmd install` 兩次皆在雲端同步目錄中超時。
- 下一步建議：
  - 在本機非雲端同步目錄或乾淨 clone 中執行 `npm install && npm run build`。
  - build 成功後再 commit / push / deploy。

---

## 2026-05-07 Codex 追加修正：建榮 5340 中文搜尋

### 使用者回報

- 自選股搜尋「建榮」無法以中文搜尋到股票。
- 直接輸入 `5340` 加入自選後，卡片顯示 Yahoo 英文名 `BAOTEK INDUSTRIAL MATERIALS LTD`，不是中文「建榮」。

### 根因

- `stock-api/data/tw_universe.json` 股票池沒有 `5340.TWO`，所以：
  - `/api/search?q=建榮` 找不到結果。
  - `/dashboard` 的 `find_universe_stock("5340")` 找不到中文 profile，只能退回 Yahoo 名稱。
- 前端既有自選股如果 Firebase 已存成英文名，原本不會用 quote 回來的新中文名稱覆蓋顯示。

### 已修改

- `stock-api/data/tw_universe.json`
  - 新增：
    - `5340.TWO` / `建榮` / `電子材料`
- `stock-frontend/src/pages/WatchlistPage.jsx`
  - `handleAdd()` 若偵測到中文輸入，且目前 suggestions 尚未有結果，會立即呼叫 `api.search(raw)` 解析中文名稱。
  - 自選股卡片顯示名稱時，若 quote 回來有 `q.name`，優先使用 quote 名稱，讓已存成英文名的舊卡片也能刷新成中文。

### 驗證重點

- `/api/search?q=建榮` 應回傳 `5340.TWO 建榮`。
- `/api/stock/5340/dashboard` 應回傳 `name: 建榮`、`sector: 電子材料`。
- 既有自選股卡片 `BAOTEK INDUSTRIAL MATERIALS LTD` 在重新抓 quote 後應改顯示「建榮」。

---

## 2026-05-07 Codex 追加修正：重新整理保留目前分頁

### 使用者回報

- 在「自選股」分頁重新整理頁面時，畫面會跳回「大盤」。

### 根因

- `stock-frontend/src/App.jsx` 原本用 `useState("market")` 作為固定初始 tab。
- 瀏覽器 reload 後 React state 會重建，因此永遠回到大盤。

### 已修改

- `stock-frontend/src/App.jsx`
  - 新增 `readInitialTab()`：
    - 優先讀網址 hash，例如 `#watchlist`。
    - 若 hash 不合法，讀 `localStorage` 的 `stock-radar-active-tab`。
    - 都沒有時才回到 `market`。
  - 點擊 tab 時改用 `switchTab(nextTab)`：
    - 更新 React state。
    - 關閉個股 dashboard overlay。
    - 寫入 localStorage。
    - 用 `history.replaceState` 同步網址 hash。
  - 新增 `hashchange` listener，支援瀏覽器 hash 切換時同步分頁。

### 驗證重點

- 進入 `https://yingertw-arch.github.io/Stock-Radar/#watchlist` 應直接顯示自選股。
- 在自選股分頁按重新整理，仍應留在自選股。
- 點選大盤/推薦股/自選股時，網址 hash 應分別更新為 `#market`、`#recommend`、`#watchlist`。

---

## 2026-05-07 Codex 追加修正：增你強 3028 中文搜尋

### 使用者回報

- 在自選股輸入「增你強」仍顯示找不到，無法用中文搜尋加入。

### 根因

- `/api/search` 只搜尋 `stock-api/data/tw_universe.json` 和 `us_universe.json`。
- `tw_universe.json` 尚未收錄 `3028.TW 增你強`，所以中文搜尋沒有結果。

### 已修改

- `stock-api/data/tw_universe.json`
  - 新增：
    - `3028.TW` / `增你強` / `電子通路`

### 驗證重點

- `/api/search?q=增你強` 應回傳 `3028.TW 增你強`。
- 直接輸入 `3028` 加入自選後，卡片名稱應顯示「增你強」，不是 Yahoo 英文名。

### 後續注意

- 目前中文搜尋仍仰賴本地股票池，不是完整台股清單。
- 若使用者搜尋某檔中文名稱找不到，第一優先檢查並補齊 `tw_universe.json`。
- 長期應改成完整台股 universe 或後端定期同步上市/上櫃清單，避免逐檔手補。

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
| 2026-05-07 | Codex 修正自選股中文名稱來源與報價刷新狀態（尚未 build/deploy，需處理前端 node_modules 不完整問題） |
| 2026-05-07 | Codex 追加修正建榮 5340：補進 tw_universe、支援中文加入前即時 search、舊英文卡片刷新成中文 |
| 2026-05-07 | Codex 追加修正重新整理自選股會跳回大盤：App.jsx 以 hash/localStorage 保存目前分頁 |
| 2026-05-07 | Codex 追加修正增你強 3028：補進 tw_universe，讓中文搜尋與自選股顯示中文名稱 |
