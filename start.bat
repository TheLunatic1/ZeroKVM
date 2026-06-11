@echo off
title KVM Mesh Launcher
echo =========================================
echo    KVM Mesh Application Initialization
echo =========================================
echo.

echo Checking for Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! 
    echo Please install Node.js v18 or higher from https://nodejs.org/
    pause
    exit /b
)

echo.
echo [1/3] Checking Signaling Server dependencies...
if not exist "signaling-server\node_modules" (
    echo Installing Signaling Server dependencies...
    cd signaling-server
    call npm install
    cd ..
) else (
    echo Dependencies found.
)

echo.
echo [2/3] Checking Core Service dependencies...
if not exist "core-service\node_modules" (
    echo Installing Core Service dependencies...
    cd core-service
    call npm install
    cd ..
) else (
    echo Dependencies found.
)

echo.
echo [3/3] Checking Frontend dependencies...
if not exist "frontend-pwa\node_modules" (
    echo Installing Frontend dependencies...
    cd frontend-pwa
    call npm install
    cd ..
) else (
    echo Dependencies found.
)

echo.
echo =========================================
echo    Starting KVM Services...
echo =========================================
echo.

echo Starting Signaling Server...
start "Signaling Server" cmd /k "cd signaling-server && npm start"

echo Starting Core Service...
start "Core Service" cmd /k "cd core-service && node index.js"

echo Starting Frontend PWA...
start "Frontend PWA" cmd /k "cd frontend-pwa && npm run dev"

echo Waiting for services to initialize...
timeout /t 5 /nobreak > nul

echo.
echo Opening UI in default browser...
start http://localhost:5173

echo.
echo =========================================
echo    All services started successfully!
echo =========================================
echo - To install the app, click the install icon on the right side of the Chrome address bar.
echo - Leave the 3 new terminal windows open while using the KVM.
echo.
pause
