import { createSignal, createMemo, createRoot } from 'solid-js';

export type TabId = 'all-models' | 'freshner-lists';

const DB_NAME = 'turnkey-freshner-lists';
const STORE_NAME = 'lists';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveList(name: string, routes: string[]): Promise<void> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(routes, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function getList(name: string): Promise<string[] | null> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(name);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

function getAllListNames(): Promise<string[]> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result || []) as unknown as string[]);
      req.onerror = () => reject(req.error);
    });
  });
}

function deleteList(name: string): Promise<void> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function loadFreshnerLists() {
  return getAllListNames();
}

export function loadFreshnerList(name: string) {
  return getList(name);
}

export function saveFreshnerList(name: string, routes: string[]) {
  return saveList(name, routes);
}

export function removeFreshnerList(name: string) {
  return deleteList(name);
}

// ---- Tab store ----

const store = createRoot(() => {
  const [activeTab, setActiveTab] = createSignal<TabId>('all-models');
  const [freshnerListNames, setFreshnerListNames] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

  async function refreshFreshnerLists() {
    setLoading(true);
    setError('');
    try {
      const names = await loadFreshnerLists();
      setFreshnerListNames(names);
    } catch (e: any) {
      setError('Failed to load freshner lists: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    if (tab === 'freshner-lists') {
      refreshFreshnerLists();
    }
  }

  return {
    activeTab,
    setActiveTab,
    freshnerListNames,
    setFreshnerListNames,
    loading,
    error,
    refreshFreshnerLists,
    selectTab,
  } as const;
});

export function useTabStore() {
  return store;
}
