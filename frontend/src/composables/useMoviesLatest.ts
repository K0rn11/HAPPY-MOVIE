// src/composables/useMoviesLatest.ts
import { ref } from 'vue'

export type Movie = {
  id: number
  title: string
  durationMin: number
  rating?: string | null
  posterUrl?: string | null
  overview?: string | null
  createdAt: string
  active: boolean
}

export function useMoviesLatest() {
  const loading = ref(true)
  const errorMsg = ref<string | null>(null)
  const movies = ref<Movie[]>([])

  async function loadMovies(params: { active?: boolean } = { active: true }) {
    loading.value = true
    errorMsg.value = null
    try {
      const q = new URLSearchParams()
      if (params.active !== undefined) q.set('active', String(params.active))
      const res = await fetch(`/api/movies?${q.toString()}`, { headers: { 'accept': 'application/json' } })
      if (!res.ok) throw new Error('Failed to fetch movies')
      const data = await res.json()
      const list: Movie[] = Array.isArray(data?.movies) ? data.movies : []
      // Safeguard: newest first (createdAt DESC). Backend already orders DESC but this guarantees it.
      movies.value = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } catch (e: any) {
      errorMsg.value = e?.message || 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  return { loading, errorMsg, movies, loadMovies }
}
