# START_APP.ps1 - FLPerformance Application Startup Script
# Starts both backend and frontend servers in separate terminal windows

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "     FLPerformance Application Startup" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# Change to project directory
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "Project Directory: $ProjectDir" -ForegroundColor Gray
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "WARNING: Dependencies not installed!" -ForegroundColor Yellow
    Write-Host "Run .\scripts\install.ps1 first" -ForegroundColor Yellow
    pause
    exit 1
}

# Check if Foundry Local is installed
Write-Host "Checking Foundry Local installation..." -ForegroundColor Cyan
$foundryCheck = node scripts/check-foundry.js
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "WARNING: Foundry Local is not installed!" -ForegroundColor Yellow
    Write-Host "Please install Foundry Local from:" -ForegroundColor Yellow
    Write-Host "https://github.com/microsoft/foundry-local" -ForegroundColor Blue
    pause
    exit 1
}

Write-Host "Foundry Local installed" -ForegroundColor Green
Write-Host ""

# Start Backend Server in new terminal
Write-Host "Starting Backend Server (port 3001)..." -ForegroundColor Cyan
$backendCmd = "Set-Location `"$ProjectDir`"; npm run server"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# Start Frontend Server in new terminal
Write-Host "Starting Frontend Server (port 3000)..." -ForegroundColor Cyan
$clientPath = Join-Path $ProjectDir "src\client"
$frontendCmd = "Set-Location `"$clientPath`"; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "Starting servers..." -ForegroundColor Green
Write-Host ""
Write-Host "Two terminal windows should open:" -ForegroundColor Cyan
Write-Host "  - Backend Server - Port 3001" -ForegroundColor Gray
Write-Host "  - Frontend Server - Port 3000" -ForegroundColor Gray
Write-Host ""

Write-Host "Opening application in browser..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "FLPerformance is starting!" -ForegroundColor Green
Write-Host ""
Write-Host "To stop the servers:" -ForegroundColor Yellow
Write-Host "  - Press Ctrl+C in each terminal window" -ForegroundColor Gray
Write-Host "  - Or close the terminal windows" -ForegroundColor Gray
Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

pause
