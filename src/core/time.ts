import type { DateKey, ISODate } from "./types";

export const DEFAULT_TZ = "Asia/Tokyo";
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Calendar day of an instant in the given time zone. */
export function toDateKey(iso: ISODate | Date | number, tz: string = DEFAULT_TZ): DateKey {
  const d = iso instanceof Date ? iso : new Date(iso);
  return fmt(tz).format(d); // en-CA → YYYY-MM-DD
}

/**
 * A session belongs to the calendar day on which it STARTED (in the user's time zone).
 * 23:50 → 00:20 is therefore recorded on the first day.
 */
export function sessionDateKey(startedAt: ISODate, tz: string = DEFAULT_TZ): DateKey {
  return toDateKey(startedAt, tz);
}

export function parseDateKey(key: DateKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** Pure calendar arithmetic on date keys (no time zone involved). */
export function addDays(key: DateKey, n: number): DateKey {
  const { y, m, d } = parseDateKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function diffDays(a: DateKey, b: DateKey): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / DAY);
}

/** Monday of the week containing `key`. */
export function weekStart(key: DateKey): DateKey {
  const { y, m, d } = parseDateKey(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  const offset = (dow + 6) % 7;
  return addDays(key, -offset);
}

/**
 * Convert a local wall-clock time in `tz` to a UTC ISO string.
 * Used for back-filling sessions ("昨天 19:00").
 */
export function localToISO(dateKey: DateKey, time: string, tz: string = DEFAULT_TZ): ISODate {
  const { y, m, d } = parseDateKey(dateKey);
  const [hh, mm] = time.split(":").map(Number);
  // Start from the naive UTC guess and correct by the zone offset at that instant (twice for DST edges).
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMs(guess, tz);
    guess = Date.UTC(y, m - 1, d, hh, mm) - off;
  }
  return new Date(guess).toISOString();
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - Math.floor(utcMs / 1000) * 1000;
}

export function formatLocalTime(iso: ISODate, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0分钟";
  const h = Math.floor(ms / HOUR);
  const m = Math.round((ms % HOUR) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh ? `${d}天${rh}小时` : `${d}天`;
  }
  if (h > 0) return m ? `${h}小时${m}分` : `${h}小时`;
  return `${m}分钟`;
}
