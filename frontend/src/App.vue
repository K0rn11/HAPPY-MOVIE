<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import axios from "axios";
import Navbar from "@/components/Navbar.vue";
import MyTicket from "@/components/MyTicket.vue";
import Support from "@/components/Support.vue";
import SeatSelector from "@/components/SeatSelector.vue";
import MovieDetails from "@/components/MovieDetails.vue";
import AdminPromotions from "@/components/AdminPromotions.vue";
import Login from "@/components/Login.vue";
import Signup from "@/components/Signup.vue";
import { isLoggedIn } from "@/store/store";
import TopAdvertisement from "./components/TopAdvertisement.vue";

/* ---------- Config & Types ---------- */
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const API_KEY  = (import.meta as any).env?.VITE_TMDB_API_KEY || "745ee4aac9395b951f5dfbd7b2e8758c";
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3001";

type Movie = {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  createdAt?: string;
  posterUrl?: string | null;
};

/* ---------- overlay states ---------- */
const myTicketOpen = ref(false);
const supportOpen  = ref(false);
const adminOpen    = ref(false);

/* open/close overlays through CustomEvent */
const onOpenOverlay = (e: Event) => {
  const d = (e as CustomEvent).detail || {};
  if (d.target === "ticket")  myTicketOpen.value = true;
  if (d.target === "support") supportOpen.value  = true;
  if (d.target === "admin")   adminOpen.value    = true;
};
const onCloseAllOverlays = () => {
  myTicketOpen.value = false;
  supportOpen.value  = false;
  adminOpen.value    = false;
  detailsOpen.value  = false;
  showSeatSelector.value = false;
};

/* ---------- Home: Now Playing (TMDB + Local first) ---------- */
const movies = ref<Movie[]>([]);           // TMDB
const localMoviesHome = ref<Movie[]>([]);  // Local (admin)
const moviesHome = computed<Movie[]>(() => [
  ...localMoviesHome.value,                // ✅ Local มาก่อนเสมอ
  ...movies.value,
]);

const posterUrl = (p: string | null): string => {
  if (!p) return "https://placehold.co/400x600?text=No+Image";
  return p.startsWith("http") ? p : (IMAGE_BASE_URL + p);
};
const truncate = (text = "", len = 100): string =>
  text.length > len ? text.slice(0, len) + "..." : text;

const fetchNowPlaying = async (): Promise<void> => {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}&language=en-US&page=1`
    );
    const data = await res.json();
    movies.value = (data?.results || []).map((m: any) => ({
      id: m.id,
      title: m.title,
      overview: m.overview,
      poster_path: m.poster_path,
    }));
  } catch (e) {
    console.error(e);
  }
};

const fetchLocalMoviesHome = async (): Promise<void> => {
  try {
    const res = await fetch(`${API_BASE}/api/movies?active=true`, {
      headers: { accept: "application/json" },
      // cache bust (กัน proxy/browser ค้าง)
      cache: "no-store",
    });
    const data = await res.json();
    let arr = Array.isArray(data?.movies) ? data.movies : [];
    arr = arr
      .map((m: any) => ({
        id: Number(m.id),
        title: m.title,
        overview: m.overview || "",
        poster_path: m.posterUrl || null,
        createdAt: m.createdAt,
      }))
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    localMoviesHome.value = arr;
  } catch (e) {
    console.error(e);
  }
};

/* ---- refresh helpers ---- */
function refreshLocalMovies() {
  fetchLocalMoviesHome();
}
function onMoviesChanged() {
  refreshLocalMovies();
}
function onVisibility() {
  if (!document.hidden) refreshLocalMovies();
}

/* ---- cross-tab / cross-window channel ---- */
let bc: BroadcastChannel | null = null;
function setupBroadcastChannel() {
  try {
    bc = new BroadcastChannel("admin-updates");
    bc.onmessage = (e) => {
      if (!e?.data) return;
      if (e.data === "movies") refreshLocalMovies();
    };
  } catch {
    // บราวเซอร์เก่าที่ไม่รองรับ BroadcastChannel จะเงียบๆ ไว้
  }
}

/* ---- polling กันเหนียว (เผื่อแอดมินหน้าอื่นไม่ยิง event) ---- */
let pollTimer: number | undefined;

/* mount + global overlay listeners */
onMounted(() => {
  fetchNowPlaying();
  refreshLocalMovies();

  window.addEventListener("open-overlay", onOpenOverlay as EventListener);
  window.addEventListener("close-all-overlays", onCloseAllOverlays as EventListener);

  // 1) CustomEvent ภายในหน้า
  window.addEventListener("movies-changed", onMoviesChanged as EventListener);

  // 2) focus กลับมา
  document.addEventListener("visibilitychange", onVisibility);

  // 3) storage (จากการ setItem ในหน้าผู้ดูแล หรืออีกแท็บ)
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === "movies:updated") refreshLocalMovies();
  });

  // 4) BroadcastChannel
  setupBroadcastChannel();

  // 5) Poll ทุก 15s กันพลาด
  pollTimer = window.setInterval(refreshLocalMovies, 15000);
});

onBeforeUnmount(() => {
  window.removeEventListener("open-overlay", onOpenOverlay as EventListener);
  window.removeEventListener("close-all-overlays", onCloseAllOverlays as EventListener);
  window.removeEventListener("movies-changed", onMoviesChanged as EventListener);
  document.removeEventListener("visibilitychange", onVisibility);
  if (pollTimer) clearInterval(pollTimer);
  try { bc?.close(); } catch {}
});

/* ถ้าปิดหน้า Admin ใดๆ แล้ว ให้รีเฟรช */
watch(adminOpen, (v, prev) => {
  if (prev === true && v === false) {
    refreshLocalMovies();
  }
});

/* ---------- Details overlay ---------- */
const detailsOpen  = ref(false);
const detailsMovie = ref<Movie | null>(null);
const openDetails  = (m: Movie) => { detailsMovie.value = m; detailsOpen.value = true; };
const closeDetails = () => { detailsOpen.value = false; detailsMovie.value = null; };

/* ---------- Booking from Details ---------- */
const toISO = (dateStr: string, timeStr: string): string => {
  const ampm = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let h = 0, mm = 0;
  if (ampm) {
    h = +ampm[1]; mm = +ampm[2];
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
  } else {
    const n = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!n) throw new Error(`Invalid time: ${timeStr}`);
    h = +n[1]; mm = +n[2];
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${dateStr}T${pad(h)}:${pad(mm)}:00`).toISOString();
};

