<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useErrorBookStore } from '../stores/errorBook'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const errorBook = useErrorBookStore()

onMounted(() => {
  errorBook.fetchErrorCount()
})

const navItems = [
  { path: '/', label: '首页' },
  { path: '/errorbook', label: '错题本', badge: true },
  { path: '/records', label: '记录' },
  { path: '/ai-generate', label: 'AI出题' },
  { path: '/ai-chat', label: 'AI助教' },
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <header class="topbar topbar-global">
    <div class="logo">
      <span class="logo-icon">T</span>
      <span class="logo-text">TypEnglish</span>
    </div>
    <nav class="topbar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="['nav-link', { active: isActive(item.path) }]"
      >
        {{ item.label }}
        <strong
          v-if="item.badge && errorBook.errorCount > 0"
          class="nav-badge"
        >{{ errorBook.errorCount }}</strong>
      </router-link>
    </nav>
    <div class="topbar-right">
      <span class="user-name">{{ auth.user?.username }}</span>
      <button class="logout-btn" @click="logout">退出</button>
    </div>
  </header>
</template>

<style scoped>
.user-name{font-size:14px;color:#2d2422}
.logout-btn{padding:6px 14px;border:1px solid rgba(184,160,151,.18);border-radius:8px;background:rgba(255,255,255,.5);color:#b8a097;font-size:13px;cursor:pointer;transition:all .15s}
.logout-btn:hover{border-color:#c94a4a;color:#c94a4a}
</style>
