<!-- src/overlays/MoviesOverlayLatest.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const isOpen = ref(false)

function open() { isOpen.value = true }
function close() { isOpen.value = false }

// Open by global event (works with Book now integration)
function onOpenEvt() { open() }

onMounted(() => {
  window.addEventListener('open-movie-overlay', onOpenEvt)
  // also expose global function (fallback)
  // @ts-ignore
  window.__openMovieOverlayLatest = open
})
onUnmounted(() => {
  window.removeEventListener('open-movie-overlay', onOpenEvt)
  // @ts-ignore
  delete window.__openMovieOverlayLatest
})
</script>

<template>
  <teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" @click.self="close">
      <div class="w-full max-w-6xl max-h-[88vh] overflow-auto rounded-2xl bg-white dark:bg-neutral-900 shadow-xl border border-gray-200 dark:border-neutral-800">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-neutral-800">
          <h3 class="text-lg font-semibold">Movies (Newest First)</h3>
          <button @click="close" class="h-9 w-9 rounded-full border flex items-center justify-center">✕</button>
        </div>
        <div class="p-5">
          <MovieListLatest />
        </div>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts">
export default { name: 'MoviesOverlayLatest' }
</script>

<script setup lang="ts">
import MovieListLatest from '@/components/MovieListLatest.vue'
</script>
