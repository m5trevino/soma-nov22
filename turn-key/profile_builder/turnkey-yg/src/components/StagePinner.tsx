import { For, Show, createSignal } from 'solid-js';
import { useStageStore } from '../stores/stageStore';
import { useDeckStore } from '../stores/deckStore';
import { providerVars } from '../utils/providerColors';
import {
  ChevronDownIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from './Icons';

export function StagePinner() {
  const stageStore = useStageStore();
  const deckStore = useDeckStore();

  const [newStage, setNewStage] = createSignal('');
  const [editingStage, setEditingStage] = createSignal<string | null>(null);
  const [filterQuery, setFilterQuery] = createSignal('');

  const pinnedTotal = () => stageStore.stages().reduce((sum, stage) => sum + stage.pinnedModels.length, 0);

  const isPinned = (stageName: string, modelId: string) => {
    const stage = stageStore.stages().find(item => item.stageName === stageName);
    return stage ? stage.pinnedModels.includes(modelId) : false;
  };

  const addStage = () => {
    const name = newStage().trim();
    if (!name) return;
    const exists = stageStore.stages().some(stage => stage.stageName === name);
    stageStore.addCustomStage(name);
    setNewStage('');
    deckStore.showToast(exists ? `Stage “${name}” already exists` : `Stage “${name}” added`);
  };

  return (
    <section class="panel stage-panel" aria-label="Stage pinning">
      <div class="panel-head">
        <div class="panel-title">
          <span class="panel-glyph"><PinIcon size={13} /></span>
          Stage Pinning
        </div>
        <div class="panel-meta">
          <span>{stageStore.stages().length} stages</span>
          <span class="meta-divider"></span>
          <span class="count-pill">{pinnedTotal()} pinned</span>
        </div>
      </div>

      <p class="panel-hint">
        A stage set to <strong>Use deck</strong> draws from the deck. Turn that off and pin exact models when a
        stage must always run on a specific model.
      </p>

      <div class="stage-grid">
        <For each={stageStore.stages()}>
          {(stage) => {
            const showEditor = () => editingStage() === stage.stageName;
            const toggleEditor = () => {
              if (showEditor()) {
                setEditingStage(null);
              } else {
                setFilterQuery('');
                setEditingStage(stage.stageName);
              }
            };

            const candidates = () => {
              const cards = deckStore.deck();
              const known = new Set(cards.map(card => card.modelId));
              const extras = stage.pinnedModels
                .filter(modelId => !known.has(modelId))
                .map(modelId => ({ modelId, modelName: modelId, provider: 'unknown', providerLabel: 'Pinned' }));
              return [...cards, ...extras];
            };

            const visibleCandidates = () => {
              const query = filterQuery().trim().toLowerCase();
              if (!query) return candidates();
              return candidates().filter(card =>
                `${card.modelName} ${card.modelId} ${card.providerLabel || ''}`.toLowerCase().includes(query)
              );
            };

            return (
              <div class="stage-card" classList={{ expanded: showEditor(), usingPins: !stage.useDeck }} data-stage={stage.stageName}>
                <div class="stage-head">
                  <div class="stage-title">
                    <span class="stage-glyph">S</span>
                    <span class="stage-name">{stage.stageName}</span>
                  </div>

                  <span class="stage-state" classList={{ pinned: !stage.useDeck }}>
                    {stage.useDeck
                      ? 'Draws from deck'
                      : `${stage.pinnedModels.length} pinned`}
                  </span>

                  <button
                    type="button"
                    class="switch-row compact"
                    role="switch"
                    aria-checked={stage.useDeck}
                    onClick={() => stageStore.setUseDeck(stage.stageName, !stage.useDeck)}
                    title="Let this stage draw from the deck"
                  >
                    <span class="switch small" classList={{ on: stage.useDeck }}>
                      <span class="switch-knob"></span>
                    </span>
                    <span>Use deck</span>
                  </button>

                  <button
                    type="button"
                    class="stage-expand"
                    classList={{ open: showEditor() }}
                    onClick={toggleEditor}
                    title={showEditor() ? 'Hide pinned models' : 'Edit pinned models'}
                    aria-expanded={showEditor()}
                  >
                    <ChevronDownIcon size={13} />
                  </button>

                  <button
                    type="button"
                    class="icon-btn icon-danger"
                    onClick={() => {
                      stageStore.removeStage(stage.stageName);
                      if (editingStage() === stage.stageName) setEditingStage(null);
                      deckStore.showToast(`Stage “${stage.stageName}” removed`);
                    }}
                    title="Remove this stage"
                    aria-label={`Remove stage ${stage.stageName}`}
                  >
                    <TrashIcon size={11} />
                  </button>
                </div>

                <Show when={showEditor()}>
                  <div class="stage-editor">
                    <label class="search-field small">
                      <span class="search-icon"><SearchIcon size={12} /></span>
                      <input
                        type="text"
                        placeholder="Filter models to pin…"
                        value={filterQuery()}
                        onInput={(event) => setFilterQuery(event.currentTarget.value)}
                        aria-label={`Filter models for stage ${stage.stageName}`}
                      />
                    </label>

                    <Show when={stage.useDeck}>
                      <div class="stage-note">
                        Turn off <strong>Use deck</strong> to pin specific models to this stage.
                      </div>
                    </Show>

                    <div class="pin-grid">
                      <For each={visibleCandidates()}>
                        {(card) => {
                          const pinned = () => isPinned(stage.stageName, card.modelId);
                          return (
                            <button
                              type="button"
                              class="pin-chip"
                              classList={{ pinned: pinned() }}
                              style={providerVars(deckStore.colorFor(card.provider))}
                              disabled={stage.useDeck}
                              data-model-id={card.modelId}
                              onClick={() => stageStore.togglePin(stage.stageName, card.modelId)}
                              title={`${card.modelName} · ${card.providerLabel || card.provider}`}
                              aria-pressed={pinned()}
                            >
                              <span class="pin-dot"></span>
                              <span class="pin-name">{card.modelName}</span>
                              <span class="pin-provider">{card.providerLabel || card.provider}</span>
                              <Show when={pinned()}>
                                <span class="pin-check">✓</span>
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                    </div>

                    <Show when={candidates().length === 0}>
                      <div class="stage-empty">
                        Add models to the deck first, then pin them here.
                      </div>
                    </Show>

                    <Show when={visibleCandidates().length === 0 && candidates().length > 0}>
                      <div class="stage-empty">No deck models match that filter.</div>
                    </Show>

                    <div class="stage-editor-foot">
                      <span class="stage-count">
                        {stage.pinnedModels.length} of {candidates().length} pinned
                      </span>
                      <button type="button" class="btn tiny" onClick={toggleEditor}>Done</button>
                    </div>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <div class="stage-add">
        <label class="search-field">
          <span class="search-icon"><PlusIcon size={13} /></span>
          <input
            type="text"
            placeholder="New stage name…"
            value={newStage()}
            onInput={(event) => setNewStage(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addStage();
            }}
            aria-label="New stage name"
          />
        </label>
        <button type="button" class="btn" onClick={addStage} disabled={!newStage().trim()}>
          <PlusIcon size={13} /> Add stage
        </button>
      </div>
    </section>
  );
}
