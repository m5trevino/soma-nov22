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
    }
    if (card.verified !== undefined && typeof card.verified !== 'boolean') {
      fail(`${at}.verified`, 'must be a boolean when present');
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
    // silently lose what the generator wrote.
    if (Array.isArray(card.gateways)) validated.gateways = [...card.gateways];
    if (typeof card.verified === 'boolean') validated.verified = card.verified;
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
