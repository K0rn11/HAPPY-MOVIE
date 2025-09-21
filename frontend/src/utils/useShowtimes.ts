// src/composables/useShowtimes.ts
import { computed, unref, type Ref } from "vue";

export const NEXT_DAYS = 3 as const;
export const TIME_SLOTS = ["10:00","12:30","16:00","17:30","20:00","22:30"] as const;

export function buildDays(n = NEXT_DAYS): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function availableTimesFor(movieId: number | string | null, dateStr: string): Set<string> {
  const id = Number(movieId || 0);
  const seed = id * 97 + Number(dateStr.replaceAll("-", "")) * 31 + 12345;
  const rnd = mulberry32(seed);
  const set = new Set<string>();
  for (const t of TIME_SLOTS) if (rnd() > 0.35) set.add(t);
  return set;
}

export function createSchedule(
  movieId: number | string | null | Ref<number | string | null>,
  days: string[] | Ref<string[]>
) {
  const scheduleByDate = computed<Record<string, Set<string>>>(() => {
    const id = unref(movieId);
    const ds = unref(days) as string[];
    const map: Record<string, Set<string>> = {};
    for (const d of ds) map[d] = availableTimesFor(id ?? 0, d);
    return map;
  });
  return { scheduleByDate };
}

export function isTimeEnabled(s: Record<string, Set<string>>, d: string, t: string) {
  return !!s[d]?.has(t);
}

export function formatDayOfWeek(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short" });
}
export function formatMD(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function formatFull(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
}
