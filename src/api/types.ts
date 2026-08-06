/** 后端统一响应格式 Result<T> */
export interface ApiResult<T = unknown> {
  code: number
  msg: string
  data: T
}

/** 分页响应 */
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** 用户信息 */
export interface UserInfo {
  id: number
  username: string
  email: string
  level: number
  xp: number
  totalXp: number
}

/** 登录/注册响应 */
export interface AuthData {
  token: string
  user: UserInfo
}

/** 单词 */
export interface WordItem {
  id: number
  language: string
  category: string
  word: string
  phonetic: string
  translation: string
  partOfSpeech: string
  example: string
  difficulty: number
}

/** 练习统计 */
export interface PracticeStats {
  total: number
  correct: number
  accuracy: number
  byMode: Array<{ mode: string; count: number }>
}

/** 分类 */
export interface CategoryItem {
  category: string
  wordCount: number
}

/** 错题单词 */
export interface ErrorWordItem {
  id: number
  errorCount: number
  lastErrorAt: string
  nextReviewAt: string
  word: {
    id: number
    word: string
    translation: string
    phonetic: string
    language: string
  }
}

/** 错题句子 */
export interface ErrorSentenceItem {
  id: number
  sentenceId: number | null
  english: string
  chinese: string
  mode: string
  slotResults: string
  totalSlots: number
  correctSlots: number
  createdAt: string
}

/** 单词查询 */
export interface WordLookup {
  found: boolean
  word: string
  phonetic?: string
  translation?: string
  partOfSpeech?: string
  example?: string
}
