import { For, Show, createSignal } from 'solid-js';
import { useDeckStore, modelProviders } from '../stores/deckStore';
import { providerVars } from '../utils/providerColors';
import type { ModelEntry, TestRecord, CostBand } from '../types';
import { costBand } from '../types';
import { ENGINE_BASE } from '../config';
import {
  BoltIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  EyeIcon,
  GridIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
} from './Icons';
import { chatTestBody, failureText, testKey } from '../utils/chatTest';

interface ModelPoolProps {
  onReload?: () => void;
  /** Set on a provider tab: the library shows only this provider. */
  provider?: string;
}

const SORT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'provider', label: 'Provider' },
  { key: 'cost', label: 'Cost' },
  { key: 'context', label: 'Context' },
  { key: 'tools', label: 'Tools' },
];

const COST_BANDS: { key: CostBand; label: string; hint: string }[] = [
  { key: 'free', label: 'Free', hint: 'Zero input and zero output price' },
  { key: 'cheap', label: 'Under $0.15', hint: 'Input at or below $0.15 per 1M — the DeepSeek Flash band' },
  { key: 'moderate', label: 'Under $1', hint: 'Priced, but under $1 per 1M input' },
  { key: 'expensive', label: 'Over $1', hint: 'Above $1 per 1M input — a deliberate choice' },
  { key: 'unknown', label: 'No price', hint: 'The engine did not report a price for this model' },
];

/** "$0.15 / $0.60" — input then output per 1M. Free reads as "free". */
const formatPrice = (model: ModelEntry): string => {
  const band = costBand(model);
  if (band === 'free') return 'free';
  if (band === 'unknown') return '—';
  const i = model.inputPrice1m;
  const o = model.outputPrice1m;
  const fmt = (n: number | undefined) => (n === undefined ? '?' : `$${n.toFixed(2)}`);
  return `${fmt(i)} / ${fmt(o)}`;
};

const formatNumber = (value: number | undefined): string => {
  const num = value || 0;
  if (num === 0) return '?';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return String(num);
};

const buildCurl = (model: ModelEntry, apiKey: string) => {
  const apiHost = ENGINE_BASE.startsWith('http') ? ENGINE_BASE : 'https://engine.save-aichats.com/v1';
  return `curl -s ${apiHost}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${model.id}",
    "provider": "${model.provider}",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 64
  }'`;
};

