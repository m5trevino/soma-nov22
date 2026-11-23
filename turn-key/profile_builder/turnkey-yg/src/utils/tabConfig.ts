import type { ModelEntry } from '../types';

/**
 * Loader for the resolved tab config produced by the freshner skill.
 *
 * The config is authoritative: it already carries the models each tab should
 * show, so nothing here filters, applies price bands, or knows what
 * `pricing.known` means. That is the point — one place owns filter semantics
 * and it is not the builder.
 *
 * Routes are collapsed to models. A model served by four gateways is one card
 * with four routes, because a deck entry for `openai/gpt-oss-120b` should not
 * appear four times.
 */

export interface TabModel extends ModelEntry {
  /** Stable key for this model across routes. */
  modelKey: string;
  /** True when this route answered a live smoke test. */
  verified?: boolean;
}

export interface TabDefinition {
  id: string;
  label: string;
  order: number;
  description: string;
  sort: { by: string; order: 'asc' | 'desc' };
  declaredCount: number;
  models: TabModel[];
}

export interface TabConfig {
  configVersion: number;
  kind: string;
  name: string;
  description: string;
  generatedAt: string;
  source: {
    endpoint?: string;
    catalogGenerated?: string;
    catalogHash?: string;
    catalogModelCount?: number;
  };
  totals: { tabs: number; uniqueModels: number; catalogModels: number };
  tabs: TabDefinition[];
  /** Flattened, ordered model list for the first tab. */
  defaultTabId: string;
}

export class TabConfigError extends Error {
  constructor(readonly path: string, message: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'TabConfigError';
  }
}

interface RawEntry {
  route: string;
  id: string;
  name?: string;
  provider: string;
  providerLabel?: string;
  gateways?: string[];
  modelKey?: string;
  tier?: string;
  toolsSupported?: boolean;
  contextWindow?: number;
  maxCompletionTokens?: number;
  status?: string;
  freeKind?: string;
  inputPrice1m?: number | null;
  outputPrice1m?: number | null;
  cacheReadPrice1m?: number | null;
  priceKnown?: boolean;
  reasoning?: boolean;
  verified?: boolean;
  note?: string | null;
}

function fail(path: string, message: string): never {
  throw new TabConfigError(path, message);
}

function isObject(v: unknown): v is Record<string, any> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Cheapest route wins, matching how the engine collapses duplicates. */
function priceKey(e: RawEntry): number {
  const i = e.inputPrice1m ?? 0;
  const o = e.outputPrice1m ?? 0;
  return i + o;
}

/**
 * Collapse entries sharing an `id` into one model.
 *
 * The surviving `provider` is the cheapest route, and every route that serves
 * the model is preserved in `gateways` so the UI can show the count.
 */
function collapse(entries: RawEntry[]): TabModel[] {
  const byId = new Map<string, TabModel>();

  for (const entry of entries) {
    const existing = byId.get(entry.id);
    const routes = new Set<string>(
      entry.gateways && entry.gateways.length > 0 ? entry.gateways : [entry.provider],
    );

    if (!existing) {
      byId.set(entry.id, {
        id: entry.id,
        name: entry.name || entry.id,
        provider: entry.provider,
        providerLabel: entry.providerLabel,
        gateways: Array.from(routes),
        modelKey: entry.modelKey || entry.id,
        tier: entry.tier,
        toolsSupported: entry.toolsSupported,
        contextWindow: entry.contextWindow,
        maxCompletionTokens: entry.maxCompletionTokens,
        status: entry.status,
        inputPrice1m: entry.inputPrice1m ?? undefined,
        outputPrice1m: entry.outputPrice1m ?? undefined,
        cacheReadPrice1m: entry.cacheReadPrice1m ?? undefined,
        note: entry.note ?? undefined,
        verified: entry.verified,
      } as TabModel);
      continue;
    }

    for (const route of routes) existing.gateways!.push(route);
    // Same model on another provider: keep the cheaper published price, because
    // that is the route a rotation deck should prefer.
    if (priceKey(entry) < priceKey(existing as unknown as RawEntry)) {
      existing.provider = entry.provider;
      existing.providerLabel = entry.providerLabel;
      existing.inputPrice1m = entry.inputPrice1m ?? undefined;
      existing.outputPrice1m = entry.outputPrice1m ?? undefined;
      existing.cacheReadPrice1m = entry.cacheReadPrice1m ?? undefined;
    }
    // Capabilities and limits take the best available across routes.
    existing.toolsSupported = Boolean(existing.toolsSupported || entry.toolsSupported);
    existing.contextWindow = Math.max(existing.contextWindow || 0, entry.contextWindow || 0) || undefined;
    existing.maxCompletionTokens = Math.max(
      existing.maxCompletionTokens || 0, entry.maxCompletionTokens || 0,
    ) || undefined;
    if (entry.verified) existing.verified = true;
    if (!existing.tier && entry.tier) existing.tier = entry.tier;
  }

  for (const model of byId.values()) {
    model.gateways = Array.from(new Set(model.gateways)).sort((a, b) => a.localeCompare(b));
    if (model.provider && !model.gateways.includes(model.provider)) {
      model.gateways.push(model.provider);
      model.gateways.sort((a, b) => a.localeCompare(b));
    }
  }

  return Array.from(byId.values());
}

