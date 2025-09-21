<template>
  <div v-if="visible" class="fixed inset-0 z-[10030]">
    <!-- Backdrop -->
    <transition name="fade" appear>
      <div class="absolute inset-0 bg-black/70" @click="onCancel"></div>
    </transition>

    <!-- Modal -->
    <transition name="pop" appear>
      <div class="relative z-10 min-h-full flex items-start justify-center p-4">
        <div
          class="w-full max-w-4xl rounded-2xl bg-zinc-900 text-white border border-zinc-800/60 shadow-2xl overflow-hidden"
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
            <h3 class="text-lg font-semibold">เลือกที่นั่ง</h3>
            <button
              class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
              @click="onCancel"
            >Back</button>
          </div>

          <!-- Screen indicator -->
          <div class="px-6 pt-5">
            <div class="mx-auto max-w-[720px]">
              <div class="screen-wrap">
                <div class="screen-bar">Screen</div>
              </div>
            </div>
          </div>

          <!-- Seat grid -->
          <div class="px-6 pb-4 pt-2">
            <div class="mx-auto max-w-[720px] grid gap-2">
              <div
                v-for="row in rows"
                :key="row"
                class="flex justify-center gap-2"
              >
                <button
                  v-for="n in cols"
                  :key="row + n"
                  :class="seatClasses(row + n)"
                  :disabled="isLocked(row + n)"
                  @click="toggle(row + n)"
                >
                  {{ row + n }}
                </button>
              </div>
            </div>

            <!-- Legend -->
            <div class="mx-auto max-w-[720px] flex items-center gap-4 mt-5 text-sm">
              <div class="flex items-center gap-2">
                <span class="legend legend-normal"></span> Normal ({{ NORMAL_PRICE }} ฿)
              </div>
              <div class="flex items-center gap-2">
                <span class="legend legend-honey"></span> Honeymoon ({{ HONEYMOON_PRICE }} ฿)
              </div>
              <div class="ml-auto text-xs opacity-75">
                เลือกแล้ว: <span class="font-semibold">{{ selectedSeats.length }}</span> ใบ
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-zinc-800/60 flex items-center justify-between">
            <div class="text-sm">
              <span class="opacity-80">ที่เลือก:</span>
              <span class="font-medium ml-2">{{ selectedSeats.join(", ") || "-" }}</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="text-right">
                <div class="text-xs opacity-70">ยอดชำระ</div>
                <div class="text-2xl font-bold">{{ total.toLocaleString() }} ฿</div>
              </div>
              <button
                class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="selectedSeats.length === 0"
                @click="openPay"
              >
                ชำระเงิน
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Payment overlay (z-index สูงกว่า SeatSelector) -->
    <Payment
      :open="payOpen"
      :amount="total"
      :ref-code="refCode"
      :promptpay-id="PROMPTPAY_ID"
      :seats="selectedSeats"
      :showtime-id="showtimeId"
      :buyer-email="userEmail"
      @close="payOpen = false"
      @closed-all="onPaidAndCloseAll"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Payment from "./Payment.vue";

/** ========== Props / Emits ========== */
const props = defineProps<{
  visible: boolean;
  showtimeId: number;
}>();
const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "paid"): void; // ส่งให้ parent เมื่อชำระเสร็จ (Payment ปิดตัวเองครบ)
}>();

/** ========== Config ========== */
const rows = ["A","B","C","D","E","F","G","H"];
const cols = 10;
const NORMAL_PRICE = 120;
const HONEYMOON_PRICE = 200;
const PROMPTPAY_ID = "0812345678";

/** ========== State ========== */
const selectedSeats = ref<string[]>([]);
const lockedSeats = ref<Set<string>>(new Set()); // ถ้ามีระบบ lock ก็เติมที่นี่
const payOpen = ref(false);
const refCode = ref(makeRef());

/** ========== Helpers ========== */
function makeRef() {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  const rnd2 = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BK-${rnd}-${rnd2}`;
}

function isHoneymoon(seat: string) {
  // G1–G10 และ H1–H10
  return seat.startsWith("G") || seat.startsWith("H");
}

function seatPrice(seat: string) {
  return isHoneymoon(seat) ? HONEYMOON_PRICE : NORMAL_PRICE;
}

function isLocked(seat: string) {
  return lockedSeats.value.has(seat);
}

function toggle(seat: string) {
  if (isLocked(seat)) return;
  const idx = selectedSeats.value.indexOf(seat);
  if (idx >= 0) selectedSeats.value.splice(idx, 1);
  else selectedSeats.value.push(seat);
}

const total = computed(() =>
  selectedSeats.value.reduce((sum, s) => sum + seatPrice(s), 0)
);

/** UI classes per seat */
function seatClasses(seat: string) {
  const isSel = selectedSeats.value.includes(seat);
  const honey = isHoneymoon(seat);
  const locked = isLocked(seat);
  return [
    "w-10 h-10 sm:w-11 sm:h-11 rounded-md border text-xs sm:text-sm",
    "flex items-center justify-center transition",
    locked
      ? "bg-zinc-700 text-zinc-400 border-zinc-600 cursor-not-allowed"
      : isSel
      ? honey
        ? "bg-pink-600 text-white border-pink-500 shadow"
        : "bg-primary text-white border-primary shadow"
      : honey
      ? "bg-zinc-800 text-white border-pink-500/50 hover:bg-zinc-700"
      : "bg-zinc-800 text-white border-zinc-600 hover:bg-zinc-700",
  ];
}

/** user email (ถ้ามี) */
const userEmail = computed(() => {
  try {
    const raw = localStorage.getItem("auth_user");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return u?.email || u?.user?.email || "";
  } catch {
    return "";
  }
});

/** open / close */
watch(
  () => props.visible,
  (v) => {
    if (v) {
      selectedSeats.value = [];
      refCode.value = makeRef();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      payOpen.value = false;
    }
  },
  { immediate: true }
);

function onCancel() {
  emit("cancel");
}

/** เปิดชำระเงิน */
function openPay() {
  if (selectedSeats.value.length === 0) return;
  payOpen.value = true;
}

/** ชำระเสร็จ → แจ้ง parent ปิดทุกอย่าง */
function onPaidAndCloseAll() {
  payOpen.value = false;
  emit("paid");
}
</script>

<style scoped>
/* ----- Production-like transitions ----- */
.fade-enter-from,
.fade-leave-to { opacity: 0 }
.fade-enter-active,
.fade-leave-active { transition: opacity .18s ease }

.pop-enter-from   { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-leave-to     { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-enter-active,
.pop-leave-active { transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s }

/* ----- Screen indicator ----- */
.screen-wrap {
  position: relative;
  height: 36px;
  margin-bottom: 18px;
}
.screen-bar {
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 100%;
  border-radius: 0 0 24px 24px;
  background: linear-gradient(to bottom, rgba(255,255,255,.15), rgba(255,255,255,.05));
  border: 1px solid rgba(255,255,255,.15);
  backdrop-filter: blur(2px);
  text-align: center;
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: rgba(255,255,255,.75);
  display: flex; align-items: flex-end; justify-content: center;
  padding-bottom: 4px;
}

/* Legend */
.legend {
  width: 14px; height: 14px; border-radius: 4px; display: inline-block; border:1px solid;
}
.legend-normal { background:#27272a; border-color:#52525b; }
.legend-honey  { background:#27272a; border-color:#ec4899; }
</style>
