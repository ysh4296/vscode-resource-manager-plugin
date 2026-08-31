import React from "react";
import type { ValidationReport } from "../../registry/validator";

export interface ValidationResultProps {
  report: ValidationReport | null;
  onValidate: () => void;
}

export function ValidationResult({ report, onValidate }: ValidationResultProps): JSX.Element {
  return (
    <div className="panel validation-result">
      <div className="panel-header">
        <h3>Validation</h3>
        <button onClick={onValidate}>Run Validation</button>
      </div>

      {!report && <p className="hint">Run validation to see results.</p>}

      {report && (
        <ul className="validation-list">
          {report.checks.map((check) => (
            <li key={check.id} className={check.passed ? "check-pass" : "check-fail"}>
              {check.passed ? "✅" : "❌"} {check.label}
              {!check.passed && check.message && <span className="check-message"> — {check.message}</span>}
            </li>
          ))}
        </ul>
      )}

      {report && (
        <p className={report.ok ? "status-ok" : "status-bad"}>
          {report.ok ? "All checks passed." : "Validation failed — push is blocked."}
        </p>
      )}
    </div>
  );
}
