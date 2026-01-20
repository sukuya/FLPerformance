import React, { useState, useEffect } from 'react';
import { modelsAPI, benchmarksAPI } from '../utils/api';

function Benchmarks() {
  const [models, setModels] = useState([]);
  const [suites, setSuites] = useState([]);
  const [selectedSuite, setSelectedSuite] = useState(null);
  const [selectedModels, setSelectedModels] = useState([]);
  const [config, setConfig] = useState({
    iterations: 5,
    concurrency: 1,
    timeout: 30000,
    temperature: 0.7,
    streaming: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadModels();
    loadSuites();
  }, []);

  const loadModels = async () => {
    try {
      const res = await modelsAPI.getAll();
      setModels(res.data.models.filter(m => m.status === 'running'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const loadSuites = async () => {
    try {
      const res = await benchmarksAPI.getSuites();
      setSuites(res.data.suites);
      if (res.data.suites.length > 0) {
        setSelectedSuite(res.data.suites[0].name);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleModelToggle = (modelId) => {
    setSelectedModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const handleRunBenchmark = async (e) => {
    e.preventDefault();
    
    if (selectedModels.length === 0) {
      setError('Please select at least one model');
      return;
    }

    if (!selectedSuite) {
      setError('Please select a benchmark suite');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await benchmarksAPI.run({
        modelIds: selectedModels,
        suiteName: selectedSuite,
        config
      });
      setSuccess('Benchmark started! View progress in the Results tab.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentSuite = suites.find(s => s.name === selectedSuite);

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>Benchmarks</h2>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {models.length === 0 && (
        <div className="error">
          No running models available. Please start at least one model service in the Models tab before running benchmarks.
        </div>
      )}

      <form onSubmit={handleRunBenchmark}>
        <div className="card">
          <div className="card-header">Select Benchmark Suite</div>
          <div className="form-group">
            <label className="form-label">Suite</label>
            <select
              className="form-control"
              value={selectedSuite || ''}
              onChange={(e) => setSelectedSuite(e.target.value)}
              required
            >
              {suites.map(suite => (
                <option key={suite.name} value={suite.name}>
                  {suite.name} - {suite.description}
                </option>
              ))}
            </select>
          </div>

          {currentSuite && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Suite Details</h4>
              <p style={{ marginBottom: '0.5rem', color: '#7f8c8d' }}>
                {currentSuite.description}
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>Scenarios:</strong> {currentSuite.scenarios?.length || 0}
              </p>
              {currentSuite.scenarios && (
                <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                  {currentSuite.scenarios.slice(0, 5).map((scenario, idx) => (
                    <li key={idx} style={{ marginBottom: '0.25rem', color: '#7f8c8d' }}>
                      {scenario.name} ({scenario.expected_output_length})
                    </li>
                  ))}
                  {currentSuite.scenarios.length > 5 && (
                    <li style={{ color: '#7f8c8d' }}>
                      ... and {currentSuite.scenarios.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">Select Models</div>
          <p style={{ marginBottom: '1rem', color: '#7f8c8d' }}>
            Select one or more models to benchmark (only running services are shown):
          </p>
          {models.length === 0 ? (
            <p style={{ color: '#e74c3c' }}>No running models available</p>
          ) : (
            <div>
              {models.map(model => (
                <div key={model.id} style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id={`model-${model.id}`}
                    checked={selectedModels.includes(model.id)}
                    onChange={() => handleModelToggle(model.id)}
                    style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
                  />
                  <label htmlFor={`model-${model.id}`} style={{ cursor: 'pointer' }}>
                    <strong>{model.alias}</strong> ({model.model_id}) - {model.endpoint}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">Configuration</div>
          <div className="form-group">
            <label className="form-label">
              Iterations per Scenario
              <span style={{ color: '#7f8c8d', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                (Number of times to run each scenario)
              </span>
            </label>
            <input
              type="number"
              className="form-control"
              value={config.iterations}
              onChange={(e) => setConfig({ ...config, iterations: parseInt(e.target.value) })}
              min="1"
              max="100"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              Timeout (ms)
              <span style={{ color: '#7f8c8d', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                (Maximum time to wait for a response)
              </span>
            </label>
            <input
              type="number"
              className="form-control"
              value={config.timeout}
              onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) })}
              min="5000"
              max="120000"
              step="1000"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              Temperature
              <span style={{ color: '#7f8c8d', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                (0.0 = deterministic, 1.0 = creative)
              </span>
            </label>
            <input
              type="number"
              className="form-control"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              min="0"
              max="2"
              step="0.1"
              required
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.streaming}
                onChange={(e) => setConfig({ ...config, streaming: e.target.checked })}
                style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
              />
              <span className="form-label" style={{ marginBottom: 0 }}>
                Enable Streaming (for TTFT measurement)
              </span>
            </label>
          </div>
        </div>

        <div className="card">
          <button 
            type="submit" 
            className="btn btn-success" 
            disabled={loading || models.length === 0 || selectedModels.length === 0}
          >
            {loading ? 'Starting Benchmark...' : 'Run Benchmark'}
          </button>
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={() => setSelectedModels([])}
          >
            Clear Selection
          </button>
        </div>
      </form>
    </div>
  );
}

export default Benchmarks;
