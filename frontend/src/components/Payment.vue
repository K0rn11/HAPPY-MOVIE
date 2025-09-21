<template>
  <div v-if="open" class="fixed inset-0 z-[10050]">
    <transition name="fade" appear>
      <div class="absolute inset-0 bg-black/70" @click="$emit('close')" />
    </transition>

    <transition name="pop" appear>
      <div
        class="relative mx-auto my-6 p-5 w-[92vw] max-w-[560px] rounded-2xl shadow-2xl border border-zinc-800/60"
        style="background:#111; color:#fff; backdrop-filter: blur(2px);"
      >
        <div class="flex items-center justify-between gap-3 mb-2">
          <h2 class="text-lg font-semibold">ชำระเงินด้วยพร้อมเพย์</h2>
          <button
            :disabled="processing"
            @click="$emit('close')"
            class="px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >ปิด</button>
        </div>

        <div class="text-xs opacity-80">เลขอ้างอิง</div>
        <div class="font-mono break-all text-sm mb-2">{{ refCode }}</div>

        <!-- Amount + Discount -->
        <div class="text-xs opacity-80">ยอดชำระ</div>
        <div class="text-2xl font-bold mb-1">
          <template v-if="promoApplied && finalTotal < amount">
            <span class="line-through opacity-60 text-lg mr-2">{{ amount.toLocaleString() }} ฿</span>
            <span>{{ finalTotal.toLocaleString() }} ฿</span>
          </template>
          <template v-else>
            {{ amount.toLocaleString() }} ฿
          </template>
        </div>
        <div v-if="promoApplied" class="text-xs opacity-80 mb-2">
          ส่วนลด: -{{ discountAmount.toLocaleString() }} ฿ (โค้ด: <span class="font-mono">{{ promoCode }}</span>)
          <button class="ml-2 underline hover:opacity-80" @click="clearPromo" :disabled="processing">ยกเลิกโค้ด</button>
        </div>

        <!-- Promo code input -->
        <div class="mt-3 mb-3 p-3 rounded-lg bg-zinc-800/60 border border-zinc-700">
          <label class="text-sm block mb-1">Promotion Code</label>
          <div class="flex gap-2">
            <input
              v-model="promoCode"
              :disabled="processing"
              class="flex-1 rounded-lg px-3 py-2 text-sm text-black"
              placeholder="ใส่โค้ดส่วนลด (เช่น MOVIE50)"
            />
            <button
              @click="applyPromo"
              :disabled="processing || !promoCode.trim()"
              class="px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white disabled:opacity-50"
            >
              ใช้งาน
            </button>
          </div>
          <div v-if="promoError" class="text-xs text-red-300 mt-1">{{ promoError }}</div>
          <div v-if="promoApplied && promoInfo" class="text-xs text-emerald-300 mt-1">
            ใช้โค้ดแล้ว: {{ promoInfo.code }} — {{ promoInfo.label }}
          </div>
        </div>

        <!-- QR -->
        <div class="flex justify-center py-3">
          <canvas ref="qrCanvas" class="bg-white p-2 rounded-xl"></canvas>
        </div>
        <p class="text-center text-xs opacity-70">สแกนด้วยแอปธนาคารที่รองรับพร้อมเพย์</p>

        <div v-if="secondsLeft > 0" class="text-center text-sm mt-2">
          กรุณาชำระภายใน <span class="font-semibold">{{ secondsLeft }}</span> วินาที
        </div>

        <!-- Processing / Success / Error -->
        <div class="mt-4 p-3 rounded-lg text-center"
             :style="processing ? 'background:#0b1325;border:1px solid #153b71' : (success ? 'background:#0b1f14;border:1px solid #1e7f53' : (errorText ? 'background:#2b1111;border:1px solid #7a1f1f' : ''))">
          <div v-if="processing" class="flex items-center justify-center gap-3">
            <span class="spinner" aria-hidden="true"></span>
            <span class="tracking-wide">Processing...</span>
          </div>
          <div v-else-if="success" class="flex flex-col items-center justify-center gap-2 text-emerald-400 font-medium">
            <div class="flex items-center gap-2">
              <span class="check"></span>
              ชำระเงินเสร็จสิ้น
            </div>
            <div class="text-sm text-emerald-300">
              ระบบได้ส่งตั๋วหนังไปยัง Email เรียบร้อยแล้ว
              <span v-if="buyerEmail">(<span class="font-mono">{{ buyerEmail }}</span>)</span>
            </div>
            <div class="text-xs opacity-80 mt-1">
              หน้าต่างนี้จะปิดเองใน {{ closeCountdown }} วินาที...
            </div>
          </div>
          <div v-else-if="errorText" class="text-red-300 text-sm">{{ errorText }}</div>
        </div>

        <div class="grid grid-cols-2 gap-3 mt-4">
          <button @click="$emit('close')" :disabled="processing"
                  class="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
            กลับไปเลือกที่นั่ง
          </button>
          <button @click="markPaid" :disabled="processing || success"
                  class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed">
            ฉันชำระเงินแล้ว
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref as vueRef, watch, onBeforeUnmount, nextTick, computed } from 'vue'
import QRCode from 'qrcode'
import generatePayload from 'promptpay-qr'
import axios from 'axios'

const props = defineProps<{
  open: boolean;
  amount: number;           // ยอดก่อนหักส่วนลด
  refCode: string;
  promptpayId: string;
  seats: string[];
  showtimeId?: number | string;
  buyerEmail?: string;
}>();
const emit = defineEmits(['close','closed-all','paid']);

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:3001'
const qrCanvas = vueRef<HTMLCanvasElement|null>(null)

