<script setup lang="ts">
import { ref, computed, watch } from "vue";
import axios from "axios";
import { isLoggedIn } from "@/store/store";
import Login from "@/components/Login.vue";
import Signup from "@/components/Signup.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits(["close"]);

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3001";

type TicketItem = { id:number; seatLabel:string; price:number; createdAt:string };
type OrderItem = {
  orderId:number;
  refCode:string;
  status:string;
  totalAmount:number;
  createdAt:string;
  paidAt:string|null;
  buyerEmail:string|null;
  showtime: {
    id:number; theater:string; startsAt:string; basePrice:number;
    movie: { id:number; title:string; durationMin:number; rating:string|null } | null
  } | null;
  tickets: TicketItem[];
};

const loading = ref(false);
const errorText = ref("");
const orders = ref<OrderItem[]>([]);

const loggedIn = computed(() => isLoggedIn.value);

const currentEmail = computed(() => {
  try {
    const raw = localStorage.getItem("auth_user");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return u?.email || u?.user?.email || "";
  } catch { return ""; }
});

async function fetchTickets() {
  errorText.value = "";
  orders.value = [];
  if (!loggedIn.value) return;
  if (!currentEmail.value) {
    errorText.value = "ไม่พบอีเมลในระบบ กรุณาเข้าสู่ระบบใหม่";
    return;
  }
  loading.value = true;
  try {
    const { data } = await axios.get(`${API_BASE}/api/users/${encodeURIComponent(currentEmail.value)}/tickets`);
    if (!data?.ok) throw new Error(data?.error || "Fetch failed");
    orders.value = data.orders || [];
  } catch (e:any) {
    console.error(e);
    errorText.value = e?.response?.data?.error || e.message || "โหลดข้อมูลไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString(); }
  catch { return iso ?? "-"; }
}

const filtered = computed(() => orders.value);

watch(() => props.open, (v) => {
  if (v) {
    document.body.style.overflow = "hidden";
    if (loggedIn.value) fetchTickets();
  } else {
    document.body.style.overflow = "";
    orders.value = [];
    errorText.value = "";
  }
}, { immediate: true });

watch(loggedIn, (v) => {
  if (v && props.open) fetchTickets();
});

function closeOverlay() { emit("close"); }
function totalSeats(o: OrderItem) { return o.tickets.length; }
</script>

<template>
  <!-- ใช้ Transition ครอบทั้ง overlay เพื่อให้เข้า/ออกนุ่มนวล -->
  <Transition name="overlay" appear>
    <div v-if="open" class="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain">
      <!-- Backdrop มี transition แยก -->
      <Transition name="backdrop" appear>
        <div class="fixed inset-0 bg-black/70" @click="closeOverlay" aria-hidden="true"></div>
      </Transition>

      <!-- Panel หลักมี transition แบบ scale+fade -->
      <div class="relative z-10 min-h-full flex items-start justify-center p-4">
        <Transition name="panel" appear>
          <div
            class="relative w-full max-w-5xl rounded-2xl shadow-2xl bg-zinc-900 text-white p-5 max-h-[90vh] overflow-y-auto"
          >
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <h2 class="text-xl font-semibold">My Tickets</h2>
              <div class="flex items-center gap-2">
                <button class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors" @click="closeOverlay">ปิด</button>
                <button
                  class="px-3 py-1.5 rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors"
                  @click="fetchTickets" :disabled="loading || !loggedIn"
                >
                  {{ loading ? 'Loading...' : 'Refresh' }}
                </button>
              </div>
            </div>

            <!-- Force login -->
            <div v-if="!loggedIn" class="flex flex-col items-center justify-center text-center py-16">
              <div class="text-3xl mb-2">🔐</div>
              <div class="text-lg font-semibold mb-1">กรุณาเข้าสู่ระบบก่อน</div>
              <div class="text-sm opacity-80 mb-6">เพื่อดูรายการตั๋วหนังของคุณ</div>
              <div class="flex gap-2">
                <Login />
                <Signup />
              </div>
            </div>

            <!-- Content -->
            <template v-else>
              <div class="text-right text-xs opacity-75 mb-3">
                บัญชี: <span class="font-mono">{{ currentEmail || '-' }}</span>
              </div>

              <div v-if="errorText" class="mb-3 text-red-300 text-sm">{{ errorText }}</div>

              <!-- Empty -->
              <Transition name="fade" appear>
                <div v-if="!loading && filtered.length === 0" class="text-center py-10 opacity-80">
                  <div class="text-3xl mb-1">🎟️</div>
                  <div class="font-medium">ยังไม่มีรายการตั๋ว</div>
                  <div class="text-sm">เมื่อซื้อ/จองสำเร็จ ตั๋วจะปรากฏที่นี่</div>
                </div>
              </Transition>

              <!-- Cards with TransitionGroup -->
              <TransitionGroup name="ticket" tag="div" class="space-y-6 md:space-y-7 lg:space-y-8 mt-2" appear>
                <div
                  v-for="o in filtered" :key="o.orderId"
                  class="rounded-xl overflow-hidden bg-zinc-800/95 border border-zinc-700 shadow-lg shadow-black/20 hover:shadow-xl transition-shadow"
                >
                  <div class="p-4 flex flex-col md:flex-row md:items-start gap-4">
                    <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-600/30" v-if="o.status === 'paid'">PAID</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-yellow-600/20 text-yellow-300 border border-yellow-600/30" v-else-if="o.status === 'pending'">PENDING</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-600/30" v-else>CANCELED</span>

                        <span class="text-xs opacity-70">Ref:</span>
                        <span class="font-mono text-xs">{{ o.refCode }}</span>
                      </div>

                      <div class="mt-2 font-semibold text-lg truncate">
                        {{ o.showtime?.movie?.title || 'Untitled Movie' }}
                      </div>

                      <div class="text-sm opacity-85">
                        โรง: <span class="font-medium">{{ o.showtime?.theater || '-' }}</span>
                        • เวลา: <span class="font-medium">{{ formatDateTime(o.showtime?.startsAt) }}</span>
                      </div>

                      <div class="mt-1 text-sm opacity-80">
                        สถานะคำสั่งซื้อ: <span class="font-medium">{{ o.status }}</span>
                        <span v-if="o.paidAt"> • ชำระเมื่อ: <span class="font-medium">{{ formatDateTime(o.paidAt) }}</span></span>
                      </div>

                      <div class="mt-2 text-sm">
                        ที่นั่ง:
                        <span class="font-medium">{{ o.tickets.map(t=>t.seatLabel).join(', ') }}</span>
                        <span class="opacity-70"> ({{ totalSeats(o) }} ใบ)</span>
                      </div>
                    </div>

                    <div class="md:w-48 shrink-0 self-center md:self-start text-right">
                      <div class="text-xs opacity-70">ยอดรวม</div>
                      <div class="text-2xl font-bold">{{ o.totalAmount.toLocaleString() }} ฿</div>
                      <div class="text-xs opacity-70 mt-1">สั่งเมื่อ</div>
                      <div class="text-sm">{{ formatDateTime(o.createdAt) }}</div>
                    </div>
                  </div>

                  <div class="px-4 pb-4 flex flex-wrap gap-2">
                    <span
                      v-for="t in o.tickets" :key="t.id"
                      class="px-2 py-1 text-xs rounded bg-zinc-700/60 border border-zinc-600"
                      :title="`฿${t.price} • ออกเมื่อ ${formatDateTime(t.createdAt)}`"
                    >🎟️ {{ t.seatLabel }}</span>
                  </div>
                </div>
              </TransitionGroup>

              <Transition name="fade" appear>
                <div v-if="loading" class="text-center py-4 opacity-80">กำลังโหลด…</div>
              </Transition>
            </template>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Backdrop fade */
.backdrop-enter-from,
.backdrop-leave-to { opacity: 0; }
.backdrop-enter-active,
.backdrop-leave-active { transition: opacity .25s ease; }

/* Whole overlay container (for safety) */
.overlay-enter-from,
.overlay-leave-to { opacity: 0; }
.overlay-enter-active,
.overlay-leave-active { transition: opacity .25s ease; }

/* Panel scale + elevate */
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(.98);
  filter: saturate(.9);
}
.panel-enter-active,
.panel-leave-active {
  transition:
    opacity .28s cubic-bezier(.22,.61,.36,1),
    transform .32s cubic-bezier(.22,.61,.36,1),
    filter .28s ease;
}

/* List items (TransitionGroup) */
.ticket-enter-from,
.ticket-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.ticket-enter-active,
.ticket-leave-active {
  transition: all .22s ease;
}
.ticket-move { transition: transform .22s ease; }

/* Simple fade (loading/empty) */
.fade-enter-from,
.fade-leave-to { opacity: 0; }
.fade-enter-active,
.fade-leave-active { transition: opacity .2s ease; }
</style>
