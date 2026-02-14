/**
 * In-memory store for preview draft block config.
 * Short-lived (TTL 5 min) so the app can fetch the exact block (including long asset URLs)
 * without putting them in the preview URL.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const store = new Map(); // token -> { block, componentId, expiresAt }

function generateToken() {
  return `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function prune() {
  const now = Date.now();
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(token);
  }
}

function set(block, componentId) {
  prune();
  const token = generateToken();
  store.set(token, {
    block: typeof block === 'object' && block !== null ? block : {},
    componentId: componentId != null ? String(componentId) : undefined,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

function get(token) {
  if (!token || typeof token !== 'string') return null;
  const entry = store.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(token);
    return null;
  }
  return { block: entry.block, componentId: entry.componentId };
}

module.exports = { set, get };