/* ==== Promo state ==== */
const promoCode = vueRef('')
const promoError = vueRef('')
const promoInfo = vueRef<any|null>(null)
const promoApplied = computed(() => !!promoInfo.value)
const discountAmount = computed(() => promoInfo.value?.discountAmount ?? 0)
const finalTotal = computed(() => Math.max(0, (promoInfo.value?.finalTotal ?? props.amount)))

async function applyPromo(){
  promoError.value = ''
  if (!promoCode.value.trim()) return
  try {
    const seatCount = Array.isArray(props.seats) ? props.seats.length : Math.max(1, Math.round(props.amount / 120))
    const basePrice = seatCount ? Number(props.amount) / seatCount : 120
    const { data } = await axios.post(`${API_BASE}/api/promotions/apply`, {
      code: promoCode.value.trim(),
      showtimeId: props.showtimeId ?? undefined,
      seatCount,
      basePrice,
      refCode: props.refCode,
    })
    if (!data?.ok) throw new Error(data?.error || 'โค้ดไม่ถูกต้อง')
    promoInfo.value = {
      code: data.promo.code,
      label: data.promo.label,
      discountAmount: Number(data.promo.discountAmount || 0),
      finalTotal: Number(data.promo.finalTotal || props.amount),
      id: data.promo.id,
    }
    await renderQR() // อัปเดต QR เป็นยอดหลังหักส่วนลด
  } catch (e:any) {
    promoInfo.value = null
    promoError.value = e?.response?.data?.error || e.message || 'ใช้โค้ดไม่สำเร็จ'
  }
}
function clearPromo(){ promoInfo.value = null; promoError.value = ''; renderQR() }

/* ==== QR ==== */
async function renderQR() {
  await nextTick()
  if (!qrCanvas.value) return
  const id = String(props.promptpayId).replace(/\D/g, '')
  const payAmount = Number(finalTotal.value) // ✅ ใช้ยอดหลังหักส่วนลด
  const opts = payAmount > 0 ? { amount: payAmount } : {}
  const payload = generatePayload(id, opts)
  await QRCode.toCanvas(qrCanvas.value, payload, { margin: 1, width: 256 })
}

/* ==== Countdown ==== */
const secondsLeft = vueRef(5 * 60)
let timer:any = null
function startTimer(){
  clearTimer()
  secondsLeft.value = 5 * 60
  timer = setInterval(() => {
    secondsLeft.value--
    if (secondsLeft.value <= 0) {
      clearTimer()
      emit('close')
    }
  }, 1000)
}
function clearTimer(){ if (timer) clearInterval(timer); timer = null }

/* ==== Processing / Success ==== */
const processing = vueRef(false)
const success = vueRef(false)
const errorText = vueRef('')
let processingTimer:any = null
function clearProcessingTimer(){ if (processingTimer) clearTimeout(processingTimer); processingTimer = null }

const closeCountdown = vueRef(5)
let closeTimer:any = null
function startCloseCountdown() {
  stopCloseCountdown()
  closeCountdown.value = 5
  closeTimer = setInterval(() => {
    closeCountdown.value--
    if (closeCountdown.value <= 0) {
      stopCloseCountdown()
      emit('close')       // ปิด Payment
      emit('closed-all')  // ให้ parent ปิด overlay อื่นๆ ด้วย
    }
  }, 1000)
}
function stopCloseCountdown(){ if (closeTimer) clearInterval(closeTimer); closeTimer = null }

async function markPaid(){
  if (processing.value || success.value) return
  processing.value = true
  success.value = false
  errorText.value = ''

  try {
    const seats = Array.isArray(props.seats) ? props.seats : []
    const count = Math.max(1, seats.length)
    const pricePerSeat = (props.amount) / count

    await axios.post(`${API_BASE}/api/payments/confirm`, {
      refCode: props.refCode,
      email: props.buyerEmail || undefined,
      showtimeId: props.showtimeId ?? undefined,
      seats,
      pricePerSeat,
      promoCode: promoInfo.value?.code || undefined,
    })

    const durationSec = Math.floor(Math.random() * 6) + 5
    clearProcessingTimer()
    processingTimer = setTimeout(() => {
      processing.value = false
      success.value = true
      emit('paid')
      startCloseCountdown()
    }, durationSec * 1000)
  } catch (e:any) {
    console.error(e)
    processing.value = false
    errorText.value = e?.response?.data?.error || 'บันทึกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  }
}

watch(() => props.open, async (v) => {
  if (v) {
    processing.value = false
    success.value = false
    errorText.value = ''
    promoError.value = ''
    await renderQR()
    startTimer()
  } else {
    clearTimer()
    clearProcessingTimer()
    stopCloseCountdown()
  }
})
watch(finalTotal, ()=> { if (props.open) renderQR() })
onBeforeUnmount(() => { clearTimer(); clearProcessingTimer(); stopCloseCountdown() })
</script>

<style scoped>
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease }
.pop-enter-from   { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-leave-to     { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-enter-active, .pop-leave-active { transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.25); border-top-color: #4cc9f0; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.check { width: 16px; height: 16px; border: 2px solid #34d399; border-radius: 4px; position: relative; display: inline-block; }
.check::after { content: ''; position: absolute; left: 3px; top: 0px; width: 6px; height: 10px; border-right: 2px solid #34d399; border-bottom: 2px solid #34d399; transform: rotate(45deg); }
</style>
