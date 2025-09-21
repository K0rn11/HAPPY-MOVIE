<script setup lang="ts">
import { ref } from 'vue'
import { Button } from "@/components/ui/button"
import { LogIn, X } from "lucide-vue-next"
// ⛔️ เลิกใช้ Firebase
// import { auth } from '@/firebase'
// import { signInWithEmailAndPassword } from "firebase/auth"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-vue-next"
import { loginUser } from '@/store/store'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'

// ===== Modal state (เดิม) =====
const showModal = ref(false)
function openModal() { showModal.value = true }
function closeModal() { showModal.value = false }

// ===== Inputs =====
const email = ref('')
const password = ref('')

// ===== Alert state =====
const showAlert = ref(false)
const alertMessage = ref('')
const alertType = ref<'success' | 'destructive'>('destructive')

// helper: เก็บ session หลังล็อกอิน
function saveSession(token: string, user: any) {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('auth_user', JSON.stringify(user))
}

// ===== Submit Login (เรียก API ของเรา) =====
async function handleLogin() {
  try {
    showAlert.value = false
    const { data } = await axios.post(`${API_BASE}/api/auth/login`, {
      email: email.value,
      password: password.value,
    })

    if (!data?.ok) {
      throw new Error(data?.error || 'Login failed')
    }

    saveSession(data.token, data.user)

    // ถ้าคุณมี store ผู้ใช้
    try { loginUser(data.user.email, data.user.displayName || '') } catch {}

    alertType.value = 'success'
    alertMessage.value = 'Login successful!'
    showAlert.value = true

    setTimeout(() => {
      showAlert.value = false
      closeModal()
      // เคลียร์ฟอร์มถ้าต้องการ
      // email.value = ''; password.value = ''
    }, 800)
  } catch (error: any) {
    alertType.value = 'destructive'
    alertMessage.value = `Login failed: ${error?.response?.data?.error || error?.message || 'Unknown error'}`
    showAlert.value = true
  }
}
</script>


<template>
  <!-- Login Button -->
  <Button size="sm" variant="ghost" class="w-full justify-start" @click="openModal">
    <div class="flex gap-2 items-center">
      <LogIn class="size-5" />
      <span class="block lg:hidden">Login</span>
    </div>
    <span class="sr-only">Login</span>
  </Button>

  <!-- Modal -->
  <div
    v-if="showModal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="closeModal"
  >
    <div class="text-white bg-card shadow-md shadow-dark border w-full max-w-md p-6 rounded-xl">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold">Login</h2>
        <button @click="closeModal" class="text-gray-500 hover:text-gray-800 dark:hover:text-white">
          <X class="size-5" />
        </button>
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleLogin">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            class="text-black w-full border rounded px-3 py-2 text-sm"
            placeholder="you@example.com"
            required
          />
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            class="text-black w-full border rounded px-3 py-2 text-sm"
            placeholder="Password"
            required
          />
        </div>

        <div class="flex justify-end">
          <Button type="submit" size="sm">Login</Button>
        </div>
      </form>
    </div>
  </div>

  <!-- Alert (Teleport to body so it appears fixed and outside modal) -->
  <Teleport to="body">
    <Alert
      v-if="showAlert"
      :variant="alertType"
      class="fixed bottom-6 right-6 z-50 w-full max-w-sm shadow-lg"
      :key="alertMessage"
    >
      <AlertCircle class="w-4 h-4" />
      <AlertTitle>{{ alertType === 'success' ? 'Success' : 'Error' }}</AlertTitle>
      <AlertDescription>{{ alertMessage }}</AlertDescription>
    </Alert>
  </Teleport>
</template>
