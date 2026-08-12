import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const XP_PER_LEVEL = 100

/** 全局 XP 系统（从 auth store 读取，调后端 API 持久化） */
export function useXp() {
  const auth = useAuthStore()

  const level = computed(() => auth.user?.level ?? 1)
  const xp = computed(() => auth.user?.xp ?? 0)
  const totalXp = computed(() => auth.user?.totalXp ?? 0)
  const progress = computed(() => Math.round(((auth.user?.xp ?? 0) / ((auth.user?.level ?? 1) * XP_PER_LEVEL)) * 100))

  async function gain(amount: number) {
    try {
      const { data } = await api.post('/user/xp/gain', { amount })
      auth.updateXp(data.level, data.xp, data.totalXp)
    } catch {
      // 未登录时仅本地更新
      const lv = auth.user?.level ?? 1
      const curXp = (auth.user?.xp ?? 0) + amount
      const totXp = (auth.user?.totalXp ?? 0) + amount
      let newLv = lv, newRem = curXp
      while (newRem >= newLv * XP_PER_LEVEL) {
        newRem -= newLv * XP_PER_LEVEL
        newLv++
      }
      auth.updateXp(newLv, newRem, totXp)
    }
  }

  return { level, xp, totalXp, progress, gain, XP_PER_LEVEL }
}