const showSeatSelector   = ref(false);
const currentShowtimeId  = ref<number | null>(null);
const selectedDateTime   = ref<{date:string; time:string} | null>(null);

/* login guard */
const loginNeededOpen = ref(false);
const pendingBooking  = ref<{date:string; time:string} | null>(null);

const requireLoginThen = (payload: {date:string; time:string}) => {
  if (!isLoggedIn.value) {
    pendingBooking.value = payload;
    loginNeededOpen.value = true;
    return false;
  }
  return true;
};
watch(isLoggedIn, async (v) => {
  if (v && loginNeededOpen.value && pendingBooking.value && detailsMovie.value) {
    const payload = pendingBooking.value;
    loginNeededOpen.value = false;
    pendingBooking.value = null;
    await handleBookFromDetails(payload);
  }
});

const handleBookFromDetails = async (payload: { date: string; time: string }) => {
  if (!detailsMovie.value) return;
  if (!requireLoginThen(payload)) return;

  selectedDateTime.value = payload;
  try {
    const startsAtISO = toISO(payload.date, payload.time);
    const resp = await axios.post(`${API_BASE}/api/showtimes/ensure`, {
      title: detailsMovie.value.title,
      startsAt: startsAtISO,
      theater: "Theater 1",
      basePrice: 120,
      durationMin: 120,
    });
    const id = resp.data?.showtimeId;
    if (!id) throw new Error(resp?.data?.error || "Cannot get showtimeId");
    currentShowtimeId.value = id;

    detailsOpen.value = false;
    showSeatSelector.value = true;
  } catch (e: any) {
    console.error(e);
    alert("ไม่สามารถสร้าง/ค้นหา Showtime ได้: " + (e?.response?.data?.error || e.message || "Unknown error"));
  }
};

/* After paid */
const onPaidSuccess = () => {
  showSeatSelector.value = false;
  detailsOpen.value = false;
  detailsMovie.value = null;
  selectedDateTime.value = null;
  currentShowtimeId.value = null;
};

/* Back from seat selector to details */
const onSeatCancel = () => {
  showSeatSelector.value = false;
  if (detailsMovie.value) detailsOpen.value = true;
};
</script>

<template>
  <div class="min-h-screen">
    <Navbar
      @open-myticket="myTicketOpen = true"
      @open-support="supportOpen = true"
    />

    <TopAdvertisement />

    <!-- Home: Now Playing -->
    <section class="container lg:w-[75%] py-10">
      <h2 class="text-2xl font-bold mb-4">Now Playing</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          v-for="m in moviesHome" :key="m.id"
          class="rounded-xl overflow-hidden bg-muted/60 dark:bg-card flex flex-col"
        >
          <img :src="posterUrl(m.poster_path)" :alt="m.title" class="w-full aspect-[2/3] object-cover" loading="lazy" />
          <div class="p-4 flex-1 flex flex-col">
            <div class="font-semibold truncate mb-1" :title="m.title">{{ m.title }}</div>
            <p class="text-sm text-muted-foreground mb-3">{{ truncate(m.overview, 120) }}</p>
            <button
              class="mt-auto px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white"
              @click="openDetails(m)"
            >
              เพิ่มเติม
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Overlays -->
    <MyTicket :open="myTicketOpen" @close="myTicketOpen = false" />
    <Support  :open="supportOpen"  @close="supportOpen = false" />
    <AdminPromotions :open="adminOpen" @close="adminOpen = false" />

    <!-- Movie Details Overlay -->
    <MovieDetails
      :open="detailsOpen"
      :movie="detailsMovie"
      @close="closeDetails"
      @book="handleBookFromDetails"
    />

    <!-- Seat Selector -->
    <SeatSelector
      :visible="showSeatSelector"
      :showtime-id="currentShowtimeId ?? 0"
      @cancel="onSeatCancel"
      @paid="onPaidSuccess"
    />

    <!-- Login Required -->
    <div v-if="loginNeededOpen" class="fixed inset-0 z-[10040]">
      <div class="absolute inset-0 bg-black/70" @click="loginNeededOpen=false"></div>
      <div class="relative mx-auto my-10 p-5 w-[92vw] max-w-[520px] rounded-2xl shadow-2xl bg-zinc-900 text-white">
        <div class="flex items-start justify-between gap-3 mb-3">
          <h3 class="text-lg font-semibold">กรุณาเข้าสู่ระบบก่อนทำการจอง</h3>
          <button class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700" @click="loginNeededOpen=false">ปิด</button>
        </div>
        <p class="text-sm opacity-80 mb-4">
          โปรดเลือก <span class="font-semibold">Login</span> หรือ <span class="font-semibold">Sign Up</span>
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col items-stretch gap-1">
            <Login />
            <span class="text-xs text-center opacity-80">Login</span>
          </div>
          <div class="flex flex-col items-stretch gap-1">
            <Signup />
            <span class="text-xs text-center opacity-80">Sign Up</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
