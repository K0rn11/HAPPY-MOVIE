import axios from 'axios'
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:3001'

export async function fetchPublicMovies(q = '', limit = 50) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (limit) params.set('limit', String(limit))
  const url = `${API_BASE}/api/movies${params.toString() ? `?${params.toString()}` : ''}`

  const { data } = await axios.get(url)
  if (!data?.ok) throw new Error(data?.error || 'Load movies failed')

  // fallback sort client-side อีกชั้น เผื่อ proxy/cdn ทำลำดับเพี้ยน
  const items = (data.movies || []).slice().sort((a: any, b: any) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0
    if (tb !== ta) return tb - ta
    return Number(b.id) - Number(a.id)
  })
  return items
}
