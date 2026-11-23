import { onMount, Show, createEffect } from 'solid-js';
import { useDeckStore, prettyProvider } from './stores/deckStore';
import { useThemeStore } from './stores/themeStore';
import { useTabStore } from './stores/tabStore';
import type { ProviderMeta } from './stores/deckStore';
import { loadTabConfig } from './utils/tabConfig';
import tabConfigData from './config-data/tabs.json';
import { ModelPool } from './components/ModelPool';
import { DeckManager } from './components/DeckManager';
import { StagePinner } from './components/StagePinner';
import { PipelinePanel } from './components/PipelinePanel';
import { ProfileIO } from './components/ProfileIO';
import { CpuIcon, MoonIcon, SunIcon } from './components/Icons';
import type { ModelEntry } from './types';
import { ENGINE_BASE } from './config';

function tagless(value: string): string {
  return value.replace(/^\s*(?:\[[^\]]*\]\s*)+/, '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanModelName(rawName: string | undefined, id: string, gateway: string): string {
  let name = tagless(rawName || '');
  if (gateway && gateway !== 'unknown') {
    name = name
      .replace(new RegExp(`\\s*[—–-]\\s*${escapeRegExp(gateway)}(?:\\s*\\/\\s*.*)?\\s*$`, 'i'), '')
      .trim();
  }
  if (!name || name === id) return id;
  return name;
}

function extractProviderMeta(data: any): ProviderMeta {
  const meta: ProviderMeta = {};
  if (!data || Array.isArray(data) || typeof data !== 'object') return meta;

  const raw = data.providers;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') meta[item] = { label: prettyProvider(item) };
      else if (item && typeof item === 'object' && item.id) {
        meta[item.id] = { label: item.label || prettyProvider(item.id), enabled: item.enabled, visible: item.visible };
      }
    }
    return meta;
  }

  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (value && typeof value === 'object') {
        const provider = value as any;
        meta[key] = {
          label: provider.label || prettyProvider(key),
          enabled: provider.enabled,
          visible: provider.visible,
        };
      } else {
        meta[key] = { label: prettyProvider(key) };
      }
    }
  }
  return meta;
}

/**
 * The engine returns the same models under `models` and again grouped under
 * `by_gateway`. Only one canonical list is read so nothing is listed twice.
 */
function collectRawModels(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  for (const key of ['models', 'data', 'results', 'available', 'model_list']) {
    if (Array.isArray(data[key])) return data[key];
  }

  const out: any[] = [];
  if (data.by_gateway && typeof data.by_gateway === 'object') {
    for (const [gateway, list] of Object.entries(data.by_gateway)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        out.push(item && typeof item === 'object' ? { ...item, gateway: (item as any).gateway || gateway } : item);
      }
    }
    if (out.length > 0) return out;
  }

  for (const [key, value] of Object.entries(data)) {
    if (['providers', 'by_gateway', 'count', 'meta', 'usage', 'status'].includes(key)) continue;
    if (Array.isArray(value)) out.push(...value);
    else if (value && typeof value === 'object') {
      for (const nested of Object.values(value as any)) {
        if (Array.isArray(nested)) out.push(...nested);
      }
    }
  }
  return out;
}

/**
 * Collapses routes that serve the same model id into one entry. Route keys are
 * merged into `gateways`, while tools/context metadata keeps the richest value.
 */
