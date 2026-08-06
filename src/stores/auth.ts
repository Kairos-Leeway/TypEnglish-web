import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

interface User {
  id: number
  username: string
  email: string
  level?: number
  xp?: number
  totalXp?: number
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref(localStorage.getItem('token') || '')

  // 从 localStorage 恢复用户信息
  try {
    const saved = localStorage.getItem('user')
    if (saved) user.value = JSON.parse(saved)
  } catch {}

  async function login(account: string, password: string) {
    const { data } = await api.post('/auth/login', { account, password })
    token.value = data.token
    user.value = data.user
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
  }

  async function register(username: string, email: string, password: string) {
    const { data } = await api.post('/auth/register', { username, email, password })
    token.value = data.token
    user.value = data.user
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
  }

  function updateXp(level: number, xp: number, totalXp: number) {
    if (user.value) {
      user.value.level = level
      user.value.xp = xp
      user.value.totalXp = totalXp
      localStorage.setItem('user', JSON.stringify(user.value))
    }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return { user, token, login, register, updateXp, logout }
})
