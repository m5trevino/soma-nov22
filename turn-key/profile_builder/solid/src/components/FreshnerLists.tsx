import { For, Show, createSignal } from 'solid-js';

/** Freshner config file (one per model) */
interface FreshnerConfig {
  modelId: string;
  modelName?: string;
  provider: string;
  providerLabel?: string;
  pricing?: {
    input_1m?: number;
    output_1m?: number;
    cache_read_1m?: number;
  };
  free?: boolean;
  free_label?: string | null;
  context?: number;
  max_output?: number;
  capabilities?: {
    text?: boolean;
    tools?: boolean;
    image?: boolean;
    reasoning?: boolean;
  };
  tier?: string;
  note?: string;
}

/** Freshner output file is an array of model configs */
interface FreshnerConfigFile {
  name: string;
  configs: FreshnerConfig[];
}

interface FreshnerListsProps {
  onConfigsLoaded: (configs: FreshnerConfig[]) => void;
}

/**
 * Tab 2: Freshner Lists
 *
 * Reads actual freshner config files from /freshner-configs/ directory.
 * Freshner outputs a single JSON file containing an array of model configs.
 * Clicking a file loads all models in that file into the model pool.
 * Not auto-loaded — user must click a file to load it.
 */
export function FreshnerListsTab(props: FreshnerListsProps) {
  const [configFiles, setConfigFiles] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [selectedConfig, setSelectedConfig] = createSignal<string | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/freshner-configs/');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const files: string[] = await resp.json();
      setConfigFiles(files);
    } catch (e: any) {
      setError('Failed to load freshner configs: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async (filename: string) => {
    setSelectedConfig(filename);
    try {
      const resp = await fetch(`/freshner-configs/${filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const configs: FreshnerConfig[] = await resp.json();
      props.onConfigsLoaded(configs);
    } catch (e: any) {
      alert('Failed to load config: ' + e.message);
    } finally {
      setSelectedConfig(null);
    }
  };

  return (
    <div class="freshner-lists-panel">
      <div class="panel-section">
        <h2 class="panel-title">Freshner Configs</h2>
        <p class="panel-hint">Freshner config files from /home/flintx/soma-nov/freshner-configs/</p>
        
        <Show when={loading()}>
          <div class="loading-text">Loading configs...</div>
        </Show>
        
        <Show when={error()}>
          <div class="error-text">{error()}</div>
        </Show>

        <div class="list-grid">
          <For each={configFiles()}>
            {(filename) => (
              <div class="list-item">
                <button
                  type="button"
                  class="list-load-btn"
                  onClick={() => handleLoad(filename)}
                  disabled={selectedConfig() === filename}
                  title={`Load ${filename}`}
                >
                  <span class="list-name">{filename}</span>
                  <Show when={selectedConfig() === filename}>
                    <span class="loading-indicator">Loading...</span>
                  </Show>
                </button>
              </div>
            )}
          </For>
        </div>

        <Show when={configFiles().length === 0 && !loading()}>
          <div class="empty-state">
            <p>No freshner configs found.</p>
            <p>Drop JSON config files in /home/flintx/soma-nov/freshner-configs/</p>
          </div>
        </Show>

        <button type="button" class="btn-reload" onClick={loadFiles}>
          Refresh
        </button>
      </div>
    </div>
  );
}
