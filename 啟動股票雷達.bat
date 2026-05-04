@echo off
chcp 65001 > nul
echo 🚀 啟動台股雷達...
echo.

:: 啟動 Python 後端
echo [1/2] 啟動 FastAPI 後端 (port 8001)...
start "台股雷達-後端" cmd /k "cd /d "C:\Users\User\OneDrive\桌面\Claude Code\stock-api" && C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload"

:: 等後端啟動
timeout /t 3 /nobreak > nul

:: 啟動 React 前端
echo [2/2] 啟動 React 前端 (port 5173)...
start "台股雷達-前端" cmd /k "cd /d "C:\Users\User\OneDrive\桌面\Claude Code\stock-frontend" && npm run dev"

:: 等前端啟動
timeout /t 4 /nobreak > nul

:: 開啟瀏覽器
echo [3/3] 開啟瀏覽器...
start http://localhost:5173

echo.
echo ✅ 台股雷達已啟動！
echo    後端：http://127.0.0.1:8001
echo    前端：http://localhost:5173
echo.
pause
