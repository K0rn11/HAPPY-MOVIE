// src/boot/moviesOverlayLatest.ts
// Insert-only boot file: import this once in your main.ts without removing your existing overlay.
// It globally mounts MoviesOverlayLatest by simply importing this module.

import { createApp, h } from 'vue'
import MoviesOverlayLatest from '@/overlays/MoviesOverlayLatest.vue'

// Create a DOM root
const id = 'movie-overlay-latest-root'
let mount = document.getElementById(id)
if (!mount) {
  mount = document.createElement('div')
  mount.id = id
  document.body.appendChild(mount)
}

// Mount a standalone Vue app just for the overlay (does not interfere with your main app)
const app = createApp({ render: () => h(MoviesOverlayLatest) })
app.mount(mount)

// After this, calling window.dispatchEvent(new CustomEvent('open-movie-overlay'))
// or window.__openMovieOverlayLatest?.() will open the latest overlay.
