<template>
  <div v-if="open" class="fixed inset-0 z-[10020]">
    <!-- Backdrop -->
    <transition name="fade" appear>
      <div class="absolute inset-0 bg-black/70" @click="$emit('close')" />
    </transition>

    <!-- Panel -->
    <transition name="pop" appear>
      <div class="relative z-10 min-h-full flex items-start justify-center p-4">
        <div
          class="w-full max-w-3xl rounded-2xl bg-zinc-900 text-white border border-zinc-800/60 shadow-2xl overflow-hidden"
          role="dialog" aria-modal="true"
        >
          <!-- Header -->
          <div class="flex items-start gap-4 p-5 border-b border-zinc-800/60">
            <img
              :src="posterUrl(movie?.poster_path ?? null)"
              :alt="movie?.title || 'poster'"
              class="w-24 h-36 rounded-lg object-cover flex-shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-3">
                <h2 class="text-xl font-semibold truncate" :title="movie?.title">{{ movie?.title }}</h2>
                <button class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700" @click="$emit('close')">ปิด</button>
              </div>
              <p class="text-sm opacity-80 mt-1 line-clamp-3">{{ movie?.overview }}</p>
            </div>
          </div>

          <!-- ถ้ายังไม่ได้ล็อกอิน: แสดงแบบเดียวกับ MyTicket -->
          <div v-if="!loggedIn" class="flex flex-col items-center justify-center text-center py-16">
            <div class="text-3xl mb-2">🔐</div>
            <div class="text-lg font-semibold mb-1">กรุณาเข้าสู่ระบบก่อน</div>
            <div class="text-sm opacity-80 mb-6">เพื่อเริ่มจองตั๋วภาพยนตร์ของคุณ</div>
            <div class="flex gap-2">
              <Login />
              <Signup />
            </div>
          </div>

          <!-- Schedule Controls -->
          <template v-else>
            <div class="p-5 space-y-4">
              <!-- Dates row -->
              <div class="flex items-center gap-2 overflow-x-auto scrollbar-thin">
                <button
                  v-for="d in days"
                  :key="d"
                  class="px-3 py-2 rounded-lg border text-sm transition whitespace-nowrap"
                  :class="selectedDate === d
                          ? 'bg-primary text-white border-primary'
                          : 'bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700'"
                  @click="selectDate(d)"
                >
                  <div class="font-medium">{{ formatDayOfWeek(d) }}</div>
                  <div class="text-xs opacity-80">{{ formatMD(d) }}</div>
                </button>
              </div>

              <!-- Time slots -->
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <button
                  v-for="t in TIME_SLOTS"
                  :key="t"
                  class="px-3 py-2 rounded-lg border text-sm transition"
                  :class="timeEnabled(t)
                          ? (selectedTime === t
                              ? 'bg-primary text-white border-primary'
                              : 'bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700')
                          : 'bg-zinc-700/70 text-zinc-400 border-zinc-700 cursor-not-allowed'"
                  :disabled="!timeEnabled(t)"
                  @click="onPickTime(t)"
                >
                  {{ t }}
                </button>
              </div>

              <div class="text-xs opacity-75 -mt-1">
                * วัน/เวลาที่เป็นสีเทาคือ <span class="italic">งดฉาย</span> ไม่สามารถกดเลือกได้
              </div>
            </div>

            <!-- Footer -->
            <div class="px-5 py-4 border-t border-zinc-800/60 flex items-center justify-between">
              <div class="text-sm">
                วันที่: <span class="font-medium">{{ selectedDate ? formatFull(selectedDate) : '-' }}</span>
                <span class="mx-2">•</span>
                เวลา: <span class="font-medium">{{ selectedTime || '-' }}</span>
              </div>

              <button
                class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!selectedDate || !selectedTime"
                @click="openBooking"
              >
                เพิ่มเติม
              </button>
            </div>
          </template>
        </div>
      </div>
    </transition>

    <!-- BookingModal -->
    <BookingModal
      :visible="bookingOpen"
      :movie-id="movie?.id || null"
      :initial-date="selectedDate || null"
      :initial-time="selectedTime || null"
      :auto-confirm="true"
      @confirm="onBookingConfirm"
      @cancel="bookingOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import BookingModal from "@/components/BookingModal.vue";
