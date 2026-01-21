# FLPerformance Installation Script (PowerShell)
# This script installs all dependencies for FLPerformance on Windows

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " FLPerformance Installation Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Warning: Not running as administrator. Some operations may fail." -ForegroundColor Yellow
    Write-Host ""
}

# Function to check if command exists
function Test-Command {
    param($command)
    try {
        if (Get-Command $command -ErrorAction Stop) {
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

# Step 1: Check Node.js
Write-Host "Step 1: Checking Node.js..." -ForegroundColor Green
if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Host "Node.js is installed: $nodeVersion" -ForegroundColor Green
    
    # Check if version is >= 18
    $versionNumber = $nodeVersion -replace 'v', ''
    $majorVersion = [int]($versionNumber -split '\.')[0]
    if ($majorVersion -lt 18) {
        Write-Host "Warning: Node.js version 18 or higher is recommended. You have: $nodeVersion" -ForegroundColor Yellow
    }
} else {
    Write-Host "Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js 18 or higher from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 2: Check npm
Write-Host "Step 2: Checking npm..." -ForegroundColor Green
if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-Host "npm is installed: v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "npm is not installed!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Check Foundry Local
Write-Host "Step 3: Checking Foundry Local..." -ForegroundColor Green
$foundryCommands = @("foundry", "foundry-local", "fl")
$foundryInstalled = $false

foreach ($cmd in $foundryCommands) {
    if (Test-Command $cmd) {
        try {
            $foundryVersion = & $cmd --version 2>&1
            Write-Host "Foundry Local is installed via '$cmd': $foundryVersion" -ForegroundColor Green
            $foundryInstalled = $true
            break
        } catch {
            continue
        }
    }
}

if (-not $foundryInstalled) {
    Write-Host "Foundry Local is not installed!" -ForegroundColor Red
    Write-Host "   Install using:" -ForegroundColor Yellow
    Write-Host "   winget install Microsoft.FoundryLocal" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Or visit: https://aka.ms/foundry-local-installer" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Do you want to install Foundry Local now? (y/n)"
    if ($response -eq "y" -or $response -eq "Y") {
        Write-Host "Installing Foundry Local via winget..." -ForegroundColor Green
        winget install Microsoft.FoundryLocal
        Write-Host ""
        Write-Host "Please restart your terminal after installation!" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host "Skipping Foundry Local installation." -ForegroundColor Yellow
        Write-Host "FLPerformance requires Foundry Local to function!" -ForegroundColor Yellow
    }
}
Write-Host ""

# Step 4: Install root dependencies
Write-Host "Step 4: Installing root dependencies..." -ForegroundColor Green
Write-Host "Using --no-optional to skip SQLite (requires Visual Studio Build Tools)" -ForegroundColor Gray
try {
    npm install --no-optional
    Write-Host "Root dependencies installed successfully" -ForegroundColor Green
    Write-Host "Note: Results will be saved as JSON files (SQLite database skipped)" -ForegroundColor Gray
} catch {
    Write-Host "Failed to install root dependencies" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 5: Install client dependencies
Write-Host "Step 5: Installing client dependencies..." -ForegroundColor Green
Push-Location src/client
try {
    npm install
    Write-Host "Client dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to install client dependencies" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host ""

# Step 6: Verify foundry-local-sdk installation
if (-not (Test-Path "node_modules/foundry-local-sdk")) {
    Write-Host "Installing foundry-local-sdk..." -ForegroundColor Yellow
    npm install foundry-local-sdk
}

# Step 7: Create results directory
if (-not (Test-Path "results")) {
    New-Item -ItemType Directory -Path "results" | Out-Null
}

# Step 8: Test Foundry Local SDK (silent check)
$testScript = @'
import { FoundryLocalManager } from 'foundry-local-sdk';
try {
  const manager = new FoundryLocalManager();
  await manager.isServiceRunning();
} catch (error) {}
'@

$testScript | Out-File -FilePath "test-foundry-temp.mjs" -Encoding UTF8
try {
    node test-foundry-temp.mjs 2>&1 | Out-Null
} catch {}
Remove-Item "test-foundry-temp.mjs" -ErrorAction SilentlyContinue

# Summary
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " Installation Summary" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Ensure Foundry Local is installed and in your PATH" -ForegroundColor White
Write-Host "2. Start the application:" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Or run in production mode:" -ForegroundColor White
Write-Host "   npm run build" -ForegroundColor Cyan
Write-Host "   npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "For more information, see README.md" -ForegroundColor Yellow
Write-Host ""
