import { createSignal } from 'solid-js';
import type { PipelineConfig } from '../types';

const [config, setConfig] = createSignal<PipelineConfig>({
  mode: 'sequential',
  workers: 1,
  timeout: 180,
  maxRetries: 10,
});

export function usePipelineStore() {
  const updateConfig = (patch: Partial<PipelineConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  };

  return { config, setConfig, updateConfig };
}

