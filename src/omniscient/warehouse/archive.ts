import type { WarehouseArchiveRecord } from './types.js';

const DB_NAME = 'omniscient.warehouse.archive';
const STORE = 'captures';
const MAX_CAPTURES = 32;

interface StoredCapture {
  id: string;
  capturedAt: string;
  favorite: boolean;
  image: Blob;
}

function openArchive(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Archive database unavailable'));
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
}

async function trim(db: IDBDatabase): Promise<void> {
  const records = await new Promise<StoredCapture[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredCapture[]);
    request.onerror = () => reject(request.error ?? new Error('Archive read failed'));
  });
  if (records.length <= MAX_CAPTURES) return;
  const removable = records
    .filter((record) => !record.favorite)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const transaction = db.transaction(STORE, 'readwrite');
  for (let index = 0; index < records.length - MAX_CAPTURES && index < removable.length; index++) {
    transaction.objectStore(STORE).delete(removable[index].id);
  }
}

/** Store a small evidence frame; failure is non-fatal because decisions never depend on it. */
export async function captureWarehouseFrame(
  container: HTMLElement,
  record: Omit<WarehouseArchiveRecord, 'id' | 'capturedAt' | 'favorite'>
): Promise<WarehouseArchiveRecord | null> {
  try {
    const source = container.querySelector('canvas');
    if (!source) return null;
    const frame = document.createElement('canvas');
    frame.width = 512;
    frame.height = 288;
    const context = frame.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, frame.width, frame.height);
    const image = await canvasBlob(frame);
    if (!image) return null;
    const capturedAt = new Date().toISOString();
    const id = `w07-${capturedAt}-${record.caseId}-${record.packageId}`;
    const metadata: WarehouseArchiveRecord = { ...record, id, capturedAt, favorite: false };
    const db = await openArchive();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put({
        id,
        capturedAt,
        favorite: false,
        image,
      } satisfies StoredCapture);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Archive write failed'));
    });
    await trim(db);
    db.close();
    return metadata;
  } catch {
    return null;
  }
}
