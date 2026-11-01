// Small navigation snapshots, scoped by account in the key. Requests remain
// authoritative; failed or invalidated reads never replace a successful snapshot.
const entries = new Map<string, { value?: unknown; savedAt: number; stale?: boolean; pending?: Promise<unknown> }>();
const FRESH_MS = 5000;
const MAX_AGE_MS = 5 * 60 * 1000;
export function readListSnapshot<T>(key: string): T | undefined {
    const entry = entries.get(key);
    return entry?.value !== undefined && Date.now() - entry.savedAt < MAX_AGE_MS ? entry.value as T : undefined;
}
export function invalidateList(prefix: string) {
    for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}
export function fetchList<T>(key: string, loader: () => Promise<T>): Promise<T> {
    let entry = entries.get(key);
    if (entry?.pending) return entry.pending as Promise<T>;
    if (!entry?.stale && entry?.value !== undefined && Date.now() - entry.savedAt < FRESH_MS) return Promise.resolve(entry.value as T);
    if (!entry) { entry = { savedAt: 0 }; entries.set(key, entry); }
    const current = entry;
    const pending = Promise.resolve().then(loader).then(value => {
        if (entries.get(key) === current) { current.value = value; current.savedAt = Date.now(); current.stale = false; }
        return value;
    }).finally(() => { if (current.pending === pending) current.pending = undefined; });
    current.pending = pending;
    return pending;
}
export function updateLists<T>(prefix: string, update: (value: T) => T) {
    for (const [key, entry] of entries) if (key.startsWith(prefix)) {
        if (entry.value !== undefined) entry.value = update(entry.value as T);
        // An older in-flight response cannot undo a successful mutation.
        entries.set(key, { value: entry.value, savedAt: entry.savedAt, stale: true });
    }
}
