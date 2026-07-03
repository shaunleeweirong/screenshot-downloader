import type { CaptureRecord } from '../types';

// Local capture history. Metadata in the `records` store, image blobs in the
// `blobs` store keyed by `${id}:${index}`. Works in both the service worker and
// the results page (both have IndexedDB).

const DB_NAME = 'fullshot';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';
const STORE_BLOBS = 'blobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result: T;
    Promise.resolve(fn(t)).then((r) => (result = r)).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addCapture(record: CaptureRecord, blobs: Blob[]): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, [STORE_RECORDS, STORE_BLOBS], 'readwrite', (t) => {
      t.objectStore(STORE_RECORDS).put(record);
      const store = t.objectStore(STORE_BLOBS);
      blobs.forEach((blob, i) => store.put({ key: `${record.id}:${i}`, blob }));
    });
  } finally {
    db.close();
  }
}

export async function getRecord(id: string): Promise<CaptureRecord | undefined> {
  const db = await openDb();
  try {
    return await tx(db, [STORE_RECORDS], 'readonly', (t) =>
      reqToPromise(t.objectStore(STORE_RECORDS).get(id) as IDBRequest<CaptureRecord | undefined>),
    );
  } finally {
    db.close();
  }
}

export async function getBlobs(record: CaptureRecord): Promise<Blob[]> {
  const db = await openDb();
  try {
    return await tx(db, [STORE_BLOBS], 'readonly', async (t) => {
      const store = t.objectStore(STORE_BLOBS);
      const out: Blob[] = [];
      for (let i = 0; i < record.tiles; i++) {
        const row = await reqToPromise(store.get(`${record.id}:${i}`) as IDBRequest<{ blob: Blob } | undefined>);
        if (row?.blob) out.push(row.blob);
      }
      return out;
    });
  } finally {
    db.close();
  }
}

export async function listRecords(): Promise<CaptureRecord[]> {
  const db = await openDb();
  try {
    const all = await tx(db, [STORE_RECORDS], 'readonly', (t) =>
      reqToPromise(t.objectStore(STORE_RECORDS).getAll() as IDBRequest<CaptureRecord[]>),
    );
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function deleteCapture(id: string): Promise<void> {
  const db = await openDb();
  try {
    const record = await getRecord(id);
    await tx(db, [STORE_RECORDS, STORE_BLOBS], 'readwrite', (t) => {
      t.objectStore(STORE_RECORDS).delete(id);
      const tiles = record?.tiles ?? 1;
      for (let i = 0; i < tiles; i++) t.objectStore(STORE_BLOBS).delete(`${id}:${i}`);
    });
  } finally {
    db.close();
  }
}
