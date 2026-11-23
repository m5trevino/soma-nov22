import { For, createEffect, onMount, Show } from 'solid-js';
import { useDeckStore, prettyProvider } from './stores/deckStore';
import type { ProviderMeta } from './stores/deckStore';
import { useThemeStore } from './stores/themeStore';
import { useRouteStore, hrefFor } from './stores/routeStore';
import { providerVars } from './utils/providerColors';
import { reportedPrices } from './utils/prices';
import { ModelPool } from './components/ModelPool';
import { DeckManager } from './components/DeckManager';
import { StagePinner } from './components/StagePinner';
import { PipelinePanel } from './components/PipelinePanel';
import { ProfileIO } from './components/ProfileIO';
import { FreshnerListsTab } from './components/FreshnerLists';
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
 * Emits one entry per (id, provider) pair — the same model on different
 * providers becomes separate cards. Route keys are set to the single provider
 * so the provider filter works as expected.
 */
function normalizeModels(rawModels: any[], providerMeta: ProviderMeta): ModelEntry[] {
  const byKey = new Map<string, ModelEntry>();

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
    const prices = reportedPrices(raw);
    const inputPrice1m = prices.input;
    const outputPrice1m = prices.output;
    const cacheReadPrice1m = prices.cacheRead;
    const rpm = numOrUndef(raw.rpm);
    const rpd = numOrUndef(raw.rpd);
    const kind = raw.kind ? String(raw.kind) : undefined;

    // Unique key is now id + provider (gateway).
    const key = `${id}::${gateway}`;
    if (byKey.has(key)) continue; // already emitted for this provider

    byKey.set(key, {
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
      rpm,
      rpd,
      kind,
    });
  }

  return Array.from(byKey.values());
}

async function fetchModels(): Promise<{ models: ModelEntry[]; meta: ProviderMeta }> {
  // Providers switched off on the engine are returned too, so their tabs can
  // say "off". The All tab hides them; the SDK never sees them.
  const response = await fetch(`${ENGINE_BASE}/models?only_enabled_providers=false`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const meta = extractProviderMeta(data);
  return { models: normalizeModels(collectRawModels(data), meta), meta };
}

export default function App() {
  const store = useDeckStore();
  const themeStore = useThemeStore();
  const routeStore = useRouteStore();
  const route = routeStore.route;
  const activeProvider = (): string | undefined => {
    const current = route();
    return current.view === 'provider' ? current.provider : undefined;
  };

  // The provider tab narrows the model library to that provider.
  createEffect(() => {
    store.setScopeProvider(activeProvider() ?? null);
  });

  const loadModels = async () => {
    store.setModelStatus('loading');
    store.setModelError('');
    try {
      const { models, meta } = await fetchModels();
      store.setProviderMeta(meta);
      store.setAvailableModels(models);
      store.setModelStatus('ready');
    } catch (error: any) {
      console.warn('Could not fetch models from engine:', error);
      store.setModelStatus('error');
      store.setModelError(error?.message || String(error));
      store.setAvailableModels([]);
    }
  };

  /**
   * Called when a freshner list is loaded: push route keys into the model pool
   * so they appear (or highlight) in the library.
   */
  const onImportRoutes = (routes: string[]) => {
    const known = store.availableModels();
    const matched: ModelEntry[] = [];
    for (const route of routes) {
      for (const m of known) {
        const providers = m.gateways && m.gateways.length > 0
          ? m.gateways
          : [m.provider];
        if (providers.includes(route) || m.id === route) {
          matched.push(m);
          break;
        }
      }
    }
    if (matched.length > 0) {
      // Add matched models to deck when a saved list is loaded
      for (const model of matched) {
        if (!store.isInDeck(model.id, model.provider)) {
          store.addToDeck(model);
        }
      }
      store.showToast(`Loaded "${routes.length} models" into deck`);
    }
  };

  onMount(loadModels);

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

  const enabledModelCount = () => store.availableModels().filter(m => !store.providerOff(m.provider)).length;

  /** Providers that are on first, then those that are off, each alphabetical. */
  const tabProviders = () => {
    const list = store.providers();
    return [
      ...list.filter(provider => !store.providerOff(provider)),
      ...list.filter(provider => store.providerOff(provider)),
    ];
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
            <strong>{enabledModelCount()}</strong>
          </div>
          <div class="status-pill">
            <span class="status-label">Providers</span>
            <strong>{store.activeProviders().length}</strong>
          </div>
          <div class="status-pill deck-pill">
            <span class="status-label">Deck</span>
            <strong>{store.deck().length}</strong>
          </div>
        </div>
      </header>

      {/* Tabs are links: each view has its own address and the back button works. */}
      <nav class="tab-bar provider-tabs" role="tablist" aria-label="Views">
        <a
          role="tab"
          class="tab-link"
          classList={{ active: route().view === 'all' }}
          aria-selected={route().view === 'all'}
          href={hrefFor({ view: 'all' })}
        >
          All Models
          <span class="tab-count">{enabledModelCount()}</span>
        </a>
        <For each={tabProviders()}>
          {(provider) => {
            const active = () => activeProvider() === provider;
            const off = () => store.providerOff(provider);
            return (
              <a
                role="tab"
                class="tab-link provider-tab"
                classList={{ active: active(), off: off() }}
                style={providerVars(store.colorFor(provider))}
                aria-selected={active()}
                href={hrefFor({ view: 'provider', provider })}
                title={off() ? `${store.providerLabel(provider)} is switched off on the engine` : store.providerLabel(provider)}
              >
                <span class="tab-led"></span>
                {store.providerLabel(provider)}
                <span class="tab-count">{store.providerCounts()[provider] || 0}</span>
                <Show when={off()}><span class="tab-off">off</span></Show>
              </a>
            );
          }}
        </For>
        <a
          role="tab"
          class="tab-link"
          classList={{ active: route().view === 'freshner' }}
          aria-selected={route().view === 'freshner'}
          href={hrefFor({ view: 'freshner' })}
        >
          Freshner Lists
        </a>
      </nav>

      <ProfileIO />

      <Show when={route().view !== 'freshner'}>
        <main class="workspace">
          <section class="workspace-main">
            <ModelPool onReload={loadModels} provider={activeProvider()} />
          </section>

          <aside class="workspace-side">
            <DeckManager />
            <PipelinePanel />
          </aside>
        </main>
      </Show>

      <Show when={route().view === 'freshner'}>
        <main class="workspace workspace--freshner">
          <section class="workspace-main">
            <FreshnerListsTab onConfigsLoaded={(configs) => {
              // Find matching models in the engine catalog and add them to deck
              const known = store.availableModels();
              let loaded = 0;
              for (const config of configs) {
                const match = known.find(m =>
                  m.id === config.modelId || m.provider === config.provider
                );
                if (match && !store.isInDeck(match.id, match.provider)) {
                  store.addToDeck(match);
                  loaded++;
                }
              }
              store.showToast(`Loaded ${loaded} models from ${configs.length} configs`);
              routeStore.navigate({ view: 'all' });
            }} />
          </section>
        </main>
      </Show>

      <StagePinner />

      <footer class="app-footer">
        <span class="footer-brand">
          <CpuIcon size={12} />
          Turn Key profile builder
        </span>
        <span class="footer-sep">·</span>
        <span>Engine <code>{ENGINE_BASE}</code></span>
        <span class="footer-spacer"></span>
        <span>{enabledModelCount()} models</span>
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
