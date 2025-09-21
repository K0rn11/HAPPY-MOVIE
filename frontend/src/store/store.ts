// src/store/store.ts
import { reactive, computed } from 'vue'

interface User {
  email: string | null
  username?: string | null
}

export const userState = reactive<User>({
  email: null,
  username: null,
})

export function loginUser(email: string, username?: string) {
  userState.email = email
  userState.username = username || null
}

export function logoutUser() {
  userState.email = null
  userState.username = null
}

export const isLoggedIn = computed(() => !!userState.email)
