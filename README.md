# 台股雷達 Stock-Radar

台股分析系統：FastAPI 後端 + React 前端

## 架構

```
Stock-Radar/
├── stock-api/       # FastAPI 後端 → 部署到 Vercel
└── stock-frontend/  # React + Vite + Recharts → 部署到 GitHub Pages
```

## 功能

- 📊 **大盤**：TAIEX + 產業ETF + 漲跌排行
- 🔥 **推薦股**：全市場分析 + 今日偏向 + 候選股
- ⭐ **自選股**：Firebase Firestore 多裝置同步
- 📈 **個股儀表板**：K線+布林通道 / KD / MACD / 三大法人 / AI勝率

## 本地啟動

```bash
# 後端 (port 8001)
cd stock-api
python -m uvicorn app.main:app --reload --port 8001

# 前端 (port 5173)
cd stock-frontend
npm run dev
```

或直接執行 `啟動股票雷達.bat`
