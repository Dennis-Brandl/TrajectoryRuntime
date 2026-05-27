// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useContext } from 'react';
import { X } from 'lucide-react';
import styles from './StepDetailPopup.module.css';
import { ActionLogPanel } from './ActionLogPanel.js';
import { useActionProxy } from '../actionProxy/useActionProxy.js';
import { WorkflowContext } from '../coordinator/WorkflowContext.js';

interface StepDetailPopupProps {
  stepOid: string;
  stepType: string;
  description: string;
  completedAt: number;
  state?: string;
  error?: string;
  scriptSource?: string;
  inputParameters: Record<string, string>;
  outputParameters: Record<string, string>;
  onClose: () => void;
}

export function StepDetailPopup({ stepOid, stepType, description, completedAt, state, error, scriptSource, inputParameters, outputParameters, onClose }: StepDetailPopupProps) {
  const coordinator = useContext(WorkflowContext);
  const isActionProxy = stepType === 'ACTION PROXY';
  const apController = isActionProxy && coordinator ? coordinator.getActionController(stepOid) : null;
  const apSnap = useActionProxy(apController);

  const date = new Date(completedAt);
  const inputEntries = Object.entries(inputParameters);
  const outputEntries = Object.entries(outputParameters);
  const isErrored = state === 'ERRORED';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{description}</h3>
          <button className={styles.closeButton} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={styles.meta}>
          <div className={styles.metaRow}>Type: {stepType}</div>
          <div className={styles.metaRow}>{isErrored ? 'Errored' : 'Completed'}: {date.toLocaleString()}</div>
        </div>

        {isErrored && error && (
          <>
            <h4 className={styles.sectionTitle}>Error</h4>
            <div className={styles.errorBlock}>{error}</div>
          </>
        )}

        {scriptSource && (
          <>
            <h4 className={styles.sectionTitle}>Script Source</h4>
            <pre className={styles.codeBlock}>{scriptSource}</pre>
          </>
        )}

        <h4 className={styles.sectionTitle}>Input Parameters</h4>
        {inputEntries.length > 0 ? (
          <table className={styles.paramTable}>
            <tbody>
              {inputEntries.map(([key, value]) => (
                <tr key={key}><td>{key}</td><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.emptyParams}>None</p>
        )}

        <h4 className={styles.sectionTitle}>Output Parameters</h4>
        {outputEntries.length > 0 ? (
          <table className={styles.paramTable}>
            <tbody>
              {outputEntries.map(([key, value]) => (
                <tr key={key}><td>{key}</td><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.emptyParams}>None</p>
        )}

        {isActionProxy && (
          <div>
            <h4 className={styles.sectionTitle}>Action log</h4>
            <ActionLogPanel snapshot={apSnap} />
          </div>
        )}
      </div>
    </div>
  );
}
