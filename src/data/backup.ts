import { db, SYNCED_TABLES, type SyncedTable } from "./db";
import { now, setMeta } from "./repo";

export const BACKUP_FORMAT = "ai-fitness-garden-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Partial<Record<SyncedTable | "tombstones", unknown[]>>;
  photos?: { id: string; hash: string; createdAt: string; data: string; thumb: string }[];
}

async function blobToDataUrl(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${b.type || "image/jpeg"};base64,${btoa(bin)}`;
}

function dataUrlToBlob(u: string): Blob {
  const [head, data] = u.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export async function exportBackup(includePhotos: boolean): Promise<BackupFile> {
  const d = db();
  const tables: BackupFile["tables"] = {};
  for (const t of SYNCED_TABLES) tables[t] = await d.table(t).toArray();
  tables.tombstones = await d.tombstones.toArray();
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now(), tables };
  if (includePhotos) {
    const photos = await d.photos.toArray();
    file.photos = await Promise.all(
      photos.map(async (p) => ({ id: p.id, hash: p.hash, createdAt: p.createdAt, data: await blobToDataUrl(p.blob), thumb: await blobToDataUrl(p.thumb) })),
    );
  }
  await setMeta("lastBackupAt", file.exportedAt);
  return file;
}

export interface ImportReport {
  inserted: number;
  updated: number;
  skipped: number;
  photos: number;
}

function isRow(x: unknown): x is { id: string; updatedAt?: string } {
  return !!x && typeof x === "object" && typeof (x as { id: unknown }).id === "string";
}

/**
 * Import a backup.
 *  - "merge": rows are matched by id; the newer `updatedAt` wins. Re-importing the same file is idempotent,
 *    so training volume is never double counted.
 *  - "replace": wipe local data first, then load the file.
 */
export async function importBackup(raw: unknown, mode: "merge" | "replace"): Promise<ImportReport> {
  if (!raw || typeof raw !== "object") throw new Error("文件内容不是有效的 JSON 对象");
  const file = raw as BackupFile;
  if (file.format !== BACKUP_FORMAT) throw new Error("这不是 AI Fitness Garden 的备份文件");
  if (typeof file.version !== "number" || file.version > BACKUP_VERSION) throw new Error("备份文件版本过新，请先更新应用");
  if (!file.tables || typeof file.tables !== "object") throw new Error("备份文件缺少数据");

  const d = db();
  const report: ImportReport = { inserted: 0, updated: 0, skipped: 0, photos: 0 };
  const allTables = [...SYNCED_TABLES.map((t) => d.table(t)), d.tombstones, d.photos];
  await d.transaction("rw", allTables, async () => {
    if (mode === "replace") for (const t of allTables) await t.clear();
    for (const t of [...SYNCED_TABLES, "tombstones"] as const) {
      const rows = file.tables[t];
      if (!Array.isArray(rows)) continue;
      const table = d.table(t);
      for (const row of rows) {
        if (!isRow(row)) {
          report.skipped++;
          continue;
        }
        const cur = (await table.get(row.id)) as { updatedAt?: string } | undefined;
        if (!cur) {
          await table.put(row);
          report.inserted++;
        } else if ((row.updatedAt ?? "") > (cur.updatedAt ?? "")) {
          await table.put(row);
          report.updated++;
        } else report.skipped++;
      }
    }
    // honour deletions recorded in the backup
    if (mode === "merge" && Array.isArray(file.tables.tombstones)) {
      for (const ts of file.tables.tombstones as { table: string; rowId: string; deletedAt: string }[]) {
        if (!ts?.table || !SYNCED_TABLES.includes(ts.table as SyncedTable)) continue;
        const table = d.table(ts.table);
        const cur = (await table.get(ts.rowId)) as { updatedAt?: string } | undefined;
        if (cur && (cur.updatedAt ?? "") <= ts.deletedAt) await table.delete(ts.rowId);
      }
    }
    for (const p of file.photos ?? []) {
      if (!p?.id || !p.data) continue;
      if (await d.photos.get(p.id)) continue;
      await d.photos.put({ id: p.id, hash: p.hash, createdAt: p.createdAt, blob: dataUrlToBlob(p.data), thumb: dataUrlToBlob(p.thumb ?? p.data) });
      report.photos++;
    }
  });
  return report;
}

export function backupFileName() {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `fitness-garden-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}.json`;
}
