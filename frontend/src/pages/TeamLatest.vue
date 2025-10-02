<!-- src/pages/TeamLatest.vue -->
<script setup lang="ts">
// A separate page that renders the same latest-first list (keeps your original Team.vue untouched)
</script>

<template>
  <div class="min-h-[60vh]">
    <header class="mb-4">
      <h1 class="text-2xl md:text-3xl font-semibold">Now Playing (Newest First)</h1>
      <p class="opacity-70 text-sm">Admin-added movies always appear first.</p>
    </header>
    <MovieListLatest />
  </div>
</template>

<script setup lang="ts">
import MovieListLatest from '@/components/MovieListLatest.vue'
</script>
