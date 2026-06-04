// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { Home, Play, GitBranch, Clock, Settings, type LucideIcon } from 'lucide-react';
import styles from './TabBar.module.css';

export type TabId = 'home' | 'active' | 'overview' | 'history' | 'settings';

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'active', label: 'Active', icon: Play },
  { id: 'overview', label: 'Overview', icon: GitBranch },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  vertical?: boolean;
}

export function TabBar({ activeTab, onTabChange, vertical }: TabBarProps) {
  const navClass = vertical ? `${styles.tabBar} ${styles.tabBarVertical}` : styles.tabBar;
  return (
    <nav className={navClass}>
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        const tabClass = `${styles.tab} ${isActive ? styles.tabActive : ''}`;
        const iconProps = isActive
          ? { fill: 'currentColor', strokeWidth: 0 }
          : {};

        return (
          <button
            key={tab.id}
            className={tabClass}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <Icon size={24} {...iconProps} />
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
