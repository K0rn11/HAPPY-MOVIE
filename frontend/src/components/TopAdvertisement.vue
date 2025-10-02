<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
// ⚠️ ตัด useRouter ออก เพราะโปรเจกต์ไม่ได้ใช้ router.global
// import { useRouter } from 'vue-router'

/** storage keys & config */
const KEY_SESSION_DISMISS = 'top-ad-dismissed-session'
const KEY_SUPPRESS_UNTIL  = 'top-ad-suppress-until'
const ROTATE_MS = 5000

/** state */
const dismissed = ref(true)
const showPrefModal = ref(false)
const idx = ref(0)
let timer: number | null = null

// const router = useRouter()  // ❌ ไม่ใช้แล้ว

type Ad = {
  image: string
  title: string
  subtitle?: string
  ctaText?: string
  ctaLink?: string
}
const ads = ref<Ad[]>([
  { image: new URL('@/assets/ads/ai1.jpg', import.meta.url).href, title: 'Weekend Madness - 50 OFF', subtitle: 'Buy 2 tickets get instant discount', ctaText: 'Details', ctaLink: '/promotions' },
  { image: new URL('@/assets/ads/ai2.jpg', import.meta.url).href, title: 'Late Night Show - 2x Points', subtitle: 'Double points on late shows', ctaLink: '/promotions' },
  { image: new URL('@/assets/ads/ai3.jpg', import.meta.url).href, title: 'Student Deal - 99', subtitle: 'Student ID required, Zone B only', ctaText: 'Terms', ctaLink: '/promotions' },
  { image: new URL('@/assets/ads/ai4.jpg', import.meta.url).href, title: 'IMAX Week - 20% OFF', subtitle: 'All IMAX shows this week', ctaText: 'Reserve', ctaLink: '/promotions' },
])

/** modal for promo details */
const promoModal = ref(false)
const promoContent = ref<{ title: string; body: string } | null>(null)

function genPromoBody(kind: 'details'|'terms'|'reserve', ad: Ad) {
  const base = `Promotion: ${ad.title}\n\n`
  if (kind === 'details') {
    return base + [
      `• Period: This week only`,
      `• Benefit: ${ad.subtitle || 'Special offer for selected showtimes'}`,
      `• How to redeem: Show this banner at checkout or apply code AUTO-APPLY`,
      `• Limit: 1 redemption per user per day`,
    ].join('\n')
  }
  if (kind === 'terms') {
    return base + [
      `• Applicable shows: Participating cinemas and showtimes`,
      `• Exclusions: Premier/4DX unless stated`,
      `• Non-transferable, no cash value, cannot be combined with other promos`,
      `• Abuse or suspicious activity may void eligibility`,
    ].join('\n')
  }
  return base + [
    `• Reservation holds your seat for 10 minutes before payment`,
    `• After hold expires, seats return to pool automatically`,
    `• Service fee may apply during high-demand periods`,
  ].join('\n')
}

/** ad actions */
function onCtaClick(ad: Ad) {
  const label = String(ad.ctaText || '').toLowerCase()
  if (label.includes('book')) {
    // 1) open overlay
    try { window.dispatchEvent(new CustomEvent('open-movie-overlay')) } catch {}
    // 2) fallback to deep-link
    if (ad.ctaLink) window.location.href = ad.ctaLink
    else window.location.href = '/movies?overlay=1'
    return
  }
  if (label.includes('detail')) {
    const adObj = ads.value[idx.value]
    promoContent.value = { title: 'Promotion Details', body: genPromoBody('details', adObj) }
    promoModal.value = true
    return
  }
  if (label.includes('term')) {
    const adObj = ads.value[idx.value]
    promoContent.value = { title: 'Terms & Conditions', body: genPromoBody('terms', adObj) }
    promoModal.value = true
    return
  }
  if (label.includes('reserve')) {
    const adObj = ads.value[idx.value]
    promoContent.value = { title: 'Reserve Information', body: genPromoBody('reserve', adObj) }
    promoModal.value = true
    return
  }
  // default navigation
  if (ad.ctaLink) window.location.href = ad.ctaLink
}

/** helpers */
function isSuppressed(): boolean {
  try {
    const until = localStorage.getItem(KEY_SUPPRESS_UNTIL)
    if (!until) return false
    return Date.now() < new Date(until).getTime()
  } catch { return false }
}
function markSessionDismissed() { sessionStorage.setItem(KEY_SESSION_DISMISS, '1'); dismissed.value = true }
function askPreferenceIfFirstTime() {
  const sessionDismiss = sessionStorage.getItem(KEY_SESSION_DISMISS) === '1'
  if (isSuppressed()) { dismissed.value = true; return }
  if (!sessionDismiss) { showPrefModal.value = true; dismissed.value = false } else { dismissed.value = true }
}
function setSuppressDays(days: number) {
  const until = new Date(Date.now() + days*24*60*60*1000).toISOString()
  localStorage.setItem(KEY_SUPPRESS_UNTIL, until)
  sessionStorage.setItem(KEY_SESSION_DISMISS, '1')
  dismissed.value = true
  showPrefModal.value = false
}
function keepShowingThisSession() { dismissed.value = false; showPrefModal.value = false }
function closeAd() { markSessionDismissed() }

