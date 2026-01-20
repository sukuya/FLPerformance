import React from 'react';

function Settings() {
  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>Settings</h2>

      <div className="card">
        <div className="card-header">System Information</div>
        <table className="table">
          <tbody>
            <tr>
              <td><strong>Application Version:</strong></td>
              <td>1.0.0</td>
            </tr>
            <tr>
              <td><strong>API Endpoint:</strong></td>
              <td>http://localhost:3001/api</td>
            </tr>
            <tr>
              <td><strong>Foundry Local:</strong></td>
              <td>Check Models tab for status</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header">About FLPerformance</div>
        <p style={{ marginBottom: '1rem' }}>
          FLPerformance is a benchmarking tool for evaluating Large Language Models (LLMs) 
          running via Microsoft Foundry Local. It enables you to:
        </p>
        <ul style={{ marginLeft: '2rem', marginBottom: '1rem' }}>
          <li>Manage multiple model services locally</li>
          <li>Run standardized benchmark suites</li>
          <li>Compare performance metrics across models</li>
          <li>Export results for further analysis</li>
        </ul>
        <p style={{ marginTop: '1.5rem' }}>
          For more information, see the <code>README.md</code> and documentation in the <code>/docs</code> folder.
        </p>
      </div>
    </div>
  );
}

export default Settings;
