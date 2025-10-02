<!-- src/components/MovieListLatest.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useMoviesLatest } from '@/composables/useMoviesLatest'

const props = withDefaults(defineProps<{ activeOnly?: boolean }>(), { activeOnly: true })
const { loading, errorMsg, movies, loadMovies } = useMoviesLatest()

onMounted(() => loadMovies({ active: props.activeOnly }))

function emitOpenDetails(id: number) {
  // Emit an event; parent can decide how to show details.
  // Or replace with router push if you prefer.
  const ev = new CustomEvent('open-movie-details', { detail: { id } })
  window.dispatchEvent(ev)
}
</script>

<template>
  <div>
    <div v-if="loading" class="py-10 text-center opacity-70">Loading movies…</div>
    <div v-else-if="errorMsg" class="py-10 text-center text-red-600">{{ errorMsg }}</div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
      <div v-for="m in movies" :key="m.id" class="group cursor-pointer" @click="emitOpenDetails(m.id)">
        <div class="aspect-[2/3] w-full overflow-hidden rounded-xl border border-gray-200/70 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800">
          <img v-if="m.posterUrl" :src="m.posterUrl" :alt="m.title" class="h-full w-full object-cover group-hover:scale-[1.03] transition" />
          <div v-else class="h-full w-full flex items-center justify-center text-xs opacity-60">No Poster</div>
        </div>
        <div class="pt-2">
          <h3 class="font-medium leading-tight line-clamp-2">{{ m.title }}</h3>
          <div class="text-xs opacity-70">
            <span v-if="m.durationMin">{{ m.durationMin }} min</span>
            <span v-if="m.rating" class="ml-2">• {{ m.rating }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