function normalizeModels(rawModels: any[], providerMeta: ProviderMeta): ModelEntry[] {
  const byId = new Map<string, ModelEntry>();

  for (const raw of rawModels) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id ?? raw.model ?? raw.name ?? '').trim();
    if (!id) continue;

    const gateway = String(raw.gateway ?? raw.provider ?? raw.route ?? 'unknown').trim() || 'unknown';
    const label = providerMeta[gateway]?.label || prettyProvider(gateway);
    const rawTools = raw.tools_supported ?? raw.toolsSupported ?? raw.tools;
    const toolsSupported = rawTools === true || rawTools === 'true' || rawTools === 1 || rawTools === '1';
    const contextWindow = Number(raw.context_window ?? raw.contextWindow ?? 0) || undefined;
    const maxCompletionTokens = Number(raw.max_completion_tokens ?? raw.maxCompletionTokens ?? 0) || undefined;
    const rawName = raw.display_name ?? raw.displayName ?? raw.name;
    const name = cleanModelName(rawName ? String(rawName) : undefined, id, gateway);
    // The engine reports price per 1M tokens. Absent means "not reported", which
    // is different from 0 ("free") — keep undefined for the first case so a
    // missing field never gets counted as a free model.
    const numOrUndef = (v: any): number | undefined => {
      if (v === null || v === undefined || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const inputPrice1m = numOrUndef(raw.input_price_1m ?? raw.inputPrice1m);
    const outputPrice1m = numOrUndef(raw.output_price_1m ?? raw.outputPrice1m);
    const cacheReadPrice1m = numOrUndef(raw.cache_read_price_1m ?? raw.cacheReadPrice1m);

    const existing = byId.get(id);
    if (existing) {
      const routes = new Set(existing.gateways && existing.gateways.length > 0 ? existing.gateways : [existing.provider]);
      routes.add(gateway);
      existing.gateways = Array.from(routes).sort((a, b) => a.localeCompare(b));
      existing.toolsSupported = Boolean(existing.toolsSupported || toolsSupported);
      existing.contextWindow = Math.max(existing.contextWindow || 0, contextWindow || 0) || undefined;
      existing.maxCompletionTokens = Math.max(existing.maxCompletionTokens || 0, maxCompletionTokens || 0) || undefined;
      // Same model behind several gateways: keep the cheapest published price,
      // because that is the route a rotation deck should prefer.
      if (inputPrice1m !== undefined) {
        existing.inputPrice1m = existing.inputPrice1m === undefined
          ? inputPrice1m
          : Math.min(existing.inputPrice1m, inputPrice1m);
      }
      if (outputPrice1m !== undefined) {
        existing.outputPrice1m = existing.outputPrice1m === undefined
          ? outputPrice1m
          : Math.min(existing.outputPrice1m, outputPrice1m);
      }
      if (cacheReadPrice1m !== undefined) {
        existing.cacheReadPrice1m = existing.cacheReadPrice1m === undefined
          ? cacheReadPrice1m
          : Math.min(existing.cacheReadPrice1m, cacheReadPrice1m);
      }
      if ((!existing.name || existing.name === existing.id) && name !== id) existing.name = name;
      if (!existing.note && raw.note) existing.note = String(raw.note);
      if (existing.provider === 'unknown' && gateway !== 'unknown') {
        existing.provider = gateway;
        existing.providerLabel = label;
      }
      continue;
    }

    byId.set(id, {
      id,
      name,
      provider: gateway,
      providerLabel: label,
      gateways: [gateway],
      tier: raw.tier ? String(raw.tier) : undefined,
      toolsSupported,
      contextWindow,
      maxCompletionTokens,
      note: raw.note ? String(raw.note) : undefined,
      status: raw.status ? String(raw.status) : undefined,
      inputPrice1m,
      outputPrice1m,
      cacheReadPrice1m,
    });
  }

  return Array.from(byId.values());
}

