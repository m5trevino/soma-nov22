import { createSignal, createMemo, createRoot } from 'solid-js';
import type { ModelEntry, DeckCard, TestRecord, CostBand } from '../types';
import { uid, costBand } from '../types';
import { buildProviderColorMap, providerColor as fallbackProviderColor } from '../utils/providerColors';

export type ModelStatus = 'loading' | 'ready' | 'error';
export type ProviderMeta = Record<string, { label?: string; enabled?: boolean; visible?: boolean }>;

export function prettyProvider(provider: string): string {
  if (!provider || provider === 'unknown') return 'Unknown';
  return provider
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, c => c.toUpperCase());
}

/** Every route key that can serve a model. */
export function modelProviders(model: ModelEntry): string[] {
  const routes = (model.gateways && model.gateways.length > 0)
    ? model.gateways
    : [model.provider];
  return Array.from(new Set(routes.filter(Boolean)));
}

const store = createRoot(() => {
  const [availableModels, setAvailableModels] = createSignal<ModelEntry[]>([]);
  const [deck, setDeck] = createSignal<DeckCard[]>([]);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedProviders, setSelectedProviders] = createSignal<string[]>([]);
  const [toolsOnly, setToolsOnly] = createSignal(false);
  /** Empty means "every price band". Non-empty is an allow-list. */
  const [costBands, setCostBands] = createSignal<CostBand[]>([]);
  /** Only models whose last test returned success. */
  const [testedWorkingOnly, setTestedWorkingOnly] = createSignal(false);
  /** Fold the model list down to the shortlist before anything else runs. */
  const [shortlistOnly, setShortlistOnly] = createSignal(false);
  /** Models the operator flagged as candidates, independent of the deck. */
  const [shortlist, setShortlist] = createSignal<string[]>([]);
  const [sortField, setSortField] = createSignal<string>('name');
  const [sortAsc, setSortAsc] = createSignal(true);
  const [testResults, setTestResults] = createSignal<Record<string, TestRecord>>({});
  const [toastMsg, setToastMsg] = createSignal('');
  const [providerMeta, setProviderMeta] = createSignal<ProviderMeta>({});
  const [modelStatus, setModelStatus] = createSignal<ModelStatus>('loading');
  const [modelError, setModelError] = createSignal('');

  const providers = createMemo(() => {
    const set = new Set<string>();
    for (const model of availableModels()) {
      for (const route of modelProviders(model)) {
        if (route && route !== 'unknown') set.add(route);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  /** A single colour map shared by every provider-coloured surface. */
  const providerColorMap = createMemo(() => {
    // Available providers keep stable swatches; deck-only providers (for
    // example from an imported profile) are appended without shifting them.
    const keys = [...providers()];
    const known = new Set(keys);
    for (const card of deck()) {
      if (!card.provider || card.provider === 'unknown' || known.has(card.provider)) continue;
      known.add(card.provider);
      keys.push(card.provider);
    }
    return buildProviderColorMap(keys);
  });

  const colorFor = (provider: string): string => providerColorMap()[provider] || fallbackProviderColor(provider);

  const providerLabel = (provider: string): string => {
    const meta = providerMeta()[provider];
    if (meta?.label) return meta.label;
    return prettyProvider(provider);
  };

  const providerCounts = createMemo(() => {
    const counts: Record<string, number> = {};
    for (const model of availableModels()) {
      for (const route of modelProviders(model)) {
        counts[route] = (counts[route] || 0) + 1;
      }
    }
    return counts;
  });

  const filteredModels = createMemo(() => {
    let list = availableModels();
    const query = searchQuery().trim().toLowerCase();

    if (query) {
      list = list.filter(model => {
        const haystack = [
          model.id,
          model.name,
          model.provider,
          model.providerLabel,
          model.note,
          ...(model.gateways || []),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    const selected = selectedProviders();
    if (selected.length > 0) {
      list = list.filter(model => modelProviders(model).some(route => selected.includes(route)));
    }

    if (toolsOnly()) {
      list = list.filter(model => model.toolsSupported);
    }

    const bands = costBands();
    if (bands.length > 0) {
      list = list.filter(model => bands.includes(costBand(model)));
    }

    if (testedWorkingOnly()) {
      const results = testResults();
      list = list.filter(model => results[model.id]?.status === 'success');
    }

    if (shortlistOnly()) {
      const kept = new Set(shortlist());
      list = list.filter(model => kept.has(model.id));
    }

    const field = sortField();
    const asc = sortAsc();
    const direction = asc ? 1 : -1;

    list = [...list].sort((a, b) => {
      let av: string | number;
      let bv: string | number;

      switch (field) {
        case 'provider':
          av = providerLabel(a.provider).toLowerCase();
          bv = providerLabel(b.provider).toLowerCase();
          break;
        case 'context':
          // Unknown context windows always sort last, in either direction.
          if (!a.contextWindow && !b.contextWindow) {
            av = 0;
            bv = 0;
            break;
          }
          if (!a.contextWindow) return 1;
          if (!b.contextWindow) return -1;
          av = a.contextWindow;
          bv = b.contextWindow;
          break;
        case 'cost': {
          // Cheapest first. A model with no reported price sorts last rather
          // than pretending to be free.
          const rank: Record<CostBand, number> = {
            free: 0, cheap: 1, moderate: 2, expensive: 3, unknown: 4,
          };
          av = rank[costBand(a)];
          bv = rank[costBand(b)];
          // Break ties within a band by actual input price.
          if (av === bv) {
            av = a.inputPrice1m ?? Number.POSITIVE_INFINITY;
            bv = b.inputPrice1m ?? Number.POSITIVE_INFINITY;
          }
          break;
        }
        case 'tools':
          av = a.toolsSupported ? 1 : 0;
          bv = b.toolsSupported ? 1 : 0;
          break;
        default:
          av = (a.name || a.id).toLowerCase();
          bv = (b.name || b.id).toLowerCase();
      }

      if (av < bv) return -direction;
      if (av > bv) return direction;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });

    return list;
  });

  const testSummary = createMemo(() => {
    let success = 0;
    let failed = 0;
    let pending = 0;
    for (const record of Object.values(testResults())) {
      if (record.status === 'success') success++;
      else if (record.status === 'failed') failed++;
      else pending++;
    }
    return { success, failed, pending, total: success + failed + pending };
  });

  const selectedCount = createMemo(() => deck().length);

  function toggleProvider(provider: string) {
    setSelectedProviders(prev =>
      prev.includes(provider) ? prev.filter(item => item !== provider) : [...prev, provider]
    );
  }

  function toggleSort(field: string) {
    if (sortField() === field) {
      setSortAsc(value => !value);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast(message: string) {
    setToastMsg(message);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToastMsg(''), 2800);
  }

  function isInDeck(modelId: string): boolean {
    return deck().some(card => card.modelId === modelId);
  }

  function addToDeck(model: ModelEntry) {
    if (isInDeck(model.id)) return;
    const card: DeckCard = {
      uid: uid(),
      modelId: model.id,
      modelName: model.name || model.id,
      provider: model.provider,
      providerLabel: model.providerLabel || providerLabel(model.provider),
      tier: model.tier,
    };
    setDeck(prev => [...prev, card]);
    showToast(`${card.modelName} added to deck · ${deck().length} selected`);
  }

  function removeFromDeck(cardUid: string) {
    const card = deck().find(item => item.uid === cardUid);
    setDeck(prev => prev.filter(item => item.uid !== cardUid));
    if (card) showToast(`${card.modelName} removed from deck`);
  }

  function toggleModel(model: ModelEntry) {
    const existing = deck().find(card => card.modelId === model.id);
    if (existing) removeFromDeck(existing.uid);
    else addToDeck(model);
  }

  function clearDeck() {
    const count = deck().length;
    setDeck([]);
    if (count > 0) showToast(`Deck cleared · ${count} models removed`);
  }

  function moveInDeck(fromIdx: number, toIdx: number) {
    setDeck(prev => {
      if (fromIdx < 0 || fromIdx >= prev.length) return prev;
      if (toIdx < 0 || toIdx >= prev.length) return prev;
      const next = [...prev];
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      return next;
    });
  }

  function setTestRecord(modelId: string, record: TestRecord) {
    setTestResults(prev => ({ ...prev, [modelId]: record }));
  }

  function toggleCostBand(band: CostBand) {
    setCostBands(prev =>
      prev.includes(band) ? prev.filter(b => b !== band) : [...prev, band]
    );
  }

  function isShortlisted(modelId: string): boolean {
    return shortlist().includes(modelId);
  }

  function toggleShortlist(modelId: string) {
    setShortlist(prev =>
      prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]
    );
  }

  function clearShortlist() {
    const count = shortlist().length;
    setShortlist([]);
    if (count > 0) showToast(`Shortlist cleared · ${count} removed`);
  }

  /**
   * The models that actually survived a live test, cheapest first.
   *
   * This is the answer to "which models will work" — not the catalogue, which
   * says what exists, but the subset the engine has answered for. Free models
   * lead, then by measured latency, because a slow free model still stalls a
   * rotation deck.
   */
  const workingModels = createMemo(() => {
    const results = testResults();
    const models = availableModels().filter(m => results[m.id]?.status === 'success');
    const bandRank: Record<CostBand, number> = {
      free: 0, cheap: 1, moderate: 2, expensive: 3, unknown: 4,
    };
    return [...models].sort((a, b) => {
      const band = bandRank[costBand(a)] - bandRank[costBand(b)];
      if (band !== 0) return band;
      const ad = results[a.id]?.durationMs ?? Infinity;
      const bd = results[b.id]?.durationMs ?? Infinity;
      if (ad !== bd) return ad - bd;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
  });

  /** Push every model that passed its test and is free into the deck. */
  function addWorkingFreeToDeck() {
    let added = 0;
    for (const model of workingModels()) {
      if (costBand(model) !== 'free') continue;
      if (isInDeck(model.id)) continue;
      addToDeck(model);
      added++;
    }
    if (added === 0) showToast('No tested free models to add');
  }

  return {
    availableModels, setAvailableModels,
    deck, setDeck,
    searchQuery, setSearchQuery,
    selectedProviders, setSelectedProviders,
    toolsOnly, setToolsOnly,
    costBands, setCostBands, toggleCostBand,
    testedWorkingOnly, setTestedWorkingOnly,
    shortlistOnly, setShortlistOnly,
    shortlist, setShortlist, isShortlisted, toggleShortlist, clearShortlist,
    workingModels, addWorkingFreeToDeck,
    sortField, sortAsc, toggleSort,
    testResults, setTestResults, setTestRecord, testSummary,
    toastMsg, showToast,
    providerMeta, setProviderMeta,
    modelStatus, setModelStatus, modelError, setModelError,
    providers, providerCounts, filteredModels,
    providerColorMap, colorFor, providerLabel,
    toggleProvider,
    addToDeck, removeFromDeck, toggleModel, clearDeck, isInDeck, moveInDeck,
    selectedCount,
  };
});

export function useDeckStore() {
  return store;
}
