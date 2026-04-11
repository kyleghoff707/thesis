// Worker shim for idb package - no IndexedDB available
export function openDB() { return Promise.reject(new Error('IndexedDB not available in Workers')); }
