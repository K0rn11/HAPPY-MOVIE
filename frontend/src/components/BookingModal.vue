<template>
  <div v-if="visible" class="fixed inset-0 z-[10030]" :key="movieId">
    <!-- Backdrop -->
    <transition name="fade" appear>
      <div class="absolute inset-0 bg-black/70" @click="onCancel" />
    </transition>

    <!-- Panel -->
    <transition name="pop" appear>
      <div class="relative z-10 min-h-full flex items-start justify-center p-4">
        <div
          class="w-full max-w-lg rounded-2xl bg-zinc-900 text-white border border-zinc-800/60 shadow-2xl overflow-hidden"
          role="dialog" aria-modal="true"
        >
          <!-- Header -->
          <div class="flex items-center justify-between gap-3 p-5 border-b border-zinc-800/60">
            <h2 class="text-lg font-semibold">เลือกวันและเวลาฉาย</h2>
            <button class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700" @click="onCancel">
              ปิด
            </button>
          </div>

          <!-- Body -->
          <div class="p-5 space-y-4">
            <!-- Dates -->
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
                <div class="font-medium">{{ formatDOW(d) }}</div>
                <div class="text-xs opacity-80">{{ formatMD(d) }}</div>
              </button>
            </div>

            <!-- Times -->
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <button
                v-for="t in TIME_SLOTS"
                :key="t"
                class="px-3 py-2 rounded-lg border text-sm transition"
                :class="enabled(t)
                        ? (selectedTime === t
                            ? 'bg-primary text-white border-primary'
                            : 'bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700')
                        : 'bg-zinc-700/70 text-zinc-400 border-zinc-700 cursor-not-allowed'"
                :disabled="!enabled(t)"
                @click="pickTime(t)"
              >
                {{ t }}
              </button>
            </div>

            <div class="text-xs opacity-75 -mt-1">
              * เวลาที่เป็นสีเทาคือ <span class="italic">งดฉาย</span> ไม่สามารถกดเลือกได้
            </div>
          </div>

          <!-- Footer -->
          <div class="px-5 py-4 border-t border-zinc-800/60 flex items-center justify-between">
            <div class="text-sm">
              วันที่: <span class="font-medium">{{ selectedDate ? formatFull(selectedDate) : '-' }}</span>
              <span class="mx-2">•</span>
              เวลา: <span class="font-medium">{{ selectedTime || '-' }}</span>
            </div>

            <div class="flex gap-2">
              <button class="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700" @click="onCancel">ยกเลิก</button>
              <button
                class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!selectedDate || !selectedTime"
                @click="confirm"
              >ถัดไป</button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
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

const props = defineProps<{
  visible: boolean;
  movieId?: number | string | null;

  /** ค่าเริ่มต้น (มาจาก MovieDetails) เพื่อไม่ต้องเลือกซ้ำ */
  initialDate?: string | null;
  initialTime?: string | null;
  /** ถ้า true และทั้ง date+time พร้อม → auto-confirm ทันที */
  autoConfirm?: boolean;
}>();
const emit = defineEmits<{
  (e: "confirm", payload: { date: string; time: string }): void;
  (e: "cancel"): void;
}>();

/* ===== constants (คงชื่อเดิม) ===== */
const NEXT_DAYS = NEXT_DAYS_LIB;
const TIME_SLOTS = TIME_SLOTS_LIB;

/* ===== keep old function names but delegate ===== */
function buildDays(n = NEXT_DAYS) { return buildDaysLib(n); }
/* legacy keep */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function availableTimesFor(dateStr: string): Set<string> {
  return availableTimesForLib(props.movieId ?? null, dateStr);
}

/* ===== days & schedule ===== */
const days = ref<string[]>(buildDays());
const scheduleByDate = computed(() => {
  const m: Record<string, Set<string>> = {};
  for (const d of days.value) m[d] = availableTimesFor(d);
  return m;
});

/* ===== selection ===== */
const selectedDate = ref<string>(days.value[0] || "");
const selectedTime = ref<string>("");

function selectDate(d: string) {
  selectedDate.value = d;
  if (!scheduleByDate.value[d]?.has(selectedTime.value)) {
    selectedTime.value = "";
  }
}
function enabled(t: string) { return isTimeEnabledLib(scheduleByDate.value, selectedDate.value, t); }
function pickTime(t: string) { if (enabled(t)) selectedTime.value = t; }

/* ===== display helpers (คงชื่อเดิม) ===== */
function formatDOW(dateStr: string) { return formatDayOfWeekLib(dateStr); }
function formatMD(dateStr: string) { return formatMDLib(dateStr); }
function formatFull(dateStr: string) { return formatFullLib(dateStr); }

/* ===== actions ===== */
function confirm() {
  if (!selectedDate.value || !selectedTime.value) return;
  emit("confirm", { date: selectedDate.value, time: selectedTime.value });
}
function onCancel() { emit("cancel"); }

/* ===== lifecycle ===== */
async function applyInitialAndMaybeConfirm() {
  // เซ็ตวันเริ่มต้นถ้ามี
  if (props.initialDate) {
    if (!days.value.includes(props.initialDate)) {
      // ถ้าวันเริ่มต้นยังไม่อยู่ใน days (เช่นเปิด modal ตอนกลางคืนเปลี่ยนวัน)
      days.value = buildDays(NEXT_DAYS);
    }
    selectedDate.value = props.initialDate;
  }
  // เซ็ตเวลาเริ่มต้นถ้าเปิดฉายในวันนั้น
  if (props.initialTime && enabled(props.initialTime)) {
    selectedTime.value = props.initialTime;
  }

  // auto-confirm ถ้าเปิดใช้งานและมีค่าพร้อม
  if (props.autoConfirm && selectedDate.value && selectedTime.value) {
    await nextTick();
    confirm();
  }
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      days.value = buildDays(NEXT_DAYS);
      selectedDate.value = days.value[0] || "";
      selectedTime.value = "";
      await nextTick();
      await applyInitialAndMaybeConfirm();   // <<<< สำคัญ: รับค่าจาก MovieDetails
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  },
  { immediate: true }
);

// ถ้าระหว่างเปิด modal มีการอัปเดต initialDate/Time เพิ่ม ให้ sync ด้วย
watch(
  () => [props.initialDate, props.initialTime],
  async () => {
    if (!props.visible) return;
    await applyInitialAndMaybeConfirm();
  }
);
</script>

<style scoped>
/* Production-like transitions */
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease }

.pop-enter-from   { opacity: 0; transform: translateY(10px) scale(.985) }
.pop-leave-to     { opacity: 0; transform: translateY(10px) scale(.985) }
.pop-enter-active,
.pop-leave-active { transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s }

/* thin scrollbar for date row */
.scrollbar-thin::-webkit-scrollbar { height: 6px }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 99px }
</style>
