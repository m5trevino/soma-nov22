import { createSignal } from 'solid-js';
import type { StagePin } from '../types';

const DEFAULT_STAGES = [
  'distiller', 'introbeaver', 'planbeaver', 'outrobeaver',
  'nexus', 'spark', 'falcon', 'eagle', 'drafter', 'scout', 'oc', 'olc',
];

const [stages, setStages] = createSignal<StagePin[]>(
  DEFAULT_STAGES.map(name => ({ stageName: name, pinnedModels: [], useDeck: true }))
);

export function useStageStore() {
  const togglePin = (stageName: string, modelId: string) => {
    setStages(prev => prev.map(s => {
      if (s.stageName !== stageName) return s;
      const has = s.pinnedModels.includes(modelId);
      const pinned = has
        ? s.pinnedModels.filter(m => m !== modelId)
        : [...s.pinnedModels, modelId];
      return { ...s, pinnedModels: pinned, useDeck: pinned.length === 0 };
    }));
  };

  const setUseDeck = (stageName: string, useDeck: boolean) => {
    setStages(prev => prev.map(s =>
      s.stageName === stageName ? { ...s, useDeck } : s
    ));
  };

  const addCustomStage = (name: string) => {
    if (!name.trim()) return;
    setStages(prev => {
      if (prev.some(s => s.stageName === name)) return prev;
      return [...prev, { stageName: name, pinnedModels: [], useDeck: true }];
    });
  };

  const removeStage = (name: string) => {
    setStages(prev => prev.filter(s => s.stageName !== name));
  };

  return { stages, setStages, togglePin, setUseDeck, addCustomStage, removeStage };
}

