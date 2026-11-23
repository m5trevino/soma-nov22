import { createSignal } from 'solid-js';
import { useDeckStore } from '../stores/deckStore';
import { useStageStore } from '../stores/stageStore';
import { usePipelineStore } from '../stores/pipelineStore';
import type { TurnKeyProfile } from '../types';
import { createEmptyProfile } from '../types';
import {
  validateProfile,
  ProfileValidationError,
  type ValidatedProfile,
} from '../utils/profileSchema';
import { DownloadIcon, PlusIcon, UploadIcon } from './Icons';

const [dirty, setDirty] = createSignal(false);
const [profileName, setProfileName] = createSignal('');
const [profileDesc, setProfileDesc] = createSignal('');

function markDirty() { setDirty(true); }

export function useDirtyTracker() {
  return { dirty, setDirty, markDirty };
}

function buildProfile(): TurnKeyProfile {
  const deckStore = useDeckStore();
  const stageStore = useStageStore();
  const pipelineStore = usePipelineStore();

  return {
    version: '1.0.0',
    name: profileName(),
    description: profileDesc(),
    deck: deckStore.deck(),
    stages: stageStore.stages(),
    pipeline: pipelineStore.config(),
  };
}

function loadProfileIntoStores(profile: TurnKeyProfile | ValidatedProfile) {
  const deckStore = useDeckStore();
  const stageStore = useStageStore();
  const pipelineStore = usePipelineStore();

  setProfileName(profile.name || '');
  setProfileDesc(profile.description || '');
  deckStore.setDeck(profile.deck || []);
  stageStore.setStages(profile.stages || []);
  pipelineStore.setConfig(profile.pipeline || createEmptyProfile().pipeline);
  setDirty(false);
}

export function ProfileIO() {
  const handleExport = () => {
    const profile = buildProfile();
    const json = JSON.stringify(profile, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = (profileName() || 'turnkey-profile').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `${safeName}_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDirty(false);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    // Nothing parses YAML today, so offering it only produces a confusing
    // "unexpected character" error on a file the picker said was acceptable.
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();

        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch (parseError) {
          // Not JSON at all. A different fix from "valid JSON, wrong shape".
          alert(`${file.name} is not valid JSON.\n\n${parseError}`);
          return;
        }

        let profile: ValidatedProfile;
        try {
          profile = validateProfile(raw);
        } catch (validationError) {
          if (validationError instanceof ProfileValidationError) {
            alert(`${file.name} is not a valid profile.\n\n${validationError.message}`);
          } else {
            alert(`${file.name} could not be read.\n\n${validationError}`);
          }
          return;
        }

        loadProfileIntoStores(profile);
      } catch (err) {
        alert(`Could not open ${file.name}: ${err}`);
      }
    };
    input.click();
  };

  const handleNew = () => {
    if (dirty() && !confirm('Discard unsaved changes?')) return;
    loadProfileIntoStores(createEmptyProfile());
  };

  return (
    <section class="panel profile-bar" aria-label="Profile">
      <div class="profile-fields">
        <label class="field">
          <span class="field-label">Profile name</span>
          <input
            type="text"
            placeholder="e.g. soma-current"
            value={profileName()}
            onInput={(e) => { setProfileName(e.currentTarget.value); markDirty(); }}
          />
        </label>
        <label class="field">
          <span class="field-label">Description</span>
          <input
            type="text"
            placeholder="What is this deck optimized for?"
            value={profileDesc()}
            onInput={(e) => { setProfileDesc(e.currentTarget.value); markDirty(); }}
          />
        </label>
      </div>

      <div class="profile-actions">
        <span class="dirty-flag" classList={{ visible: dirty() }}>
          <span class="dirty-dot"></span>
          Unsaved
        </span>
        <button type="button" class="btn" onClick={handleNew} title="Start a blank profile">
          <PlusIcon size={13} />
          New
        </button>
        <button type="button" class="btn" onClick={handleImport} title="Import a JSON profile">
          <UploadIcon size={13} />
          Import
        </button>
        <button type="button" class="btn primary" onClick={handleExport} title="Download this profile as JSON">
          <DownloadIcon size={13} />
          Export profile
        </button>
      </div>
    </section>
  );
}
