import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useErrorBookStore = defineStore('errorBook', () => {
  const errorCount = ref(0)
  const loaded = ref(false)
  let fetchPromise: Promise<void> | null = null

  async function fetchErrorCount() {
    // 防止并发重复请求
    if (fetchPromise) return fetchPromise
    fetchPromise = (async () => {
      try {
        const [wordRes, sentRes] = await Promise.all([
          api.get('/errorbook?size=1'),
          api.get('/errorbook/sentences?size=1')
        ])
        const wc = wordRes.data.total > 0 ? wordRes.data.total : (wordRes.data.items ? wordRes.data.items.length : 0)
        const sc = sentRes.data.total > 0 ? sentRes.data.total : (sentRes.data.items ? sentRes.data.items.length : 0)
        errorCount.value = wc + sc
        loaded.value = true
      } catch {
        // 保持旧值
      } finally {
        fetchPromise = null
      }
    })()
    return fetchPromise
  }

  function decrement(by = 1) {
    errorCount.value = Math.max(0, errorCount.value - by)
  }

  function setErrorCount(count: number) {
    errorCount.value = count
  }

  // 首次引用时自动获取
  if (!loaded.value && !fetchPromise) {
    fetchErrorCount()
  }

  return { errorCount, loaded, fetchErrorCount, decrement, setErrorCount }
})
