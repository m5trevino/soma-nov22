export interface TestRecord {
  status: 'pending' | 'success' | 'failed';
  requestBody: any;
  responseBody: any | null;
  error: string | null;
  durationMs: number | null;
}

export interface ModelEntry {
  id: string;
  name: string;
  /** Route key used by the engine (groq, openrouter, ollama, ...). */
  provider: string;
  /** Friendly label supplied by the engine's provider metadata. */
  providerLabel?: string;
  /** Every route that can serve this model id. */
  gateways?: string[];
  tier?: string;
  toolsSupported?: boolean;
  contextWindow?: number;
  maxCompletionTokens?: number;
  note?: string;
  status?: string;
  /** USD per 1M input tokens. 0 means free. Undefined means the engine did not report it. */
  inputPrice1m?: number;
  /** USD per 1M output tokens. */
  outputPrice1m?: number;
  /** USD per 1M cached input tokens — the bill that matters for a repeated prefix. */
  cacheReadPrice1m?: number;
  /** Provider rate limits where the engine knows them (free-tier docs). */
  rpm?: number;
  rpd?: number;
  /** chat, image, audio, embedding... as reported by the provider. */
  kind?: string;
}

/** Inclusive price range in USD per 1M tokens. An absent bound is open. */
export interface PriceRange {
  min?: number;
  max?: number;
}

/**
 * Cost band for a model.
 *
 * `free`      — both directions are zero; safe to leave in a rotation deck.
 * `cheap`     — input at or under $0.15/1M, the DeepSeek-Flash band.
 * `moderate`  — priced but under $1/1M input.
 * `expensive` — above that; a deliberate choice, not a default.
 * `unknown`   — the engine reported no price.
 */
export type CostBand = 'free' | 'cheap' | 'moderate' | 'expensive' | 'unknown';

export function costBand(model: ModelEntry): CostBand {
  const inp = model.inputPrice1m;
  const out = model.outputPrice1m;
  if (inp === undefined && out === undefined) return 'unknown';
  if ((inp ?? 0) === 0 && (out ?? 0) === 0) return 'free';
  if ((inp ?? Infinity) <= 0.15) return 'cheap';
  if ((inp ?? Infinity) <= 1) return 'moderate';
  return 'expensive';
}

/** Both directions zero. A model with a free input but paid output is not free. */
export function isFree(model: ModelEntry): boolean {
  return costBand(model) === 'free';
}

export interface DeckCard {
  uid: string;
  modelId: string;
  modelName: string;
  provider: string;
  providerLabel?: string;
  tier?: string;
  /** Every route that can serve this model. Absent on cards built before this
   *  field existed, so treat a missing value as "just `provider`". */
  gateways?: string[];
  /** True when this route answered a live smoke test. */
  verified?: boolean;
}

export interface StagePin {
  stageName: string;
  pinnedModels: string[];
  useDeck: boolean;
}

export interface PipelineConfig {
  mode: 'sequential' | 'parallel';
  workers: number;
  timeout: number;
  maxRetries: number;
  engineUrl?: string;
}

export interface TurnKeyProfile {
  version: string;
  name: string;
  description: string;
  deck: DeckCard[];
  stages: StagePin[];
  pipeline: PipelineConfig;
}

export function createEmptyProfile(): TurnKeyProfile {
  return {
    version: '1.0.0',
    name: '',
    description: '',
    deck: [],
    stages: [],
    pipeline: {
      mode: 'sequential',
      workers: 1,
      timeout: 180,
      maxRetries: 10,
    },
  };
}

let _uid = 0;
export function uid(): string {
  return `card-${++_uid}-${Date.now()}`;
}
