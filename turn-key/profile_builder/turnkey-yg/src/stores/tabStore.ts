import { createSignal, createMemo, createRoot } from 'solid-js';
import type { TabConfig, TabDefinition, TabModel } from '../utils/tabConfig';

/**
 * Tab state for turnkey-yg.
 *
 * The active tab's models are what the model pool renders and what the deck
 * draws from. Switching tabs swaps the visible set; the deck itself is not
 * cleared, because a model picked on one tab may legitimately serve a stage
 * while you are looking at another.
 */

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const store = createRoot(() => {
  const [config, setConfig] = createSignal<TabConfig | null>(null);
  const [status, setStatus] = createSignal<LoadStatus>('idle');
  const [error, setError] = createSignal('');
  const [activeTabId, setActiveTabId] = createSignal('');

  const tabs = createMemo<TabDefinition[]>(() => config()?.tabs ?? []);

  const activeTab = createMemo<TabDefinition | null>(() => {
    const list = tabs();
    if (list.length === 0) return null;
    return list.find(tab => tab.id === activeTabId()) ?? list[0];
  });

  const activeModels = createMemo<TabModel[]>(() => activeTab()?.models ?? []);

  function load(next: TabConfig) {
    setConfig(next);
    setActiveTabId(next.defaultTabId);
    setStatus('ready');
    setError('');
  }

  function fail(message: string) {
    setStatus('error');
    setError(message);
    setConfig(null);
    setActiveTabId('');
  }

  function selectTab(id: string) {
    if (tabs().some(tab => tab.id === id)) setActiveTabId(id);
  }

  /**
   * Compare each tab's collapsed model count against what the config declared.
   *
   * The config's `modelCount` counts routes, so a tab whose models come from
   * multiple providers legitimately collapses to fewer cards. A mismatch in the
   * other direction — more cards than declared — means the collapse merged
   * nothing and something is wrong with the file.
   */
  const driftWarnings = createMemo<string[]>(() => {
    const warnings: string[] = [];
    for (const tab of tabs()) {
      if (tab.models.length > tab.declaredCount) {
        warnings.push(
          `${tab.label}: ${tab.models.length} cards from ${tab.declaredCount} declared routes`,
        );
      }
    }
    return warnings;
  });

  return {
    config, setConfig,
    status, setStatus,
    error, setError,
    activeTabId, setActiveTabId,
    tabs, activeTab, activeModels,
    load, fail, selectTab, driftWarnings,
  };
});

export function useTabStore() {
  return store;
}
