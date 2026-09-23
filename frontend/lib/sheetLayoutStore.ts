// frontend/lib/sheetLayoutStore.ts
//
// Saved, re-editable sheets for the Sheet Layout Composer.
//
// Stored in the browser's IndexedDB on the machine that made the sheet — NOT
// on the server. That is deliberate (decided 2026-09-23): the composer's slot
// images are print-resolution JPEGs, and a 7-slot sheet runs to tens of MB.
// The backend stores images as base64 in Postgres (see CertificateTemplate.
// imageDataUrl) behind a 5MB JSON body limit, so keeping these server-side
// would mean a new upload endpoint plus large per-sheet rows in every
// deployment's database. IndexedDB holds the original File blobs as-is, with
// no base64 inflation, so reloading a saved sheet and re-downloading produces
// the identical 600 DPI JPG.
//
// Consequence to keep in mind: saved sheets belong to one browser on one PC.
// Clearing site data deletes them.

const DB_NAME = 'rareprint-sheet-layout';
const DB_VERSION = 1;
const STORE = 'sheets';

/** One slot's artwork. `blob` is the ORIGINAL uploaded file — rotation is kept
 *  separately (as degrees) and applied at download time, exactly as the live
 *  composer does, so a reloaded sheet stays fully editable. */
export type SavedSlot = { fileName: string; type: string; blob: Blob } | null;

export type SavedSheet = {
  id: string;
  name: string;
  sheetSize: string;
  patternId: string;
  gapMm: number;
  rotations: number[];
  slots: SavedSlot[];
  updatedAt: number;
};

/** What the saved-sheets list shows — same record without the heavy blobs. */
export type SavedSheetSummary = Omit<SavedSheet, 'slots'> & {
  slotCount: number;
  filledCount: number;
  bytes: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot save sheets (IndexedDB unavailable).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the saved-sheets database.'));
  });
}

function runTx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Saved-sheets request failed.'));
    tx.oncomplete = () => db.close();
  }));
}

function summarize(s: SavedSheet): SavedSheetSummary {
  const filled = s.slots.filter(Boolean) as Exclude<SavedSlot, null>[];
  return {
    id: s.id,
    name: s.name,
    sheetSize: s.sheetSize,
    patternId: s.patternId,
    gapMm: s.gapMm,
    rotations: s.rotations,
    updatedAt: s.updatedAt,
    slotCount: s.slots.length,
    filledCount: filled.length,
    bytes: filled.reduce((sum, slot) => sum + (slot.blob?.size ?? 0), 0),
  };
}

export async function listSavedSheets(): Promise<SavedSheetSummary[]> {
  const all = await runTx<SavedSheet[]>('readonly', store => store.getAll() as IDBRequest<SavedSheet[]>);
  return all.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSavedSheet(id: string): Promise<SavedSheet | undefined> {
  return runTx<SavedSheet | undefined>('readonly', store => store.get(id) as IDBRequest<SavedSheet | undefined>);
}

/** Saves under `sheet.id`; pass an existing id to overwrite that sheet. */
export async function putSavedSheet(sheet: SavedSheet): Promise<void> {
  await runTx('readwrite', store => store.put(sheet));
}

export async function deleteSavedSheet(id: string): Promise<void> {
  await runTx('readwrite', store => store.delete(id));
}

export function newSheetId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
