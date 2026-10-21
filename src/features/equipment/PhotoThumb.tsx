"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db } from "@/data/db";

export function usePhotoUrl(photoId: string | null | undefined, full = false) {
  const photo = useLiveQuery(async () => (photoId ? await db().photos.get(photoId) : undefined), [photoId]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(full ? photo.blob : photo.thumb);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo, full]);
  return url;
}

export function PhotoThumb({ photoId, size = 48, fallback = "🏋️", rounded = "rounded-2xl", fill }: { photoId: string | null; size?: number; fallback?: string; rounded?: string; fill?: boolean }) {
  const url = usePhotoUrl(photoId);
  return (
    <div
      className={`${rounded} overflow-hidden bg-surface-2 grid place-items-center shrink-0 ${fill ? "w-full aspect-[4/3]" : ""}`}
      style={fill ? undefined : { width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: fill ? 40 : size * 0.45 }}>{fallback}</span>
      )}
    </div>
  );
}
