// Offline write queue for field-data-entry writes (competitor intel,
// customer contacts/visit notes, rep profile, announcements) — a rep who
// loses connection mid-form previously just got a raw error and lost
// whatever they'd typed. Hand-rolled IndexedDB (no new CDN dependency,
// consistent with this project's no-build-step posture) rather than a
// library like idb.
//
// Deliberately NOT used for: login, PIN change/reset (own or admin-
// triggered), or admin profile edits — those must fail honestly offline
// rather than silently queue and replay later. See the call sites in
// lib/app-core.js for the exact included/excluded set.
//
// Classic global script (like lib/app-core.js), not a module — app-core.js
// isn't a module either and calls this via window.WriteQueue, matching the
// pattern every other feature bridge in this project uses.

const _WQ_DB_NAME = 'mkuv2-write-queue';
const _WQ_STORE = 'items';

function _wqOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_WQ_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(_WQ_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _wqReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// getAll() on an object store with an auto-increment keyPath and no
// explicit query returns records in ascending key order — i.e. the exact
// order items were enqueued in. drain() below relies on this to replay
// queued actions in the order the rep actually performed them.
async function _wqGetAll() {
  const db = await _wqOpenDB();
  return _wqReq(db.transaction(_WQ_STORE, 'readonly').objectStore(_WQ_STORE).getAll());
}

async function wqEnqueue(item) {
  const db = await _wqOpenDB();
  const tx = db.transaction(_WQ_STORE, 'readwrite');
  const id = await _wqReq(tx.objectStore(_WQ_STORE).add({ ...item, createdAt: Date.now(), retryCount: 0 }));
  _wqNotify();
  return id;
}

async function _wqRemove(id) {
  const db = await _wqOpenDB();
  await _wqReq(db.transaction(_WQ_STORE, 'readwrite').objectStore(_WQ_STORE).delete(id));
  _wqNotify();
}

async function _wqBumpRetry(id) {
  const db = await _wqOpenDB();
  const tx = db.transaction(_WQ_STORE, 'readwrite');
  const store = tx.objectStore(_WQ_STORE);
  const item = await _wqReq(store.get(id));
  if (item) {
    item.retryCount = (item.retryCount || 0) + 1;
    store.put(item);
  }
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
}

async function wqPending() {
  return (await _wqGetAll()).length;
}

const _wqListeners = [];
function wqOnChange(cb) { _wqListeners.push(cb); }
function _wqNotify() { wqPending().then(n => _wqListeners.forEach(cb => cb(n))); }

let _wqDraining = false;
// replayFn(item) must resolve on success (the write actually went through)
// or throw on failure — draining stops at the first failure (rather than
// skipping ahead) so ordering guarantees hold for compound multi-item
// actions. Retried automatically next time drain() runs (online event,
// or app boot with items already pending).
async function wqDrain(replayFn) {
  if (_wqDraining) return;
  _wqDraining = true;
  try {
    while (true) {
      const items = await _wqGetAll();
      if (!items.length) break;
      const item = items[0];
      try {
        await replayFn(item);
        await _wqRemove(item.id);
      } catch (e) {
        console.warn('WriteQueue: replay failed, will retry later', item.type, e);
        await _wqBumpRetry(item.id);
        break;
      }
    }
  } finally {
    _wqDraining = false;
  }
}

// navigator.onLine is known-unreliable (e.g. captive portals report
// "online" with no real connectivity) — also treat a fetch-level network
// error (as opposed to a real HTTP error response from the server) as an
// offline signal, so a write genuinely fails over to the queue instead of
// showing the rep a raw "Failed to fetch" error.
function wqIsOfflineError(e) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (e && (e.message || String(e))) || '';
  return /Failed to fetch|NetworkError|network request failed|Load failed|ERR_INTERNET_DISCONNECTED/i.test(msg);
}

window.WriteQueue = {
  enqueue: wqEnqueue,
  drain: wqDrain,
  pending: wqPending,
  onChange: wqOnChange,
  isOfflineError: wqIsOfflineError,
};