/** carousel */
function next() { idx.value = (idx.value + 1) % ads.value.length }
function prev() { idx.value = (idx.value - 1 + ads.value.length) % ads.value.length }
function go(i: number) { idx.value = ((i % ads.value.length) + ads.value.length) % ads.value.length }
function startTimer() { stopTimer(); /* @ts-ignore */ timer = window.setInterval(next, 5000) }
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }

/** lifecycle */
onMounted(() => {
  const v = sessionStorage.getItem(KEY_SESSION_DISMISS)
  if (v === null) { askPreferenceIfFirstTime() } else { dismissed.value = (v === '1') }
  startTimer()
})
onUnmounted(stopTimer)
</script>

<template>
  <div v-if="!isSuppressed()" class="w-full">
    <!-- Banner container -->
    <div v-show="!dismissed" class="mx-auto max-w-5xl px-4">
      <div class="relative rounded-2xl shadow-lg border border-gray-200/70 bg-white dark:bg-neutral-900 overflow-hidden">
        <!-- Close -->
        <button @click="closeAd" aria-label="Close advertisement"
          class="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300/60 hover:bg-gray-100 dark:border-neutral-700 dark:hover:bg-neutral-800">✕</button>

        <!-- Carousel -->
        <div class="group relative">
          <div class="relative h-56 md:h-72" @mouseenter="stopTimer" @mouseleave="startTimer">
            <Transition name="fade" mode="out-in">
              <div :key="idx" class="absolute inset-0">
                <img :src="ads[idx].image" class="w-full h-full object-cover" :alt="ads[idx].title" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent"></div>
                <div class="absolute left-0 bottom-0 w-full p-4 md:p-6 text-white">
                  <p class="text-xs uppercase tracking-widest opacity-80">Advertisement</p>
                  <h3 class="text-xl md:text-2xl font-semibold">{{ ads[idx].title }}</h3>
                  <p v-if="ads[idx].subtitle" class="opacity-90">{{ ads[idx].subtitle }}</p>
                  <div class="pt-3">
                    <button @click="onCtaClick(ads[idx])"
                      class="inline-flex items-center rounded-xl px-4 py-2 border shadow-sm hover:shadow transition
                             border-white/70 bg-white/10 backdrop-blur hover:bg-white/20">
                      {{ ads[idx].ctaText || 'Learn more' }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Controls -->
          <button @click="prev" class="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white">‹</button>
          <button @click="next" class="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white">›</button>

          <!-- Dots -->
          <div class="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
            <button v-for="(a,i) in ads" :key="i" @click="go(i)" class="h-2 rounded-full transition-all" :class="[ i===idx ? 'w-6 bg-white' : 'w-2 bg-white/60' ]"></button>
          </div>
        </div>
      </div>
    </div>

    <!-- First-visit modal (this session) -->
    <div v-if="showPrefModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 shadow-xl border border-gray-200 dark:border-neutral-800">
        <div class="p-5 space-y-3">
          <h4 class="text-lg font-semibold">Promotion preferences</h4>
          <p class="text-sm opacity-80">Would you like to hide the promotion for <b>3 days</b>?</p>
          <div class="flex flex-col sm:flex-row gap-2 pt-2">
            <button @click="setSuppressDays(3)" class="flex-1 rounded-xl px-4 py-2 border bg-white hover:bg-gray-50 dark:bg-neutral-800 dark:border-neutral-700">Hide 3 days</button>
            <button @click="keepShowingThisSession" class="flex-1 rounded-xl px-4 py-2 border bg-white hover:bg-gray-50 dark:bg-neutral-800 dark:border-neutral-700">Keep showing</button>
          </div>
          <p class="text-xs opacity-60">You can close for this session using the ✕ on the banner.</p>
        </div>
      </div>
    </div>

    <!-- Promo detail modal -->
    <div v-if="promoModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="promoModal=false">
      <div class="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 shadow-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-neutral-800">
          <h4 class="text-lg font-semibold">{{ promoContent?.title || 'Promotion' }}</h4>
          <button @click="promoModal=false" class="h-8 w-8 rounded-full border flex items-center justify-center">✕</button>
        </div>
        <div class="p-5">
          <pre class="whitespace-pre-wrap text-sm">{{ promoContent?.body }}</pre>
        </div>
        <div class="px-5 pb-4">
          <button @click="promoModal=false" class="rounded-xl px-4 py-2 border bg-white hover:bg-gray-50 dark:bg-neutral-800 dark:border-neutral-700">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .25s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