import Login from "@/components/Login.vue";
import Signup from "@/components/Signup.vue";
import { isLoggedIn as loggedIn } from "@/store/store";

import {
  NEXT_DAYS as NEXT_DAYS_LIB,
  TIME_SLOTS as TIME_SLOTS_LIB,
  buildDays as buildDaysLib,
  isTimeEnabled as isTimeEnabledLib,
  formatDayOfWeek as formatDayOfWeekLib,
  formatMD as formatMDLib,
  formatFull as formatFullLib,
  availableTimesFor as availableTimesForLib,
} from "@/utils/useShowtimes";

type Movie = { id:number; title:string; overview:string; poster_path:string|null } | null;

const props = defineProps<{ open: boolean; movie: Movie }>();
const emit = defineEmits<{ (e:"close"): void; (e:"book", p:{date:string; time:string}): void }>();

/* Images */
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
/** รองรับทั้ง URL เต็ม (http/https) และ TMDB path (/xxx.jpg) */
function posterUrl(p: string | null) {
  if (!p) return "https://placehold.co/400x600?text=No+Image";
  if (/^https?:\/\//i.test(p)) return p;        // กรณีหนังจากแอดมินเพิ่ม (URL เต็ม)
  return IMAGE_BASE_URL + p;                     // กรณี TMDB
}

/* keep constants */
const NEXT_DAYS = NEXT_DAYS_LIB;
const TIME_SLOTS = TIME_SLOTS_LIB;

/* keep function names but delegate */
function buildDays(n = NEXT_DAYS) { return buildDaysLib(n); }
// legacy keep (บางไฟล์ import ไว้แล้ว)
function mulberry32(_seed:number){ return () => 0; }
function availableTimesFor(dateStr:string){
  return availableTimesForLib(props.movie?.id ?? null, dateStr);
}

/* days & schedule */
const days = ref<string[]>(buildDays(NEXT_DAYS));
const scheduleByDate = computed(() => {
  const map: Record<string, Set<string>> = {};
  for (const d of days.value) map[d] = availableTimesFor(d);
  return map;
});

/* selection */
const selectedDate = ref<string>(days.value[0] || "");
const selectedTime = ref<string>("");

function selectDate(d:string){
  selectedDate.value = d;
  if (!scheduleByDate.value[d]?.has(selectedTime.value)) selectedTime.value = "";
}
function timeEnabled(t:string){ return isTimeEnabledLib(scheduleByDate.value, selectedDate.value, t); }
function onPickTime(t:string){ if (timeEnabled(t)) selectedTime.value = t; }

/* booking modal control */
const bookingOpen = ref(false);
function openBooking(){ bookingOpen.value = true; }
function onBookingConfirm(p:{date:string; time:string}){
  bookingOpen.value = false;
  emit("book", p);
}

/* display helpers */
function formatDayOfWeek(d:string){ return formatDayOfWeekLib(d); }
function formatMD(d:string){ return formatMDLib(d); }
function formatFull(d:string){ return formatFullLib(d); }

/* reset เมื่อเปิด overlay ใหม่ หรือเปลี่ยนหนัง */
watch(
  () => [props.open, props.movie?.id],
  () => {
    if (!props.open) {
      bookingOpen.value = false;    // ป้องกัน modal ค้าง
      return;
    }
    days.value = buildDays(NEXT_DAYS);
    selectedDate.value = days.value[0] || "";
    selectedTime.value = "";
  },
  { immediate: true }
);
</script>

<style scoped>
/* --- smooth, production-like transitions --- */
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease }

.pop-enter-from   { opacity: 0; transform: translateY(10px) scale(.985) }
.pop-leave-to     { opacity: 0; transform: translateY(10px) scale(.985) }
.pop-enter-active, .pop-leave-active { transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s }

.scrollbar-thin::-webkit-scrollbar { height: 6px }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 99px }
</style>
