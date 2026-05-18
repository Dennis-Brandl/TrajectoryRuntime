// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { TraceEntry } from '@engine/types.js';

interface StepParamSnapshot {
  inputParameters: Record<string, string>;
  outputParameters: Record<string, string>;
  description: string;
  label: string;
  stepType: string;
}

interface TraceViewProps {
  trace: TraceEntry[];
  properties: Record<string, string>;
  stepParams: Record<string, StepParamSnapshot>;
}

const STATE_COLORS: Record<string, string> = {
  EXECUTING: '#2563eb',
  COMPLETED: '#16a34a',
  IDLE: '#9ca3af',
  WAITING: '#d97706',
  STARTING: '#8b5cf6',
  COMPLETING: '#06b6d4',
  ERRORED: '#dc2626',
};

function ParamTable({ label, params }: { label: string; params: Record<string, string> }) {
  const entries = Object.entries(params);
  if (entries.length === 0) return null;
  return (
    <div className="step-param-section">
      <h5>{label}</h5>
      <table className="trace-table">
        <thead>
          <tr><th>Key</th><th>Value</th></tr>
        </thead>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td className="trace-oid">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TraceView({ trace, properties, stepParams }: TraceViewProps) {
  const stepEntries = Object.entries(stepParams);

  return (
    <div className="trace-view">
      <div className="trace-table-wrap">
        <h3>Execution Trace</h3>
        {trace.length === 0 ? (
          <p className="trace-empty">No trace entries yet.</p>
        ) : (
          <table className="trace-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Step OID</th>
                <th>State</th>
                <th>After Action</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {trace.map((entry, i) => (
                <tr key={i}>
                  <td>{entry.order}</td>
                  <td className="trace-oid">{entry.step_oid}</td>
                  <td>
                    <span
                      className="trace-state"
                      style={{ color: STATE_COLORS[entry.state] ?? '#000' }}
                    >
                      {entry.state}
                    </span>
                  </td>
                  <td>{entry.after_action !== undefined ? entry.after_action : '—'}</td>
                  <td style={{ color: '#dc2626' }}>{entry.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="trace-properties">
        <h3>Properties</h3>
        {Object.keys(properties).length === 0 ? (
          <p className="trace-empty">No properties.</p>
        ) : (
          <table className="trace-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(properties).map(([key, value]) => (
                <tr key={key}>
                  <td className="trace-oid">{key}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {stepEntries.length > 0 && (
        <div className="step-params">
          <h3>Step Parameters</h3>
          {stepEntries.map(([oid, snap]) => (
            <div key={oid} className="step-param-card">
              <h4>{snap.label} <span className="step-type-badge">{snap.stepType}</span></h4>
              {snap.description && snap.description !== snap.stepType && (
                <p className="step-param-desc">{snap.description}</p>
              )}
              <span className="step-oid">{oid}</span>
              <ParamTable label="Input Parameters" params={snap.inputParameters} />
              <ParamTable label="Output Parameters" params={snap.outputParameters} />
              {Object.keys(snap.inputParameters).length === 0 && Object.keys(snap.outputParameters).length === 0 && (
                <p className="trace-empty">No parameters.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
