import type { DeckCard, StagePin, PipelineConfig } from '../types';

/**
 * Runtime validation for an imported profile.
 *
 * `as TurnKeyProfile` on the parse result is a compile-time assertion only, so
 * without this a malformed file loads and misbehaves later: a card with no
 * `uid` makes every card share `uid: undefined`, so removing one removes the
 * first; a stage with `useDeck: false` and no pins runs and finds no models.
 * Both are silent. This turns them into a message the user can act on.
 *
 * Scope is deliberately narrow: structure only. Whether a `modelId` still
 * exists on the engine needs the catalog and belongs in a separate action.
 */

export interface ValidatedProfile {
  version: string;
  name: string;
  description: string;
  deck: DeckCard[];
  stages: StagePin[];
  pipeline: PipelineConfig;
}

/** Carries the offending path so the message says where to look. */
export class ProfileValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'ProfileValidationError';
  }
}

const STAGE_MODES = new Set(['sequential', 'parallel']);

function fail(path: string, message: string): never {
  throw new ProfileValidationError(path, message);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateProfile(raw: unknown): ValidatedProfile {
  if (!isPlainObject(raw)) {
    fail('', 'file must contain a JSON object');
  }
  const doc = raw as Record<string, any>;

  // ---- deck -------------------------------------------------------------
  if (!Array.isArray(doc.deck)) {
    fail('deck', doc.deck === undefined ? 'missing' : 'must be an array');
  }

  const seenUids = new Set<string>();
  const seenModelIds = new Set<string>();

  const deck: DeckCard[] = doc.deck.map((card: any, index: number) => {
    const at = `deck[${index}]`;
    if (!isPlainObject(card)) {
      fail(at, 'must be an object');
    }
    if (typeof card.modelId !== 'string' || !card.modelId.trim()) {
      fail(`${at}.modelId`, 'must be a non-empty string');
    }
    if (typeof card.uid !== 'string' || !card.uid.trim()) {
      fail(`${at}.uid`, 'must be a non-empty string');
    }
    if (seenUids.has(card.uid)) {
      fail(`${at}.uid`, `duplicate "${card.uid}"`);
    }
    if (seenModelIds.has(card.modelId)) {
      fail(`${at}.modelId`, `duplicate model "${card.modelId}"`);
    }
    if (typeof card.provider !== 'string' || !card.provider.trim()) {
      fail(`${at}.provider`, 'must be a non-empty string');
    }
    if (card.gateways !== undefined) {
      if (!Array.isArray(card.gateways)
          || card.gateways.some((route: any) => typeof route !== 'string')) {
        fail(`${at}.gateways`, 'must be an array of strings when present');
      }
      // The schema requires the card's own provider to be among its gateways.
      if (!card.gateways.includes(card.provider)) {
        fail(`${at}.gateways`, `must include the card's provider "${card.provider}"`);
      }
    }
    if (card.verified !== undefined && typeof card.verified !== 'boolean') {
      fail(`${at}.verified`, 'must be a boolean when present');
    }

    // ---- pricing -------------------------------------------------------
    // v1.0.0 configs carry a pricing block on every card. A null price means
    // the provider published none; it must never be read as zero.
    let pricing: DeckCard['pricing'];
    if (card.pricing !== undefined) {
      if (!isPlainObject(card.pricing)) {
        fail(`${at}.pricing`, 'must be an object when present');
      }
      const p = card.pricing;
      for (const key of ['input_1m', 'output_1m', 'cache_read_1m'] as const) {
        if (p[key] === undefined) continue;
        if (p[key] !== null && (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < 0)) {
          fail(`${at}.pricing.${key}`,
            `must be a non-negative number or null, got ${JSON.stringify(p[key])}`);
        }
      }
      if (typeof p.known !== 'boolean') {
        fail(`${at}.pricing.known`, 'must be a boolean');
      }
      pricing = {
        input_1m: p.input_1m ?? null,
        output_1m: p.output_1m ?? null,
        cache_read_1m: p.cache_read_1m ?? null,
        known: p.known,
      };
      if (p.free_kind !== undefined) pricing.free_kind = p.free_kind ?? null;
    }

    // ---- free / free_label ---------------------------------------------
    if (card.free !== undefined && typeof card.free !== 'boolean') {
      fail(`${at}.free`, 'must be a boolean when present');
    }
    if (card.free_label !== undefined
        && card.free_label !== null && typeof card.free_label !== 'string') {
      fail(`${at}.free_label`, 'must be a string or null');
    }
    // The schema enforces this pairing, so a card cannot claim FREE without
    // being priced at zero on both directions and not cloud-billed.
    if (card.free === true) {
      if (!pricing) fail(`${at}.pricing`, 'required when free is true');
      if (pricing.known !== true) {
        fail(`${at}.free`, 'cannot be true when pricing.known is false');
      }
      if (pricing.input_1m !== 0 || pricing.output_1m !== 0) {
        fail(`${at}.free`,
          `cannot be true when prices are ${pricing.input_1m}/${pricing.output_1m}`);
      }
      if (pricing.free_kind === 'cloud') {
        fail(`${at}.free`, 'cannot be true for a cloud subscription model');
      }
      if (card.free_label !== 'FREE') {
        fail(`${at}.free_label`, 'must be "FREE" when free is true');
      }
    } else if (card.free === false && card.free_label !== null && card.free_label !== undefined) {
      fail(`${at}.free_label`, 'must be null when free is false');
    }

    // ---- limits and capabilities ---------------------------------------
    for (const key of ['context', 'max_output'] as const) {
      if (card[key] === undefined) continue;
      if (card[key] !== null
          && (typeof card[key] !== 'number' || !Number.isInteger(card[key]) || card[key] < 0)) {
        fail(`${at}.${key}`, `must be a non-negative integer or null, got ${JSON.stringify(card[key])}`);
      }
    }
    if (card.capabilities !== undefined && !isPlainObject(card.capabilities)) {
      fail(`${at}.capabilities`, 'must be an object when present');
    }
    if (isPlainObject(card.capabilities)) {
      for (const [key, value] of Object.entries(card.capabilities)) {
        if (typeof value !== 'boolean') {
          fail(`${at}.capabilities.${key}`, 'must be a boolean');
        }
      }
    }

    seenUids.add(card.uid);
    seenModelIds.add(card.modelId);

    const validated: DeckCard = {
      uid: card.uid,
      modelId: card.modelId,
      modelName: typeof card.modelName === 'string' && card.modelName.trim()
        ? card.modelName
        : card.modelId,
      provider: card.provider,
      providerLabel: typeof card.providerLabel === 'string' ? card.providerLabel : undefined,
      tier: typeof card.tier === 'string' ? card.tier : undefined,
    };
    // Preserved rather than dropped, so a load-then-export round trip does not
    // silently lose what the generator wrote. The config's schema marks these
    // required, so dropping them would produce a file that fails validation.
    if (Array.isArray(card.gateways)) validated.gateways = [...card.gateways];
    if (typeof card.verified === 'boolean') validated.verified = card.verified;
    if (pricing) validated.pricing = pricing;
    if (typeof card.free === 'boolean') validated.free = card.free;
    if (card.free_label !== undefined) validated.free_label = card.free_label ?? null;
    if (card.context !== undefined) validated.context = card.context ?? null;
    if (card.max_output !== undefined) validated.max_output = card.max_output ?? null;
    if (isPlainObject(card.capabilities)) {
      validated.capabilities = { ...card.capabilities };
    }
    return validated;
  });

  // ---- stages -----------------------------------------------------------
  if (!Array.isArray(doc.stages)) {
    fail('stages', doc.stages === undefined
      ? 'missing'
      : 'must be an array of stage objects');
  }

  const seenStages = new Set<string>();

  const stages: StagePin[] = doc.stages.map((stage: any, index: number) => {
    const at = `stages[${index}]`;
    if (!isPlainObject(stage)) {
      fail(at, 'must be an object');
    }
    if (typeof stage.stageName !== 'string' || !stage.stageName.trim()) {
      fail(`${at}.stageName`, 'must be a non-empty string');
    }
    if (seenStages.has(stage.stageName)) {
      fail(`${at}.stageName`, `duplicate stage "${stage.stageName}"`);
    }
    if (!Array.isArray(stage.pinnedModels)
        || stage.pinnedModels.some((model: any) => typeof model !== 'string')) {
      fail(`${at}.pinnedModels`, 'must be an array of model ids');
    }
    if (typeof stage.useDeck !== 'boolean') {
      fail(`${at}.useDeck`, 'must be a boolean');
    }
    // The UI treats useDeck as the switch and ignores pins when it is true, so
    // a stage with both is pinned only in the user's imagination.
    if (stage.useDeck && stage.pinnedModels.length > 0) {
      fail(at, `stage "${stage.stageName}" sets useDeck true and also pins `
        + `${stage.pinnedModels.length} model(s); the pins would be ignored`);
    }
    // Valid but useless: the stage runs and finds nothing to call.
    if (!stage.useDeck && stage.pinnedModels.length === 0) {
      fail(at, `stage "${stage.stageName}" ignores the deck but pins nothing; `
        + 'it would run with no models');
    }

    seenStages.add(stage.stageName);
    return {
      stageName: stage.stageName,
      pinnedModels: [...stage.pinnedModels],
      useDeck: stage.useDeck,
    };
  });

  // ---- pipeline ---------------------------------------------------------
  const src = doc.pipeline;
  if (!isPlainObject(src)) {
    fail('pipeline', doc.pipeline === undefined ? 'missing' : 'must be an object');
  }
  if (!STAGE_MODES.has(src.mode)) {
    fail('pipeline.mode',
      `must be "sequential" or "parallel", got ${JSON.stringify(src.mode)}`);
  }
  for (const key of ['workers', 'timeout', 'maxRetries'] as const) {
    const value = src[key];
    if (typeof value !== 'number' || !Number.isFinite(value)
        || !Number.isInteger(value) || value < 1) {
      fail(`pipeline.${key}`, `must be a positive integer, got ${JSON.stringify(value)}`);
    }
  }
  if (src.engineUrl !== undefined && typeof src.engineUrl !== 'string') {
    fail('pipeline.engineUrl', 'must be a string when present');
  }

  const pipeline: PipelineConfig = {
    mode: src.mode,
    workers: src.workers,
    timeout: src.timeout,
    maxRetries: src.maxRetries,
  };
  if (typeof src.engineUrl === 'string') pipeline.engineUrl = src.engineUrl;

  return {
    version: typeof doc.version === 'string' ? doc.version : '1.0.0',
    name: typeof doc.name === 'string' ? doc.name : '',
    description: typeof doc.description === 'string' ? doc.description : '',
    deck,
    stages,
    pipeline,
  };
}
