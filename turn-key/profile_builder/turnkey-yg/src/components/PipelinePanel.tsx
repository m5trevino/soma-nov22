import { For } from 'solid-js';
import { usePipelineStore } from '../stores/pipelineStore';
import { SlidersIcon } from './Icons';

const MODES = [
  { value: 'sequential', label: 'Sequential', hint: 'One stage at a time' },
  { value: 'parallel', label: 'Parallel', hint: 'Run stages concurrently' },
] as const;

export function PipelinePanel() {
  const { config, updateConfig } = usePipelineStore();

  return (
    <section class="panel pipeline-panel" aria-label="Pipeline configuration">
      <div class="panel-head">
        <div class="panel-title">
          <span class="panel-glyph"><SlidersIcon size={13} /></span>
          Pipeline
        </div>
        <div class="panel-meta">
          <span class="count-pill">{config().mode}</span>
        </div>
      </div>

      <div class="pipeline-grid">
        <div class="field full">
          <span class="field-label">Execution mode</span>
          <div class="mode-row">
            <For each={MODES}>
              {(mode) => (
                <button
                  type="button"
                  class="mode-btn"
                  classList={{ active: config().mode === mode.value }}
                  onClick={() => updateConfig({ mode: mode.value })}
                  title={mode.hint}
                >
                  <span class="mode-dot"></span>
                  <span class="mode-copy">
                    <strong>{mode.label}</strong>
                    <small>{mode.hint}</small>
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>

        <label class="field full">
          <span class="field-label">Engine URL</span>
          <input
            type="text"
            value={config().engineUrl || 'https://engine.save-aichats.com'}
            onInput={(event) => updateConfig({ engineUrl: event.currentTarget.value })}
            placeholder="https://engine.save-aichats.com"
          />
        </label>

        <label class="field">
          <span class="field-label">Workers</span>
          <input
            type="number"
            min="1"
            max="64"
            value={config().workers}
            onInput={(event) => updateConfig({ workers: Math.max(1, parseInt(event.currentTarget.value) || 1) })}
          />
        </label>

        <label class="field">
          <span class="field-label">Timeout (s)</span>
          <input
            type="number"
            min="10"
            max="600"
            value={config().timeout}
            onInput={(event) => updateConfig({ timeout: Math.max(10, parseInt(event.currentTarget.value) || 180) })}
          />
        </label>

        <label class="field">
          <span class="field-label">Max retries</span>
          <input
            type="number"
            min="1"
            max="50"
            value={config().maxRetries}
            onInput={(event) => updateConfig({ maxRetries: Math.max(1, parseInt(event.currentTarget.value) || 10) })}
          />
        </label>
      </div>

      <p class="panel-hint pipeline-hint">These values travel with the exported profile.</p>
    </section>
  );
}
