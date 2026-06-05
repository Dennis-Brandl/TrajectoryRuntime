// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import styles from './WelcomeSplash.module.css';

interface WelcomeSplashProps {
  onContinue: () => void;
}

export function WelcomeSplash({ onContinue }: WelcomeSplashProps) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.card}>
        <img
          src="/TrajectorRuntimeSplashScreen.png"
          alt="Trajectory Workflow Runtime"
          className={styles.splash}
        />
        <div className={styles.body}>
          <p>
            Execute workflows, procedures, recipes, and batch processes.
          </p>
          <p>
            Run multiple workflows simultaneously with a web display and simulations of the phone and tablet
            interfaces.
          </p>
        </div>
        <button type="button" className={styles.continue} onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
