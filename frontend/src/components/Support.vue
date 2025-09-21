<script setup lang="ts">
const props = defineProps<{ open: boolean }>();
const emit = defineEmits(["close"]);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[9999]">
    <transition name="fade" appear>
      <div class="absolute inset-0 bg-black/70" @click="$emit('close')" />
    </transition>

    <transition name="pop" appear>
      <div class="relative z-10 min-h-full flex items-center justify-center p-4">
        <div class="w-full max-w-2xl bg-zinc-900 text-white rounded-2xl p-6 border border-zinc-800/60 shadow-2xl">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xl font-semibold">Support</h2>
            <button class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700" @click="$emit('close')">ปิด</button>
          </div>

          <div class="space-y-3 text-sm text-zinc-200">
            <p>หากพบปัญหาเกี่ยวกับการใช้งาน ระบบการจอง หรือการชำระเงิน สามารถติดต่อเราได้ตามช่องทางด้านล่างนี้</p>
            <ul class="list-disc pl-5 opacity-90">
              <li>Email: happymovie@support.dev</li>
              <li>Phone: 02-000-0000</li>
              <li>เวลาทำการ: 09:00–18:00 น. (จันทร์–ศุกร์)</li>
            </ul>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease }
.pop-enter-from   { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-leave-to     { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-enter-active, .pop-leave-active { transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s }
</style>