export function ModelPool(props: ModelPoolProps) {
  const store = useDeckStore();
  const [showCurlFor, setShowCurlFor] = createSignal<string | null>(null);
  const [showIoFor, setShowIoFor] = createSignal<string | null>(null);
  const [testing, setTesting] = createSignal(false);
  const [testProgress, setTestProgress] = createSignal({ done: 0, total: 0 });

  const allProviders = () => store.activeProviders();
  const selectedProviders = () => store.selectedProviders();
  const showAll = () => selectedProviders().length === 0;

  const hasFilters = () =>
    selectedProviders().length > 0 || store.searchQuery().trim() !== '' || store.toolsOnly() || store.priceActive();

  const clearFilters = () => {
    store.setSelectedProviders([]);
    store.setSearchQuery('');
    store.setToolsOnly(false);
    store.clearPriceFilters();
  };

  /** Parse a price box. Blank means "no limit". */
  const parsePrice = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const scopedLabel = () => (props.provider ? store.providerLabel(props.provider) : 'Model Library');
  const scopedOff = () => !!props.provider && store.providerOff(props.provider);

  const visibleTestSummary = () => {
    let success = 0;
    let failed = 0;
    let pending = 0;
    const results = store.testResults();
    for (const model of store.filteredModels()) {
      const record = results[testKey(model.provider, model.id)];
      if (!record) continue;
      if (record.status === 'success') success++;
      else if (record.status === 'failed') failed++;
      else pending++;
    }
    return { success, failed, pending, total: success + failed + pending };
  };

  const progressPercent = () => {
    if (store.modelStatus() !== 'ready') return 0;
    if (testing()) {
      const progress = testProgress();
      return progress.total ? (progress.done / progress.total) * 100 : 0;
    }
    const total = store.filteredModels().length;
    if (!total) return 0;
    return Math.min(100, (visibleTestSummary().total / total) * 100);
  };

  const progressLabel = () => {
    if (testing()) return `Testing ${testProgress().done}/${testProgress().total}`;
    if (store.modelStatus() === 'loading') return 'Loading models';
    if (store.modelStatus() === 'error') return 'Engine unreachable';
    const summary = visibleTestSummary();
    if (summary.total === 0) return 'No tests run';
    const parts = [`${summary.success} OK`];
    if (summary.failed > 0) parts.push(`${summary.failed} failed`);
    if (summary.pending > 0) parts.push(`${summary.pending} pending`);
    return parts.join(' · ');
  };

  const runSingleTest = async (model: ModelEntry) => {
    const requestBody = chatTestBody(model.id, model.provider, 'Say "TEST_OK" and nothing else.');

    store.setTestRecord(testKey(model.provider, model.id), {
      status: 'pending',
      requestBody,
      responseBody: null,
      error: null,
      durationMs: null,
    });

    const start = performance.now();
    try {
      const response = await fetch(`${ENGINE_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const durationMs = Math.round(performance.now() - start);
      const responseBody = await response.json().catch(() => null);

      if (response.ok) {
        store.setTestRecord(testKey(model.provider, model.id), {
          status: 'success',
          requestBody,
          responseBody,
          error: null,
          durationMs,
        });
        store.showToast(`${model.name || model.id}: OK (${durationMs}ms)`);
      } else {
        store.setTestRecord(testKey(model.provider, model.id), {
          status: 'failed',
          requestBody,
          responseBody,
          error: failureText(response.status, responseBody),
          durationMs,
        });
        store.showToast(`${model.name || model.id}: failed (${failureText(response.status, responseBody)})`);
      }
    } catch (error: any) {
      const durationMs = Math.round(performance.now() - start);
      store.setTestRecord(testKey(model.provider, model.id), {
        status: 'failed',
        requestBody,
        responseBody: null,
        error: error?.message || String(error),
        durationMs,
      });
      store.showToast(`${model.name || model.id}: request error`);
    }
  };

  const runTestAll = async (providerFilter?: string[]) => {
    let models = store.filteredModels();
    if (providerFilter && providerFilter.length > 0) {
      models = models.filter(model =>
        modelProviders(model).some(route => providerFilter.includes(route))
      );
    }
    if (models.length === 0) return;

    setTesting(true);
    setTestProgress({ done: 0, total: models.length });

    let passed = 0;
    let failed = 0;

    for (let index = 0; index < models.length; index++) {
      const model = models[index];
      setTestProgress({ done: index, total: models.length });

      const requestBody = chatTestBody(model.id, model.provider, 'ok');

      store.setTestRecord(testKey(model.provider, model.id), {
        status: 'pending',
        requestBody,
        responseBody: null,
        error: null,
        durationMs: null,
      });

      const start = performance.now();
      try {
        const response = await fetch(`${ENGINE_BASE}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        const durationMs = Math.round(performance.now() - start);
        const responseBody = await response.json().catch(() => null);

        if (response.ok) {
          store.setTestRecord(testKey(model.provider, model.id), {
            status: 'success',
            requestBody,
            responseBody,
            error: null,
            durationMs,
          });
          passed++;
        } else {
          store.setTestRecord(testKey(model.provider, model.id), {
            status: 'failed',
            requestBody,
            responseBody,
            error: failureText(response.status, responseBody),
            durationMs,
          });
          failed++;
        }
      } catch (error: any) {
        const durationMs = Math.round(performance.now() - start);
        store.setTestRecord(testKey(model.provider, model.id), {
          status: 'failed',
          requestBody,
          responseBody: null,
          error: error?.message || String(error),
          durationMs,
        });
        failed++;
      }

      setTestProgress({ done: index + 1, total: models.length });
      if (index < models.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    setTesting(false);
    store.showToast(`Test complete · ${passed} passed · ${failed} failed`);
  };

  return (
    <section class="panel model-panel" aria-label="Model library">
      <div class="panel-head">
        <div class="panel-title">
          <span class="panel-glyph"><GridIcon size={13} /></span>
          {scopedLabel()}
        </div>
        <div class="panel-meta">
          <span><strong>{store.filteredModels().length}</strong> of {store.scopedModels().length} shown</span>
          <Show when={store.deck().length > 0}>
            <span class="meta-divider"></span>
            <span class="selection-pill">
              <span class="status-led is-selected"></span>
              {store.deck().length} selected
            </span>
          </Show>
          <Show when={hasFilters()}>
            <button type="button" class="btn tiny ghost" onClick={clearFilters}>Clear filters</button>
          </Show>
        </div>
      </div>

      <Show when={scopedOff()}>
        <div class="provider-off-note" role="status">
          <strong>{scopedLabel()} is switched off on the engine.</strong>
          These models are hidden from the All tab and from the SDK until it is switched on:
          <code>./freshner-update provider on {props.provider}</code>
        </div>
      </Show>

      <Show when={store.modelStatus() === 'ready'}>
        <Show when={!props.provider}>
        <div class="provider-row" role="group" aria-label="Filter by provider">
          <span class="provider-row-label">Providers</span>
          <button
            type="button"
            class="provider-chip all-chip"
            classList={{ selected: showAll() }}
            aria-pressed={showAll()}
            onClick={() => store.setSelectedProviders([])}
            title="Show every provider"
          >
            <span class="chip-led"></span>
            <span class="chip-name">All</span>
            <span class="chip-count">{store.scopedModels().length}</span>
          </button>
          <For each={allProviders()}>
            {(provider) => {
              const selected = () => selectedProviders().includes(provider);
              const count = () => store.providerCounts()[provider] || 0;
              return (
                <button
                  type="button"
                  class="provider-chip"
                  classList={{ selected: selected() }}
                  style={providerVars(store.colorFor(provider))}
                  aria-pressed={selected()}
                  data-provider={provider}
                  onClick={() => store.toggleProvider(provider)}
                  title={`${store.providerLabel(provider)} · ${count()} models`}
                >
                  <span class="chip-led"></span>
                  <span class="chip-name">{store.providerLabel(provider)}</span>
                  <span class="chip-count">{count()}</span>
                </button>
              );
            }}
          </For>
        </div>
        </Show>

        <div class="pool-controls">
          <div class="test-bar">
            <button
              type="button"
              class="btn primary test-all-btn"
              onClick={() => runTestAll()}
              disabled={testing() || store.modelStatus() !== 'ready' || store.filteredModels().length === 0}
              title="Test the models currently shown"
            >
              <Show when={testing()} fallback={<><PlayIcon size={11} /> Test all <span class="btn-count">{store.filteredModels().length}</span></>}>
                <span class="spinner"></span>
                Testing
              </Show>
            </button>

            <div
              class="progress-track"
              classList={{ active: testing() }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPercent())}
            >
              <div class="progress-fill" style={{ width: `${progressPercent()}%` }}></div>
            </div>

            <span class="test-progress-label">{progressLabel()}</span>

            <select
              class="select compact provider-test-select"
              disabled={testing() || store.modelStatus() !== 'ready'}
              aria-label="Test a single provider"
              onChange={(event) => {
                const provider = event.currentTarget.value;
                event.currentTarget.value = '';
                if (provider) runTestAll([provider]);
              }}
            >
              <option value="">Test one provider…</option>
              <For each={allProviders()}>
                {(provider) => <option value={provider}>{store.providerLabel(provider)}</option>}
              </For>
            </select>
          </div>

          <div class="toolbar">
            <label class="search-field">
              <span class="search-icon"><SearchIcon size={14} /></span>
              <input
                type="text"
                placeholder="Search id, name, provider, note…"
                value={store.searchQuery()}
                onInput={(event) => store.setSearchQuery(event.currentTarget.value)}
                aria-label="Search models"
              />
            </label>

            <div class="segmented" role="group" aria-label="Sort models">
              <For each={SORT_FIELDS}>
                {(sort) => (
                  <button
                    type="button"
                    classList={{ active: store.sortField() === sort.key }}
                    onClick={() => store.toggleSort(sort.key)}
                    title={`Sort by ${sort.label.toLowerCase()}`}
                  >
                    {sort.label}
                    <span class="sort-arrow">
                      {store.sortField() === sort.key ? (store.sortAsc() ? '↑' : '↓') : ''}
                    </span>
                  </button>
                )}
              </For>
            </div>

            <button
              type="button"
              class="switch-row"
              role="switch"
              aria-checked={store.toolsOnly()}
              onClick={() => store.setToolsOnly(!store.toolsOnly())}
              title="Show only models that support tool calling"
            >
              <span class="switch" classList={{ on: store.toolsOnly() }}>
                <span class="switch-knob"></span>
              </span>
              <span>Tools only</span>
            </button>
          </div>

          {/* Cost band. This is the filter that matters: the catalogue lists
              266 models and most are priced for someone else's budget. */}
          <div class="toolbar cost-toolbar">
            <span class="filter-label">Cost</span>
            <For each={COST_BANDS}>
              {(band) => (
                <button
                  type="button"
                  classList={{
                    'band-chip': true,
                    active: store.costBands().includes(band.key),
                  }}
                  onClick={() => store.toggleCostBand(band.key)}
                  title={band.hint}
                >
                  {band.label}
                </button>
              )}
            </For>

            <button
              type="button"
              class="switch-row"
              role="switch"
              aria-checked={store.testedWorkingOnly()}
              onClick={() => store.setTestedWorkingOnly(!store.testedWorkingOnly())}
              title="Show only models that passed a live test this session"
            >
              <span class="switch" classList={{ on: store.testedWorkingOnly() }}>
                <span class="switch-knob"></span>
              </span>
              <span>Tested working</span>
            </button>

            <button
              type="button"
              class="switch-row"
              role="switch"
              aria-checked={store.shortlistOnly()}
              onClick={() => store.setShortlistOnly(!store.shortlistOnly())}
              title="Show only models you flagged for consideration"
            >
              <span class="switch" classList={{ on: store.shortlistOnly() }}>
                <span class="switch-knob"></span>
              </span>
              <span>Shortlist</span>
            </button>
          </div>

          {/* Price window, USD per 1M tokens. 0.30 means 30 cents. */}
          <div class="toolbar price-toolbar">
            <span class="filter-label">Price / 1M</span>
            <div class="price-field" role="group" aria-label="Input price range">
              <span class="price-tag">In $</span>
              <input
                type="number" min="0" step="0.01" inputmode="decimal" placeholder="min"
                aria-label="Minimum input price per million tokens"
                value={store.priceIn().min ?? ''}
                onInput={(event) => store.setPriceIn(prev => ({ ...prev, min: parsePrice(event.currentTarget.value) }))}
              />
              <span class="price-dash">–</span>
              <input
                type="number" min="0" step="0.01" inputmode="decimal" placeholder="max"
                aria-label="Maximum input price per million tokens"
                value={store.priceIn().max ?? ''}
                onInput={(event) => store.setPriceIn(prev => ({ ...prev, max: parsePrice(event.currentTarget.value) }))}
              />
            </div>
            <div class="price-field" role="group" aria-label="Output price range">
              <span class="price-tag">Out $</span>
              <input
                type="number" min="0" step="0.01" inputmode="decimal" placeholder="min"
                aria-label="Minimum output price per million tokens"
                value={store.priceOut().min ?? ''}
                onInput={(event) => store.setPriceOut(prev => ({ ...prev, min: parsePrice(event.currentTarget.value) }))}
              />
              <span class="price-dash">–</span>
              <input
                type="number" min="0" step="0.01" inputmode="decimal" placeholder="max"
                aria-label="Maximum output price per million tokens"
                value={store.priceOut().max ?? ''}
                onInput={(event) => store.setPriceOut(prev => ({ ...prev, max: parsePrice(event.currentTarget.value) }))}
              />
            </div>
            <button
              type="button"
              class="switch-row"
              role="switch"
              aria-checked={store.includeUnpriced()}
              onClick={() => store.setIncludeUnpriced(!store.includeUnpriced())}
              title="Providers that publish no price (NVIDIA NIM, Mistral...) cannot be placed in a range"
            >
              <span class="switch" classList={{ on: store.includeUnpriced() }}>
                <span class="switch-knob"></span>
              </span>
              <span>Include unpriced</span>
            </button>
            <Show when={store.priceActive()}>
              <button type="button" class="btn tiny ghost" onClick={store.clearPriceFilters}>Clear price</button>
            </Show>
            <span class="price-hint">0.30 = 30 cents</span>
          </div>

          {/* One-click deck from measured evidence, not guesswork. */}
          <div class="toolbar pick-toolbar">
            <button
              type="button"
              class="pick-btn"
              onClick={() => store.addWorkingFreeToDeck()}
              title="Add every tested model with zero input and output price"
            >
              Add tested free models to deck
              <span class="pick-count">{store.workingModels().filter(m => costBand(m) === 'free').length}</span>
            </button>
            <Show when={store.workingModels().length > 0}>
              <span class="pick-hint">
                {store.workingModels().length} model(s) answered a test this session
              </span>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={store.modelStatus() === 'loading'}>
        <div class="loading-state">
          <span class="spinner large"></span>
          <span>Contacting the engine and loading the model catalog…</span>
        </div>
      </Show>

      <Show when={store.modelStatus() === 'error'}>
        <div class="empty-state error-state">
          <div class="empty-title">The model catalog could not be loaded</div>
          <p>{store.modelError() || 'The engine did not respond.'}</p>
          <button type="button" class="btn" onClick={() => props.onReload?.()}>
            <BoltIcon size={13} /> Retry
          </button>
        </div>
      </Show>

      <Show when={store.modelStatus() === 'ready'}>
        <div class="model-grid" classList={{ testing: testing() }} aria-busy={testing()}>
          <For each={store.filteredModels()}>
            {(model) => {
              const color = store.colorFor(model.provider);
              const label = model.providerLabel || store.providerLabel(model.provider);
              const inDeck = () => store.isInDeck(model.id, model.provider);
              const record = () => store.testResults()[testKey(model.provider, model.id)] as TestRecord | undefined;
              const cardKey = testKey(model.provider, model.id);
              const showCurl = () => showCurlFor() === cardKey;
              const showIo = () => showIoFor() === cardKey;
              const routes = () => (model.gateways && model.gateways.length > 0 ? model.gateways : [model.provider]);
              const routeTitle = () => routes().map(store.providerLabel).join(' · ');
              const displayName = () => model.name || model.id;

              const toggle = () => store.toggleModel(model);

              return (
                <div
                  class="model-card"
                  classList={{ selected: inDeck() }}
                  style={providerVars(color)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={inDeck()}
                  data-model-id={model.id}
                  data-provider={model.provider}
                  data-context={model.contextWindow || 0}
                  data-tools={model.toolsSupported ? '1' : '0'}
                  data-selected={inDeck() ? '1' : '0'}
                  title={inDeck() ? 'Click to remove from deck' : 'Click to add to deck'}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button, pre, a')) return;
                    toggle();
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggle();
                    }
                  }}
                >
                  <div class="card-top">
                    <div class="card-titles">
                      <div class="card-name">{displayName()}</div>
                      <Show when={displayName() !== model.id}>
                        <div class="card-id">{model.id}</div>
                      </Show>
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="shortlist-toggle"
                        classList={{ on: store.isShortlisted(model.provider, model.id) }}
                        aria-label={
                          store.isShortlisted(model.provider, model.id)
                            ? `Remove ${displayName()} from shortlist`
                            : `Flag ${displayName()} for consideration`
                        }
                        aria-pressed={store.isShortlisted(model.provider, model.id)}
                        title={store.isShortlisted(model.provider, model.id) ? 'Remove from shortlist' : 'Flag for consideration'}
                        onClick={(event) => {
                          event.stopPropagation();
                          store.toggleShortlist(model.provider, model.id);
                        }}
                      >
                        ★
                      </button>
                      <button
                        type="button"
                        class="select-toggle"
                        classList={{ on: inDeck() }}
                        aria-label={inDeck() ? `Remove ${displayName()} from deck` : `Add ${displayName()} to deck`}
                        aria-pressed={inDeck()}
                        onClick={(event) => { event.stopPropagation(); toggle(); }}
                      >
                        {inDeck() ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
                      </button>
                    </div>
                  </div>

                  <div class="card-badges">
                    <span class="badge badge-provider" title={routes().length > 1 ? `Routes: ${routeTitle()}` : label}>
                      {label}
                    </span>
                    {model.tier && <span class="badge badge-tier">{model.tier}</span>}
                    {model.toolsSupported && <span class="badge badge-tools">tools</span>}
                    <span
                      class={`badge badge-cost band-${costBand(model)}`}
                      title={
                        model.cacheReadPrice1m !== undefined
                          ? `Input / output per 1M. Cached input $${model.cacheReadPrice1m.toFixed(3)} per 1M.`
                          : 'Input / output per 1M tokens'
                      }
                    >
                      {formatPrice(model)}
                    </span>
                    {model.contextWindow && (
                      <span class="badge badge-context" title={`Context window: ${model.contextWindow.toLocaleString()} tokens`}>
                        ctx {formatNumber(model.contextWindow)}
                      </span>
                    )}
                    {model.maxCompletionTokens && (
                      <span class="badge badge-context" title={`Max output: ${model.maxCompletionTokens.toLocaleString()} tokens`}>
                        out {formatNumber(model.maxCompletionTokens)}
                      </span>
                    )}
                    {(model.rpm || model.rpd) && (
                      <span class="badge badge-context" title="Provider rate limit on this model">
                        {[model.rpm ? `${model.rpm}/min` : '', model.rpd ? `${model.rpd}/day` : ''].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {model.kind && model.kind !== 'chat' && <span class="badge badge-tier">{model.kind}</span>}
                    {routes().length > 1 && (
                      <span class="badge badge-routes" title={routeTitle()}>
                        {routes().length} routes
                      </span>
                    )}
                  </div>

                  <Show when={inDeck()}>
                    <div class="in-deck-flag">
                      <CheckIcon size={10} />
                      In deck
                    </div>
                  </Show>

                  <Show when={record()}>
                    {(current) => (
                      <div class={`test-status ${current().status}`}>
                        <span class="status-led"></span>
                        <span class="test-message" title={current().error || undefined}>
                          {current().status === 'pending'
                            ? 'Testing…'
                            : current().status === 'success'
                              ? 'OK'
                              : `Failed${current().error ? ` — ${current().error}` : ''}`}
                        </span>
                        <Show when={current().durationMs !== null}>
                          <span class="test-time">{current().durationMs} ms</span>
                        </Show>
                      </div>
                    )}
                  </Show>

                  <div class="card-actions">
                    <button
                      type="button"
                      class="btn btn-test"
                      onClick={() => runSingleTest(model)}
                      disabled={record()?.status === 'pending'}
                      title="Send a small chat completion request"
                    >
                      <PlayIcon size={9} />
                      {record()?.status === 'pending' ? 'Testing' : 'Test'}
                    </button>
                    <button
                      type="button"
                      class="btn btn-io"
                      onClick={() => setShowIoFor(showIo() ? null : cardKey)}
                      disabled={!record()?.responseBody}
                      title="View the raw request and response"
                    >
                      <EyeIcon size={10} />
                      {showIo() ? 'Hide' : 'I/O'}
                    </button>
                    <button
                      type="button"
                      class="btn btn-curl"
                      onClick={() => setShowCurlFor(showCurl() ? null : cardKey)}
                      title="Show a ready-to-run curl command"
                    >
                      <CodeIcon size={10} />
                      {showCurl() ? 'Hide' : 'Curl'}
                    </button>
                  </div>

                  <Show when={showIo() ? record() : undefined}>
                    {(current) => (
                      <div class="io-viewer">
                        <div class="io-section">
                          <div class="io-label">REQUEST</div>
                          <pre>{JSON.stringify(current().requestBody, null, 2)}</pre>
                        </div>
                        <div class="io-section">
                          <div class="io-label">RESPONSE</div>
                          <pre>{current().responseBody ? JSON.stringify(current().responseBody, null, 2) : current().error || 'No response'}</pre>
                        </div>
                        <button
                          type="button"
                          class="btn tiny copy-btn"
                          onClick={() => {
                            const text = `=== REQUEST ===\n${JSON.stringify(current().requestBody, null, 2)}\n\n=== RESPONSE ===\n${current().responseBody ? JSON.stringify(current().responseBody, null, 2) : current().error}`;
                            navigator.clipboard.writeText(text);
                            store.showToast('Request and response copied');
                          }}
                        >
                          <CopyIcon size={10} /> Copy all
                        </button>
                      </div>
                    )}
                  </Show>

                  <Show when={showCurl()}>
                    <div class="curl-code-section">
                      <pre>{buildCurl(model, 'YOUR_API_KEY')}</pre>
                      <button
                        type="button"
                        class="btn tiny copy-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(buildCurl(model, 'YOUR_API_KEY'));
                          store.showToast('Curl command copied');
                        }}
                      >
                        <CopyIcon size={10} /> Copy
                      </button>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        <Show when={store.filteredModels().length === 0}>
          <div class="empty-state">
            <div class="empty-title">
              {store.scopedModels().length === 0 ? (props.provider ? 'This provider has no models' : 'The engine returned no models') : 'No models match these filters'}
            </div>
            <p>
              {store.scopedModels().length === 0
                ? 'Check the engine URL and reload the catalog.'
                : 'Try a broader search, a wider price range, or turn off “Tools only”.'}
            </p>
            <Show
              when={store.scopedModels().length === 0}
              fallback={
                <Show when={hasFilters()}>
                  <button type="button" class="btn" onClick={clearFilters}>Clear filters</button>
                </Show>
              }
            >
              <button type="button" class="btn" onClick={() => props.onReload?.()}>
                <BoltIcon size={13} /> Reload catalog
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </section>
  );
}
