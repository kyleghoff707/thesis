// Two-tier cache: in-memory (fast) + localStorage (survives refresh)
// TTL in milliseconds

const memoryCache = new Map();

const TTL = {
  financials: 24 * 60 * 60 * 1000,   // 24 hours
  companyDetails: 24 * 60 * 60 * 1000, // 24 hours
  prices: 60 * 60 * 1000,             // 1 hour
};

function lsKey(key) {
  return `sa-cache:${key}`;
}

export function cacheGet(key) {
  // Try memory first
  const mem = memoryCache.get(key);
  if (mem && Date.now() < mem.expiresAt) {
    return mem.data;
  }

  // Try localStorage
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() < parsed.expiresAt) {
        // Promote back to memory
        memoryCache.set(key, parsed);
        return parsed.data;
      }
      // Expired — clean up
      localStorage.removeItem(lsKey(key));
    }
  } catch {
    // Corrupted — ignore
  }

  return null;
}

export function cacheSet(key, data, category = 'financials') {
  const ttl = TTL[category] || TTL.financials;
  const entry = { data, expiresAt: Date.now() + ttl };

  memoryCache.set(key, entry);

  try {
    localStorage.setItem(lsKey(key), JSON.stringify(entry));
  } catch {
    // localStorage full — memory cache still works
  }
}

export function cacheClear(prefix) {
  // Clear memory entries matching prefix
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }

  // Clear localStorage entries matching prefix
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(`sa-cache:${prefix}`)) {
      toRemove.push(k);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
