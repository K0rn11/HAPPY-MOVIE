// src/utils/useMovies.ts
import axios from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:3001'

export type MovieLike = {
  id: number
  title: string
  overview?: string
  poster_path?: string | null
  durationMin?: number
  rating?: string | null
  createdAt?: string | Date | null
  source?: 'custom' | 'tmdb'
}

// ดึงจาก backend (หนังที่ admin เพิ่มเอง) — เรียงล่าสุดใน API อยู่แล้ว
export async function fetchCustomMovies(): Promise<MovieLike[]> {
  const { data } = await axios.get(`${API_BASE}/api/movies`)
  if (!data?.ok) return []
  return (data.movies || []).map((m: any) => ({
    ...m,
    source: 'custom' as const,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
  }))
}

// รวม DB + TMDB โดยให้ “custom” อยู่บนสุดเสมอ และ dedupe ตามชื่อเรื่องแบบหยาบ ๆ
export function mergeMovies(custom: MovieLike[], tmdb: MovieLike[]): MovieLike[] {
  const norm = (s?: string) => (s || '').trim().toLowerCase()
  const seen = new Set<string>()

  // 1) custom มาก่อน
  const out: MovieLike[] = []
  for (const m of custom) {
    const key = norm(m.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...m, source: 'custom' })
  }
  // 2) ต่อด้วย TMDB ที่ยังไม่ซ้ำชื่อ
  for (const m of tmdb) {
    const key = norm(m.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...m, source: 'tmdb' })
  }
  return out
}

// ค้นหา: รวม DB + TMDB โดย custom ขึ้นก่อน
export async function searchAllMovies(q: string, tmdbSearchFn: (q:string)=>Promise<MovieLike[]>): Promise<MovieLike[]> {
  const [{ data }] = await Promise.all([
    axios.get(`${API_BASE}/api/movies/search`, { params:{ q } })
  ])
  const custom: MovieLike[] = (data?.movies || []).map((m:any) => ({
    ...m, source: 'custom' as const,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
  }))
  const tmdb = await tmdbSearchFn(q)
  return mergeMovies(custom, tmdb)
}
