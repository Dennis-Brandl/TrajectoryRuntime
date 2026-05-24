// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
