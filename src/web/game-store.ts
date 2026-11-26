// Remembers the player's selected game files in this browser (IndexedDB), so
// the folder does not have to be chosen on every visit. Nothing leaves the device.

const DATABASE = "kingpinweb-game";
const FILES = "files";
const META = "meta";
const META_KEY = "game";

export interface StoredFile {
  /** Path in the engine's virtual filesystem. */
  target: string;
  blob: Blob;
}

export interface GameInfo {
  root: string;
  maps: string[];
  fileCount: number;
  bytes: number;
}

export interface StoredGame extends GameInfo {
  files: StoredFile[];
}

const result = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const completed = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    // A quota failure aborts the transaction without a separate request error.
    transaction.onabort = () => reject(transaction.error ?? new Error("storage transaction aborted"));
  });

async function withDatabase<T>(use: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const open = indexedDB.open(DATABASE, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(FILES, { keyPath: "target" });
    open.result.createObjectStore(META);
  };
  const db = await result(open);
  try {
    return await use(db);
  } finally {
    db.close();
  }
}

/** Replaces any saved game. All or nothing: a failure keeps the previous copy. */
export function saveGame(game: StoredGame): Promise<void> {
  return withDatabase(async (db) => {
    const transaction = db.transaction([FILES, META], "readwrite");
    const done = completed(transaction);
    const files = transaction.objectStore(FILES);
    files.clear();
    for (const file of game.files) files.put(file);
    const { files: _, ...info } = game;
    transaction.objectStore(META).put(info, META_KEY);
    await done;
    // Ask the browser not to evict the copy under storage pressure. Optional.
    void navigator.storage?.persist?.().catch(() => false);
  });
}

export function loadGame(): Promise<StoredGame | null> {
  return withDatabase(async (db) => {
    const transaction = db.transaction([FILES, META], "readonly");
    const [info, files] = await Promise.all([
      result(transaction.objectStore(META).get(META_KEY) as IDBRequest<GameInfo | undefined>),
      result(transaction.objectStore(FILES).getAll() as IDBRequest<StoredFile[]>),
    ]);
    return info && files.length === info.fileCount ? { ...info, files } : null;
  });
}

export function forgetGame(): Promise<void> {
  return withDatabase(async (db) => {
    const transaction = db.transaction([FILES, META], "readwrite");
    const done = completed(transaction);
    transaction.objectStore(FILES).clear();
    transaction.objectStore(META).clear();
    await done;
  });
}
