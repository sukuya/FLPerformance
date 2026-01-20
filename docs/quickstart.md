# Quick Start Guide

Get up and running with FLPerformance in 5 minutes.

## Prerequisites Check

Before starting, verify you have:
- ✅ Node.js 18+ installed (`node --version`)
- ✅ Microsoft Foundry Local installed (`foundry-local --version`)
- ✅ 16GB+ RAM available
- ✅ Internet connection (for model downloads)

## 5-Minute Quick Start

### 1. Install (2 minutes)

```bash
cd FLPerformance
npm run setup
```

Wait for dependencies to install.

### 2. Start (30 seconds)

```bash
npm run dev
```

Wait for both servers to start. You'll see:
```
Frontend: http://localhost:3000
API: http://localhost:3001
```

### 3. Add a Model (1 minute)

1. Open http://localhost:3000 in your browser
2. Click **Models** in the sidebar
3. Click **Add Model**
4. Select `phi-3-mini-4k-instruct` (small, fast model)
5. Click **Add Model**
6. Click **Start** next to your model (wait ~10 seconds)
7. Click **Load** to download the model (first time: ~1-5 minutes)

### 4. Run Benchmark (1-2 minutes)

1. Click **Benchmarks** in sidebar
2. Check the box next to your model
3. Set **Iterations** to `2` (for quick test)
4. Click **Run Benchmark**
5. Click **Results** in sidebar
6. Wait ~1-2 minutes, then refresh to see results

### 5. View Results (30 seconds)

In the Results tab:
- View comparison table with TPS and latency
- See charts comparing performance
- Click **Export JSON** to save results

🎉 **Done!** You've run your first benchmark.

## Next Steps

### Add More Models

Add another model for comparison:
1. Go to Models tab
2. Add `llama-3.2-1b-instruct` (similar size)
3. Start and Load
4. Run another benchmark with both models selected

### Customize Benchmarks

1. Open `/benchmarks/suites/default.json`
2. Review scenarios
3. Edit or add your own prompts
4. Restart app to see changes

### Export and Analyze

1. Go to Results tab
2. Select a benchmark run
3. Export as JSON or CSV
4. Analyze in Excel, Python, or other tools

## Troubleshooting

**Model won't start?**
- Check Foundry Local is running: `foundry-local service status`
- View logs in UI by clicking "Logs" button

**Benchmark stuck?**
- Increase timeout in Benchmark settings
- Check backend console for errors

**GPU metrics missing?**
- Normal on macOS
- On Windows/Linux: check GPU drivers

## Common Commands

```bash
# Start development mode
npm run dev

# Check Foundry Local
npm run check-foundry

# Install/update dependencies
npm run setup

# Production build and run
npm start
```

## Tips

1. **Small models first:** Start with phi-3-mini or llama-3.2-1b
2. **Low iterations:** Use 2-3 iterations for testing, 5-10 for real benchmarks
3. **One model at a time:** Avoid memory issues on systems with < 32GB RAM
4. **Monitor resources:** Watch Task Manager/Activity Monitor during benchmarks
5. **Save results:** Export after each run you want to keep

## Documentation

- [Full Setup Guide](./setup.md) - Detailed installation
- [Architecture](./architecture.md) - How it works
- [Limitations](./limitations.md) - Known issues
- [API Reference](./api.md) - REST API docs

## Support

If you get stuck:
1. Check the logs (UI or console)
2. Read the error message carefully
3. Review documentation
4. Check Foundry Local is working independently

Happy benchmarking! 🚀