function sortModels(models: TabModel[], sort: { by: string; order: string }): TabModel[] {
  const direction = sort.order === 'desc' ? -1 : 1;
  const sorted = [...models];

  if (sort.by === 'cost') {
    sorted.sort((a, b) => {
      const ca = (a.inputPrice1m ?? 0) + (a.outputPrice1m ?? 0);
      const cb = (b.inputPrice1m ?? 0) + (b.outputPrice1m ?? 0);
      return (ca - cb) * direction || a.id.localeCompare(b.id);
    });
  } else if (sort.by === 'context') {
    sorted.sort((a, b) => ((a.contextWindow ?? 0) - (b.contextWindow ?? 0)) * direction
      || a.id.localeCompare(b.id));
  } else if (sort.by === 'provider') {
    sorted.sort((a, b) => a.provider.localeCompare(b.provider) * direction
      || a.id.localeCompare(b.id));
  } else {
    sorted.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id) * direction);
  }

  return sorted;
}

export function loadTabConfig(raw: unknown): TabConfig {
  if (!isObject(raw)) fail('', 'config must be a JSON object');
  if (raw.kind !== 'turnkey-tab-config') {
    fail('kind', `expected "turnkey-tab-config", got ${JSON.stringify(raw.kind)}`);
  }
  if (!Array.isArray(raw.tabs) || raw.tabs.length === 0) {
    fail('tabs', 'must be a non-empty array');
  }
  if (!isObject(raw.models)) {
    fail('models', 'must be an object keyed by route');
  }

  const modelIndex = raw.models as Record<string, RawEntry>;

  // Every route referenced by a tab must resolve. A dangling route means the
  // file was hand-edited or truncated, and rendering it would show a hole.
  const seenTabIds = new Set<string>();
  const tabs: TabDefinition[] = raw.tabs.map((tab: any, index: number) => {
    const at = `tabs[${index}]`;
    if (!isObject(tab)) fail(at, 'must be an object');
    if (typeof tab.id !== 'string' || !tab.id.trim()) fail(`${at}.id`, 'must be a non-empty string');
    if (seenTabIds.has(tab.id)) fail(`${at}.id`, `duplicate tab "${tab.id}"`);
    seenTabIds.add(tab.id);
    if (typeof tab.label !== 'string' || !tab.label.trim()) {
      fail(`${at}.label`, 'must be a non-empty string');
    }
    if (!Array.isArray(tab.routes)) fail(`${at}.routes`, 'must be an array of route strings');

    const entries: RawEntry[] = [];
    for (const route of tab.routes) {
      if (typeof route !== 'string') fail(`${at}.routes`, 'every route must be a string');
      const entry = modelIndex[route];
      if (!entry) fail(`${at}.routes`, `route "${route}" is not present in models`);
      entries.push(entry);
    }

    const models = sortModels(collapse(entries), tab.sort || { by: 'name', order: 'asc' });

    return {
      id: tab.id,
      label: tab.label,
      order: typeof tab.order === 'number' ? tab.order : index,
      description: typeof tab.description === 'string' ? tab.description : '',
      sort: {
        by: typeof tab.sort?.by === 'string' ? tab.sort.by : 'name',
        order: tab.sort?.order === 'desc' ? 'desc' : 'asc',
      },
      declaredCount: typeof tab.modelCount === 'number' ? tab.modelCount : tab.routes.length,
      models,
    };
  });

  tabs.sort((a, b) => a.order - b.order);

  return {
    configVersion: typeof raw.configVersion === 'number' ? raw.configVersion : 1,
    kind: raw.kind,
    name: typeof raw.name === 'string' ? raw.name : 'turnkey-yg',
    description: typeof raw.description === 'string' ? raw.description : '',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
    source: isObject(raw.source) ? raw.source : {},
    totals: isObject(raw.totals)
      ? {
          tabs: tabs.length,
          uniqueModels: typeof raw.totals.uniqueModels === 'number' ? raw.totals.uniqueModels : 0,
          catalogModels: typeof raw.totals.catalogModels === 'number' ? raw.totals.catalogModels : 0,
        }
      : { tabs: tabs.length, uniqueModels: 0, catalogModels: 0 },
    tabs,
    defaultTabId: tabs[0].id,
  };
}
