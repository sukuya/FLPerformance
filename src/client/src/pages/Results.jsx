import React, { useState, useEffect } from 'react';
import { benchmarksAPI } from '../utils/api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function Results() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRuns();
  }, []);

  useEffect(() => {
    if (selectedRun) {
      loadResults(selectedRun);
    }
  }, [selectedRun]);

  const loadRuns = async () => {
    try {
      const res = await benchmarksAPI.getRuns();
      setRuns(res.data.runs);
      if (res.data.runs.length > 0) {
        setSelectedRun(res.data.runs[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadResults = async (runId) => {
    try {
      const res = await benchmarksAPI.getRun(runId);
      setResults(res.data.results);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleExport = async (format) => {
    try {
      const res = format === 'json' 
        ? await benchmarksAPI.exportJSON(selectedRun)
        : await benchmarksAPI.exportCSV(selectedRun);
      
      const blob = new Blob([res.data], { 
        type: format === 'json' ? 'application/json' : 'text/csv' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `benchmark-${selectedRun}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  // Aggregate results by model for comparison
  const getModelAggregates = () => {
    const modelMap = {};
    
    results.forEach(result => {
      if (!modelMap[result.model_id]) {
        modelMap[result.model_id] = {
          model_id: result.model_id,
          tps: [],
          latency_p50: [],
          latency_p95: [],
          latency_p99: [],
          error_rate: [],
          scenarios: 0
        };
      }
      
      if (result.tps) modelMap[result.model_id].tps.push(result.tps);
      if (result.latency_p50) modelMap[result.model_id].latency_p50.push(result.latency_p50);
      if (result.latency_p95) modelMap[result.model_id].latency_p95.push(result.latency_p95);
      if (result.latency_p99) modelMap[result.model_id].latency_p99.push(result.latency_p99);
      if (result.error_rate !== null) modelMap[result.model_id].error_rate.push(result.error_rate);
      modelMap[result.model_id].scenarios++;
    });

    return Object.values(modelMap).map(m => ({
      model: m.model_id,
      avgTps: m.tps.length ? (m.tps.reduce((a, b) => a + b, 0) / m.tps.length).toFixed(2) : 0,
      avgP50: m.latency_p50.length ? (m.latency_p50.reduce((a, b) => a + b, 0) / m.latency_p50.length).toFixed(0) : 0,
      avgP95: m.latency_p95.length ? (m.latency_p95.reduce((a, b) => a + b, 0) / m.latency_p95.length).toFixed(0) : 0,
      avgP99: m.latency_p99.length ? (m.latency_p99.reduce((a, b) => a + b, 0) / m.latency_p99.length).toFixed(0) : 0,
      avgErrorRate: m.error_rate.length ? (m.error_rate.reduce((a, b) => a + b, 0) / m.error_rate.length).toFixed(2) : 0,
      scenarios: m.scenarios
    }));
  };

  const modelAggregates = results.length > 0 ? getModelAggregates() : [];

  if (loading) return <div className="loading">Loading results...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>Results</h2>

      {error && <div className="error">{error}</div>}

      {runs.length === 0 ? (
        <div className="card">
          <p>No benchmark runs available. Run a benchmark first.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Select Benchmark Run</label>
                <select
                  className="form-control"
                  value={selectedRun || ''}
                  onChange={(e) => setSelectedRun(e.target.value)}
                  style={{ maxWidth: '600px' }}
                >
                  {runs.map(run => (
                    <option key={run.id} value={run.id}>
                      {run.suite_name} - {new Date(run.started_at).toLocaleString()} ({run.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button className="btn btn-primary" onClick={() => handleExport('json')}>
                  Export JSON
                </button>
                <button className="btn btn-secondary" onClick={() => handleExport('csv')}>
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {results.length > 0 && (
            <>
              <div className="card">
                <div className="card-header">Model Comparison</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Avg TPS</th>
                      <th>Avg P50 Latency</th>
                      <th>Avg P95 Latency</th>
                      <th>Avg P99 Latency</th>
                      <th>Avg Error Rate</th>
                      <th>Scenarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelAggregates.map((model, idx) => (
                      <tr key={idx}>
                        <td><strong>{model.model}</strong></td>
                        <td>{model.avgTps} tokens/s</td>
                        <td>{model.avgP50} ms</td>
                        <td>{model.avgP95} ms</td>
                        <td>{model.avgP99} ms</td>
                        <td>{model.avgErrorRate}%</td>
                        <td>{model.scenarios}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {modelAggregates.length > 0 && (
                <>
                  <div className="card">
                    <div className="card-header">Throughput Comparison (TPS)</div>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={modelAggregates}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="model" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="avgTps" fill="#3498db" name="Avg TPS" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div className="card-header">Latency Comparison (ms)</div>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={modelAggregates}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="model" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="avgP50" fill="#27ae60" name="P50" />
                        <Bar dataKey="avgP95" fill="#e67e22" name="P95" />
                        <Bar dataKey="avgP99" fill="#e74c3c" name="P99" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              <div className="card">
                <div className="card-header">Best Model For...</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '1rem', background: '#ecf0f1', borderRadius: '4px', borderLeft: '4px solid #27ae60' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Highest Throughput</h4>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#27ae60', marginBottom: '0.25rem' }}>
                      {[...modelAggregates].sort((a, b) => b.avgTps - a.avgTps)[0]?.avgTps} tps
                    </p>
                    <p style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>
                      {[...modelAggregates].sort((a, b) => b.avgTps - a.avgTps)[0]?.model}
                    </p>
                  </div>
                  <div style={{ padding: '1rem', background: '#ecf0f1', borderRadius: '4px', borderLeft: '4px solid #3498db' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Lowest P95 Latency</h4>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3498db', marginBottom: '0.25rem' }}>
                      {[...modelAggregates].sort((a, b) => a.avgP95 - b.avgP95)[0]?.avgP95} ms
                    </p>
                    <p style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>
                      {[...modelAggregates].sort((a, b) => a.avgP95 - b.avgP95)[0]?.model}
                    </p>
                  </div>
                  <div style={{ padding: '1rem', background: '#ecf0f1', borderRadius: '4px', borderLeft: '4px solid #9b59b6' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Most Stable</h4>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#9b59b6', marginBottom: '0.25rem' }}>
                      {[...modelAggregates].sort((a, b) => a.avgErrorRate - b.avgErrorRate)[0]?.avgErrorRate}% error
                    </p>
                    <p style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>
                      {[...modelAggregates].sort((a, b) => a.avgErrorRate - b.avgErrorRate)[0]?.model}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">Detailed Results</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Scenario</th>
                      <th>TPS</th>
                      <th>TTFT (ms)</th>
                      <th>P50 (ms)</th>
                      <th>P95 (ms)</th>
                      <th>P99 (ms)</th>
                      <th>Error %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, idx) => (
                      <tr key={idx}>
                        <td><code>{result.model_id}</code></td>
                        <td>{result.scenario}</td>
                        <td>{result.tps?.toFixed(2) || '-'}</td>
                        <td>{result.ttft?.toFixed(0) || '-'}</td>
                        <td>{result.latency_p50?.toFixed(0) || '-'}</td>
                        <td>{result.latency_p95?.toFixed(0) || '-'}</td>
                        <td>{result.latency_p99?.toFixed(0) || '-'}</td>
                        <td>{result.error_rate?.toFixed(1) || '0'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Results;
