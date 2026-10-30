import { del, get, put } from "@vercel/blob";

/**
 * Storage for the public share snapshot: ONE JSON file in a Vercel Blob store.
 * The store can be created as Private or Public in the Vercel dashboard; the access mode is fixed per
 * store, so we try Private first and fall back to Public. Reads always go through /api/share, so
 * visitors never need the blob URL.
 */
const PATH = "share/snapshot.json";

export const blobConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

type Access = "private" | "public";
let known: Access | null = null;
const order = (): Access[] => (known ? [known, known === "private" ? "public" : "private"] : ["private", "public"]);

export async function saveSnapshot(json: string): Promise<void> {
  let last: unknown;
  for (const access of order()) {
    try {
      await put(PATH, json, { access, allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
      known = access;
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export async function loadSnapshot(): Promise<string | null> {
  let last: unknown;
  for (const access of order()) {
    try {
      const r = await get(PATH, { access, useCache: false });
      if (!r || r.statusCode !== 200) return null;
      known = access;
      return await new Response(r.stream).text();
    } catch (e) {
      const name = (e as Error)?.name ?? "";
      if (name === "BlobNotFoundError") {
        // not found under this access mode: the file may simply not exist yet, or live in the other mode
        last = e;
        continue;
      }
      last = e;
    }
  }
  if ((last as Error | undefined)?.name === "BlobNotFoundError") return null;
  if (last) throw last;
  return null;
}

export async function removeSnapshot(): Promise<void> {
  await del(PATH);
}
