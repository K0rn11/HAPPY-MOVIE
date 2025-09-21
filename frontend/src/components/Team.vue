<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import axios from "axios";
import BookingModal from "@/components/BookingModal.vue";
import SeatSelector from "@/components/SeatSelector.vue";
import Login from "@/components/Login.vue";
import Signup from "@/components/Signup.vue";
import { isLoggedIn as loggedIn } from "@/store/store";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits(["close"]);

/* TMDB */
const API_KEY =
  (import.meta as any).env?.VITE_TMDB_API_KEY || "745ee4aac9395b951f5dfbd7b2e8758c";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

/* API base */
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3001";

/* state */
type TMDBMovie = {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  genre_ids: number[];
  release_date?: string;
  vote_average?: number;
};
type TMDBGenre = { id: number; name: string };

const genres = ref<TMDBGenre[]>([]);
const movies = ref<TMDBMovie[]>([]);
const loading = ref(false);
const errorText = ref("");

const search = ref("");
const selectedGenre = ref<number | null>(null);
const page = ref(1);
const totalPages = ref(1);
const mode = computed(() => (search.value.trim().length >= 2 ? "search" : "now"));

/* booking flow */
const showBookingModal = ref(false);
const showSeatSelector = ref(false);
const selectedMovie = ref<TMDBMovie | null>(null);
const selectedDateTime = ref<{ date: string; time: string } | null>(null);
const currentShowtimeId = ref<number | null>(null);

/* helpers */
function posterUrl(p: string | null) {
  return p ? IMAGE_BASE_URL + p : "https://placehold.co/400x600?text=No+Image";
}
function truncate(text = "", len = 140) {
  return text.length > len ? text.slice(0, len) + "..." : text;
}
function toISO(dateStr: string, timeStr: string) {
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let h = 0, mnt = 0;
  if (m) {
    h = +m[1]; mnt = +m[2];
    const mer = m[3].toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
  } else {
    const n = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!n) throw new Error(`Invalid time: ${timeStr}`);
    h = +n[1]; mnt = +n[2];
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${dateStr}T${pad(h)}:${pad(mnt)}:00`).toISOString();
}

/* fetchers */
async function fetchGenres() {
  try {
    const url = `https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}&language=en-US`;
    const res = await fetch(url);
    const data = await res.json();
    genres.value = data?.genres ?? [];
  } catch (e) {
    console.error(e);
  }
}
async function fetchMovies(reset = false) {
  loading.value = true;
  errorText.value = "";
  try {
    const params = new URLSearchParams({
      api_key: API_KEY,
      language: "en-US",
      page: String(page.value),
    });
    let endpoint = "movie/now_playing";
    if (mode.value === "search") {
      endpoint = "search/movie";
      params.set("query", search.value.trim());
      params.set("include_adult", "false");
    }
    const url = `https://api.themoviedb.org/3/${endpoint}?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    totalPages.value = data?.total_pages || 1;
    const list: TMDBMovie[] = (data?.results || []).map((m: any) => ({
      id: m.id,
      title: m.title,
      overview: m.overview,
      poster_path: m.poster_path,
      genre_ids: m.genre_ids || [],
      release_date: m.release_date,
      vote_average: m.vote_average,
    }));
    movies.value = reset ? list : [...movies.value, ...list];
  } catch (e: any) {
    console.error(e);
    errorText.value = e?.message || "Failed to fetch movies";
  } finally {
    loading.value = false;
  }
}
function resetAndFetch() {
  page.value = 1;
  movies.value = [];
  fetchMovies(true);
}
function loadMore() {
  if (page.value < totalPages.value) {
    page.value += 1;
    fetchMovies(false);
  }
}

/* computed */
const filteredMovies = computed(() => {
  let list = movies.value;
  if (selectedGenre.value) list = list.filter((m) => m.genre_ids?.includes(selectedGenre.value!));
  return list;
});

/* effects */
watch(
  () => props.open,
  async (v) => {
    if (v) {
      if (!genres.value.length) await fetchGenres();
      if (!movies.value.length) await fetchMovies(true);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      // reset booking flow when overlay closed
      showBookingModal.value = false;
      showSeatSelector.value = false;
      selectedMovie.value = null;
      selectedDateTime.value = null;
      currentShowtimeId.value = null;
    }
  },
  { immediate: true }
);
let searchTimer: any = null;
watch(
  () => search.value,
  () => {
    clearTimeout(searchTimer);
    if (!props.open) return;
    searchTimer = setTimeout(() => resetAndFetch(), 400);
  }
);
watch(
  () => selectedGenre.value,
  () => {
    if (props.open && mode.value === "search") resetAndFetch();
  }
);

/* booking flow handlers */
async function startBooking(movie: TMDBMovie) {
  if (!loggedIn.value) {
    alert("กรุณาเข้าสู่ระบบหรือสมัครสมาชิกก่อนทำการจอง");
    return;
  }
  selectedMovie.value = movie;
  await nextTick();
  showBookingModal.value = true;
}
async function onDateTimeConfirm(data: { date: string; time: string }) {
  selectedDateTime.value = data;
  try {
    const startsAtISO = toISO(data.date, data.time);
    const durationMin = 120;
    const resp = await axios.post(`${API_BASE}/api/showtimes/ensure`, {
      title: selectedMovie.value?.title,
      startsAt: startsAtISO,
      theater: "Theater 1",
      basePrice: 120,
      durationMin,
    });
    currentShowtimeId.value = resp.data?.showtimeId;
    if (!currentShowtimeId.value)
      throw new Error(resp?.data?.error || "Cannot get showtimeId");
    showBookingModal.value = false;
    showSeatSelector.value = true;
  } catch (e: any) {
    console.error("ensure showtime failed:", e);
    alert(
      "ไม่สามารถสร้าง/ค้นหา Showtime ได้: " +
        (e?.response?.data?.error || e.message || "Unknown error")
    );
  }
}

