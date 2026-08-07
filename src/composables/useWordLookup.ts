import { reactive } from 'vue'
import api from '../api'

interface WordDetail {
  found: boolean
  word: string
  phonetic?: string
  translation?: string
  partOfSpeech?: string
  example?: string
}

interface CacheEntry {
  data: WordDetail | null
  loading: boolean
}

const cache = reactive(new Map<string, CacheEntry>())

/** 构建缓存 key: "lang:word" */
function key(lang: string, word: string) {
  return `${lang}:${word.toLowerCase()}`
}

/** 获取单词详情（带前端缓存 + 去重请求） */
export function useWordLookup() {
  const pending = new Map<string, Promise<WordDetail>>()

  async function lookup(language: string, word: string): Promise<WordDetail | null> {
    if (!word || word.length < 1) return null

    // 清理标点
    const clean = word.replace(/^[^a-zA-Z'-]+|[^a-zA-Z'-]+$/g, '')
    if (!clean) return null

    const k = key(language, clean)

    // 命中缓存
    const entry = cache.get(k)
    if (entry) {
      if (entry.data || entry.loading) return entry.data
      // 之前查过但没找到，不再重复请求
      if (entry.data === null && !entry.loading) return null
    }

    // 正在请求中（去重）
    if (pending.has(k)) return pending.get(k)!

    // 发起请求
    cache.set(k, { data: null, loading: true })
    const promise = api.get('/words/lookup', { params: { language, word: clean } })
      .then(res => {
        const d: WordDetail = res.data
        cache.set(k, { data: d, loading: false })
        pending.delete(k)
        return d
      })
      .catch(() => {
        cache.set(k, { data: null, loading: false })
        pending.delete(k)
        return null
      })

    pending.set(k, promise)
    return promise
  }

  return { lookup }
}