async function fetchModels(): Promise<{ models: ModelEntry[]; meta: ProviderMeta }> {
  const response = await fetch(`${ENGINE_BASE}/models`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const meta = extractProviderMeta(data);
  return { models: normalizeModels(collectRawModels(data), meta), meta };
}

export default function App() {
  const store = useDeckStore();
  const themeStore = useThemeStore();
  const tabStore = useTabStore();

  /**
   * Models come from the resolved tab config, not the engine.
   *
   * The config is the skill's filtered first pass. Loading it here means the
   * builder never sees the full catalog and never applies filter semantics —
   * it renders the tabs the config names. See src/utils/tabConfig.ts.
   */
  const loadModels = async () => {
    store.setModelStatus('loading');
    store.setModelError('');
    tabStore.setStatus('loading');
    try {
      const config = loadTabConfig(tabConfigData);
      tabStore.load(config);

      // Provider labels come from what the config carries, so a provider that
      // only appears on one tab still renders with its proper name.
      const meta: ProviderMeta = {};
      for (const tab of config.tabs) {
        for (const model of tab.models) {
          if (model.provider && !meta[model.provider]) {
            meta[model.provider] = { label: model.providerLabel || prettyProvider(model.provider) };
          }
        }
      }
      store.setProviderMeta(meta);
      store.setModelStatus('ready');
    } catch (error: any) {
      console.warn('Could not load the tab config:', error);
      tabStore.fail(error?.message || String(error));
      store.setModelStatus('error');
      store.setModelError(error?.message || String(error));
      store.setAvailableModels([]);
    }
  };

  onMount(loadModels);

  // The pool renders the active tab's models. Keeping this in an effect rather
  // than a direct assignment means switching tabs republishes without reloading.
  createEffect(() => {
    const models = tabStore.activeModels();
    if (tabStore.status() === 'ready') {
      store.setAvailableModels(models as ModelEntry[]);
    }
  });

  const engineLabel = () => {
    try {
      return ENGINE_BASE.startsWith('http') ? new URL(ENGINE_BASE).host : ENGINE_BASE;
    } catch {
      return ENGINE_BASE;
    }
  };

  const engineState = () => {
    if (store.modelStatus() === 'ready') return 'is-live';
    if (store.modelStatus() === 'error') return 'is-error';
    return 'is-loading';
  };

  return (
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true"><span>TK</span></div>
          <div class="brand-copy">
            <h1>Turn Key</h1>
            <p>Model deck builder <span class="brand-sep">/</span> Dendritic pipeline</p>
          </div>
        </div>

        <div class="header-cluster">
          <div class="theme-toggle" role="group" aria-label="Color theme">
            <button
              type="button"
              class="theme-option"
              classList={{ active: themeStore.theme() === 'light' }}
              aria-pressed={themeStore.theme() === 'light'}
              onClick={() => themeStore.setTheme('light')}
              title="Light theme"
            >
              <SunIcon size={12} />
              <span>Light</span>
            </button>
            <button
              type="button"
              class="theme-option"
              classList={{ active: themeStore.theme() === 'dark' }}
              aria-pressed={themeStore.theme() === 'dark'}
              onClick={() => themeStore.setTheme('dark')}
              title="Dark theme"
            >
              <MoonIcon size={12} />
              <span>Dark</span>
            </button>
          </div>

          <div class="status-pill engine-pill" title={ENGINE_BASE}>
            <span class={`status-led ${engineState()}`}></span>
            <span class="status-label">Engine</span>
            <code class="status-value">{engineLabel()}</code>
          </div>
          <div class="status-pill">
            <span class="status-label">Models</span>
            <strong>{store.availableModels().length}</strong>
          </div>
          <div class="status-pill">
            <span class="status-label">Providers</span>
            <strong>{store.providers().length}</strong>
          </div>
          <div class="status-pill deck-pill">
            <span class="status-label">Deck</span>
            <strong>{store.deck().length}</strong>
          </div>
        </div>
      </header>

      <ProfileIO />

      <main class="workspace">
        <section class="workspace-main">
          <ModelPool onReload={loadModels} />
        </section>

        <aside class="workspace-side">
          <DeckManager />
          <PipelinePanel />
        </aside>
      </main>

      <StagePinner />

      <footer class="app-footer">
        <span class="footer-brand">
          <CpuIcon size={12} />
          Turn Key profile builder
        </span>
        <span class="footer-sep">·</span>
        <span>Engine <code>{ENGINE_BASE}</code></span>
        <span class="footer-spacer"></span>
        <span>{store.availableModels().length} unique models</span>
        <span class="footer-sep">·</span>
        <span>{store.deck().length} in deck</span>
      </footer>

      <Show when={store.toastMsg()}>
        <div class="toast-container" role="status" aria-live="polite">
          <div class="toast">
            <span class="toast-icon">✓</span>
            <span>{store.toastMsg()}</span>
          </div>
        </div>
      </Show>
    </div>
  );
}