/* explicit handlers */
function onBookingCancel() {
  showBookingModal.value = false;
}
function onSeatCancel() {
  showSeatSelector.value = false;
  showBookingModal.value = true;
}
function onPaidSuccess() {
  showSeatSelector.value = false;
  showBookingModal.value = false;
  selectedMovie.value = null;
  selectedDateTime.value = null;
  currentShowtimeId.value = null;
  emit("close");
}
function onOverlayClose() {
  emit("close");
}
</script>

<template>
  <!-- Overlay root -->
  <div v-if="open" class="fixed inset-0 z-[9998] overflow-y-auto overscroll-contain" tabindex="0">
    <!-- Backdrop (fade) -->
    <transition name="fade" appear>
      <div class="fixed inset-0 bg-black/70" aria-hidden="true" @click="onOverlayClose"></div>
    </transition>

    <!-- Panel (pop) -->
    <transition name="pop" appear>
      <div class="relative z-10 min-h-full flex items-start justify-center p-4">
        <div
          class="relative w-full max-w-6xl rounded-2xl shadow-2xl bg-zinc-900 text-white p-5 max-h-[90vh] overflow-y-auto"
          style="-webkit-overflow-scrolling: touch;"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header -->
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 class="text-xl font-semibold">Browse Movies</h2>
            <button class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700" @click="onOverlayClose">ปิด</button>
          </div>

          <!-- Force login (เหมือน MyTickets) -->
          <div v-if="!loggedIn" class="flex flex-col items-center justify-center text-center py-16">
            <div class="text-3xl mb-2">🔐</div>
            <div class="text-lg font-semibold mb-1">กรุณาเข้าสู่ระบบก่อน</div>
            <div class="text-sm opacity-80 mb-6">เพื่อเริ่มจองตั๋วภาพยนตร์ของคุณ</div>
            <div class="flex gap-2">
              <Login />
              <Signup />
            </div>
          </div>

          <!-- Content -->
          <template v-else>
            <!-- Controls -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input
                v-model="search"
                type="text"
                class="w-full rounded-lg px-3 py-2 text-sm text-black"
                placeholder="ค้นหาชื่อหนัง (พิมพ์อย่างน้อย 2 ตัวอักษร)..."
              />
              <select v-model="selectedGenre" class="w-full rounded-lg px-3 py-2 text-sm text-black">
                <option :value="null">All Genres</option>
                <option v-for="g in genres" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
              <div class="flex items-center justify-between md:justify-end gap-2">
              </div>
            </div>

            <div v-if="errorText" class="mb-3 text-red-300 text-sm">{{ errorText }}</div>

            <!-- List -->
            <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <template v-if="loading && movies.length === 0">
                <div v-for="i in 8" :key="i" class="rounded-xl overflow-hidden bg-zinc-800 animate-pulse h-[360px]" />
              </template>
              <template v-else>
                <div
                  v-for="m in filteredMovies"
                  :key="m.id"
                  class="rounded-xl overflow-hidden bg-zinc-800 hover:bg-zinc-700 transition flex flex-col"
                >
                  <img :src="posterUrl(m.poster_path)" :alt="m.title" class="w-full aspect-[2/3] object-cover" loading="lazy" />
                  <div class="p-3 flex-1 flex flex-col">
                    <div class="font-semibold truncate" :title="m.title">{{ m.title }}</div>
                    <div class="text-xs opacity-80">
                      <span v-if="m.release_date">📅 {{ m.release_date }}</span>
                      <span v-if="m.vote_average">&nbsp;• ⭐ {{ m.vote_average?.toFixed(1) }}</span>
                    </div>
                    <p class="mt-1 text-sm opacity-90 leading-snug">{{ truncate(m.overview, 120) }}</p>
                    <div class="mt-3">
                      <button class="w-full px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white" @click="startBooking(m)">
                        Book
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <div class="flex justify-center mt-4" v-if="movies.length && page < totalPages">
              <button class="px-4 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white disabled:opacity-50" :disabled="loading" @click="loadMore">
                {{ loading ? "Loading..." : "Load more" }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </transition>
  </div>

  <!-- Modals (teleported) -->
  <Teleport to="body">
    <BookingModal
      :key="selectedMovie?.id || 0"
      :visible="showBookingModal"
      :movie-id="selectedMovie?.id"
      @confirm="onDateTimeConfirm"
      @cancel="onBookingCancel"
    />
  </Teleport>

  <Teleport to="body">
    <SeatSelector
      :visible="showSeatSelector"
      :showtime-id="currentShowtimeId ?? 0"
      @cancel="onSeatCancel"
      @paid="onPaidSuccess"
    />
  </Teleport>
</template>

<style scoped>
/* --- smooth, production-like transitions (เหมือน Booking/MovieDetails) --- */
.fade-enter-from,
.fade-leave-to { opacity: 0 }
.fade-enter-active,
.fade-leave-active { transition: opacity .18s ease }

.pop-enter-from   { opacity: 0; transform: translateY(10px) scale(.985) }
.pop-leave-to     { opacity: 0; transform: translateY(10px) scale(.985) }
.pop-enter-active,
.pop-leave-active { transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s }
</style>
