# 🚀 Quick Start - Get FLPerformance Running

Follow these steps to get up and running in minutes!

## ✅ Step 1: Install Foundry Local (Required)

**Windows:**
```powershell
winget install Microsoft.FoundryLocal
```

**macOS:**
```bash
brew tap microsoft/foundrylocal
brew install foundrylocal
```

**Verify it worked:**
```bash
foundry --version
```

✅ If you see a version number, you're good to go!

---

## ✅ Step 2: Install Dependencies

Make sure you're in the FLPerformance directory:

```powershell
# Check where you are
Get-Location

# Should show: C:\Users\...\FLPerformance
# If not, navigate to the project:
cd path\to\FLPerformance
```

Run the installation script:

```powershell
.\scripts\install.ps1
```

This will:
- ✅ Check Node.js and npm
- ✅ Install all dependencies
- ✅ Set up the project structure

---

## ✅ Step 3: Start the Application

**Easy Mode (Recommended):**
```powershell
.\START_APP.ps1
```

This will:
- ✅ Open 2 terminal windows (backend + frontend)
- ✅ Automatically open your browser to http://localhost:3000
- ✅ Display clear status messages

**Manual Mode:**
```bash
npm run dev
```

Wait for these messages:
```
Backend server listening on port 3001
Frontend dev server listening on port 3000
```

---

## ✅ Step 4: Open the Web Application

**If using START_APP.ps1:** Browser opens automatically! 🎉

**If using npm run dev:** Open your browser manually:

### 🌐 http://localhost:3000

You should see the FLPerformance dashboard!

---

## ⚙️ Stopping the Application

**If started with START_APP.ps1:**
- Press Ctrl+C in each terminal window
- Or simply close the terminal windows

**If started with npm run dev:**
- Press Ctrl+C in your terminal

---

## ✅ Step 5: Set Up Your First Model

**In the web application:**

1. **Click "Models"** in the sidebar

2. **Click "Initialise Foundry Local"**
   - One-time setup
   - Takes ~5 seconds
   - Green checkmark when done

3. **Click "Add Model"**
   - Search for: `phi-3-mini-4k-instruct`
   - Click "Add Model"

4. **Click "Load Model"**
   - First time: Downloads ~2GB
   - Takes 2-5 minutes
   - Progress bar shows status

5. **Status changes to "Loaded"** ✅

---

## ✅ Step 6: Run Your First Benchmark

1. **Click "Benchmarks"** in sidebar

2. **Select your model** (check the box)

3. **Click "Run Benchmark"**
   - Uses "default" benchmark suite
   - Takes ~1-2 minutes
   - Shows live progress

4. **Click "Results"** to see performance metrics!

---

## 🎉 You're Done!

Your FLPerformance setup is complete. You can now:

- ✅ Add more models
- ✅ Run custom benchmarks
- ✅ Compare model performance
- ✅ Export results as JSON/CSV

---

## ⚠️ Troubleshooting

### Can't access http://localhost:3000?

**Check if servers are running:**
```powershell
# You should see both processes running in your terminal
# Frontend: Vite dev server on port 3000
# Backend: Express server on port 3001
```

**Restart if needed:**
- Press `Ctrl+C` to stop
- Run `npm run dev` again

### "Foundry Local not found" error?

**Make sure it's installed:**
```bash
foundry --version
```

**If not found:**
- Windows: `winget install Microsoft.FoundryLocal`
- macOS: `brew tap microsoft/foundrylocal && brew install foundrylocal`
- Restart your terminal after installation

### Model won't load?

**Check disk space:**
- Models are ~2-50GB each
- Ensure you have enough free space

**Check internet:**
- First-time load requires download
- Check your network connection

### Port already in use?

**Something else using port 3000 or 3001:**

```powershell
# Find what's using the port
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# Kill the process (use PID from above)
taskkill /PID <PID> /F
```

---

## 📚 Next Steps

- Read [QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md) for commands
- Check [QUICK_START.md](QUICK_START.md) for detailed guide
- See [TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md) for testing

---

## 🆘 Need Help?

1. Check [Troubleshooting](#troubleshooting) section above
2. Review logs in the terminal
3. Check UI error messages in the Models tab
4. See full documentation in `docs/` folder

---

**Happy Benchmarking! 🚀**
