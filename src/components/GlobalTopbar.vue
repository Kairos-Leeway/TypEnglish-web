<script setup lang="ts">
import { onMounted } from 'vue'
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
    <div class="nav-capsule">
      <router-link to="/" class="logo" aria-label="TypEnglish 首页">
        <span class="logo-signal" aria-hidden="true"><i /><i /><i /></span>
        <span class="logo-copy">
          <strong class="logo-text">TypEnglish</strong>
          <small>LEARN IN RHYTHM</small>
        </span>
      </router-link>

      <nav class="topbar-nav" aria-label="主导航">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="['nav-link', { active: isActive(item.path) }]"
        >
          <span>{{ item.label }}</span>
          <strong
            v-if="item.badge && errorBook.errorCount > 0"
            class="nav-badge"
          >{{ errorBook.errorCount }}</strong>
        </router-link>
      </nav>

      <div class="topbar-right">
        <span class="user-avatar" aria-hidden="true">{{ auth.user?.username?.slice(0, 1).toUpperCase() || 'T' }}</span>
        <span class="user-meta">
          <small>LEARNER</small>
          <strong class="user-name">{{ auth.user?.username }}</strong>
        </span>
        <button class="logout-btn" @click="logout" aria-label="退出登录" title="退出登录">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.logo-signal i { animation: homeSignal 1.8s ease-in-out infinite }
.logo-signal i:nth-child(1) { animation-delay: -.3s }
.logo-signal i:nth-child(3) { animation-delay: -.65s }
@keyframes homeSignal { 0%, 100% { transform: scaleY(.68); opacity: .68 } 50% { transform: scaleY(1); opacity: 1 } }
</style>
