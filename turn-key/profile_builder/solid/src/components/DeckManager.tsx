import { For, Show, createSignal } from 'solid-js';
import { useDeckStore } from '../stores/deckStore';
import { providerVars } from '../utils/providerColors';
import type { DeckCard, TestRecord } from '../types';
import { ENGINE_BASE } from '../config';
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  EyeIcon,
  LayersIcon,
  PlayIcon,
  TrashIcon,
} from './Icons';
import { chatTestBody, failureText, hasProvider, missingProviderText, testKey } from '../utils/chatTest';

export function DeckManager() {
  const store = useDeckStore();
  const [showIoFor, setShowIoFor] = createSignal<string | null>(null);
  const [testingId, setTestingId] = createSignal<string | null>(null);
  const [draggingIdx, setDraggingIdx] = createSignal<number | null>(null);

  const handleDragStart = (index: number) => (event: DragEvent) => {
    setDraggingIdx(index);
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetIdx: number) => (event: DragEvent) => {
    event.preventDefault();
    const from = draggingIdx();
    if (from !== null && from !== targetIdx) {
      store.moveInDeck(from, targetIdx);
    }
    setDraggingIdx(null);
  };

  const clearDeck = () => {
    if (store.deck().length === 0) return;
    if (confirm('Remove every model from the deck?')) store.clearDeck();
  };

  const runDeckTest = async (card: DeckCard) => {
    const key = testKey(card.provider, card.modelId);
    const requestBody = chatTestBody(card.modelId, card.provider, 'Say "TEST_OK" and nothing else.');

    // A card with no real provider cannot be tested: the engine is not allowed
    // to choose the gateway. Say so, with the fix, instead of sending a call.
    if (!hasProvider(card.provider)) {
      store.setTestRecord(key, {
        status: 'failed',
        requestBody,
        responseBody: null,
        error: missingProviderText(card.modelId),
        durationMs: null,
      });
      store.showToast(`${card.modelName}: no provider on this card`);
      return;
    }

    setTestingId(card.modelId);
    store.setTestRecord(key, {
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
        store.setTestRecord(key, {
          status: 'success',
          requestBody,
          responseBody,
          error: null,
          durationMs,
        });
        store.showToast(`${card.modelName}: OK (${durationMs}ms)`);
      } else {
        store.setTestRecord(key, {
          status: 'failed',
          requestBody,
          responseBody,
          error: failureText(response.status, responseBody),
          durationMs,
        });
        store.showToast(`${card.modelName}: failed (${failureText(response.status, responseBody)})`);
      }
    } catch (error: any) {
      const durationMs = Math.round(performance.now() - start);
      store.setTestRecord(key, {
        status: 'failed',
        requestBody,
        responseBody: null,
        error: error?.message || String(error),
        durationMs,
      });
      store.showToast(`${card.modelName}: request error`);
    }
    setTestingId(null);
  };

  return (
    <section class="panel deck-panel" aria-label="Deck">
      <div class="panel-head">
        <div class="panel-title">
          <span class="panel-glyph"><LayersIcon size={13} /></span>
          Deck
        </div>
        <div class="panel-meta">
          <span class="count-pill">{store.deck().length} cards</span>
          <Show when={store.deck().length > 0}>
            <button type="button" class="btn tiny ghost danger-text" onClick={clearDeck} title="Remove every model from the deck">
              <TrashIcon size={11} /> Clear
            </button>
          </Show>
        </div>
      </div>

      <p class="panel-hint">
        Click any card in the library to add or remove it. Drag rows to set the order the pipeline receives.
      </p>

      <div class="deck-list">
        <For each={store.deck()}>
          {(card, idx) => {
            const color = store.colorFor(card.provider);
            const label = card.providerLabel || store.providerLabel(card.provider);
            const record = () => store.testResults()[testKey(card.provider, card.modelId)] as TestRecord | undefined;
            const showIo = () => showIoFor() === card.modelId;
            const isTesting = () => testingId() === card.modelId;

            return (
              <>
                <div
                  class="deck-item"
                  classList={{ dragging: draggingIdx() === idx() }}
                  draggable
                  style={providerVars(color)}
                  data-model-id={card.modelId}
                  onDragStart={handleDragStart(idx())}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(idx())}
                  onDragEnd={() => setDraggingIdx(null)}
                >
                  <span class="drag-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
                  <span class="deck-index">{idx() + 1}</span>

                  <div class="deck-main">
                    <div class="deck-name" title={card.modelName}>{card.modelName}</div>
                    <div class="deck-sub">
                      <span class="badge badge-provider">{label}</span>
                      <Show when={card.tier}>
                        <span class="badge badge-tier">{card.tier}</span>
                      </Show>
                      {/* A model served by several gateways is one card, not
                          two lookalikes. The count is the useful part; the
                          title lists them. */}
                      <Show when={(card.gateways?.length ?? 0) > 1}>
                        <span
                          class="badge badge-routes"
                          title={`Routable through ${card.gateways!.join(', ')}`}
                        >
                          {card.gateways!.length} routes
                        </span>
                      </Show>
                      {/* Answered a live smoke test, as opposed to merely being
                          listed as free. */}
                      <Show when={card.verified}>
                        <span class="badge badge-tools" title="Answered a live smoke test">
                          verified
                        </span>
                      </Show>
                      <Show when={record()}>
                        {(current) => (
                          <span class={`deck-test-status ${current().status}`}>
                            <span class="status-led"></span>
                            {current().status === 'pending'
                              ? 'Testing…'
                              : current().status === 'success'
                                ? 'OK'
                                : 'Failed'}
                          </span>
                        )}
                      </Show>
                    </div>
                  </div>

                  <div class="deck-actions">
                    <button
                      type="button"
                      class="icon-btn"
                      onClick={() => runDeckTest(card)}
                      disabled={isTesting()}
                      title="Test this model"
                      aria-label={`Test ${card.modelName}`}
                    >
                      <PlayIcon size={10} />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      onClick={() => setShowIoFor(showIo() ? null : card.modelId)}
                      disabled={!record()?.responseBody}
                      title="View request and response"
                      aria-label={`View I/O for ${card.modelName}`}
                    >
                      <EyeIcon size={11} />
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-danger"
                      onClick={() => store.removeFromDeck(card.uid)}
                      title="Remove from deck"
                      aria-label={`Remove ${card.modelName} from deck`}
                    >
                      <CloseIcon size={11} />
                    </button>
                  </div>
                </div>

                <Show when={showIo() ? record() : undefined}>
                  {(current) => (
                    <div class="deck-io-viewer">
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
              </>
            );
          }}
        </For>

        <Show when={store.deck().length === 0}>
          <div class="deck-empty">
            <span class="deck-empty-icon"><LayersIcon size={22} /></span>
            <div class="deck-empty-title">Your deck is empty</div>
            <p>Pick models from the library. They will be sent to the pipeline in the order listed here.</p>
          </div>
        </Show>
      </div>

      <Show when={store.deck().length > 0}>
        <div class="deck-foot">
          <span class="deck-foot-icon"><CheckIcon size={11} /></span>
          <span>{store.deck().length} models ready for export</span>
        </div>
      </Show>
    </section>
  );
}
