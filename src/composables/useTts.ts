import axios from 'axios'
import { ref } from 'vue'
import api from '../api'

/**
 * TTS 朗读工具
 * 策略：后端神经语音为主，Web Speech API 仅作为离线兜底。
 *
 * 关键修复：
 * - 延迟第一次 speak 直到 audio 引擎就绪
 * - Chrome 的 SpeechSynthesis 在后台页签会暂停，用 <audio> 兜底
 */
let audioEl: HTMLAudioElement | null = null
let ttsReady = false
let requestController: AbortController | null = null
let activeRequestKey = ''
let activeRequest: Promise<void> | null = null

export const isTtsLoading = ref(false)

/** 预初始化：提前加载 Edge 音频流到浏览器缓存 */
export function prewarmTts() {
  // 预热也必须通过统一 API 客户端，以便自动携带 JWT。
  void api.get('/tts', {
    params: { text: 'hello', lang: 'en-US' },
    responseType: 'blob',
  }).finally(() => { ttsReady = true })
}

export function speak(text: string, lang = 'en-US'): Promise<void> {
  const normalized = text?.trim()
  if (!normalized) return Promise.resolve()

  const requestKey = `${lang}\n${normalized}`
  // Repeated clicks on the same sentence share one request instead of restarting it.
  if (activeRequest && activeRequestKey === requestKey) return activeRequest

  requestController?.abort()
  requestController = new AbortController()
  activeRequestKey = requestKey
  isTtsLoading.value = true

  // 音色在服务端固定，所有浏览器听到的效果一致；失败时再降级到系统语音。
  const task = fetchTts(normalized, lang, requestController.signal).finally(() => {
    if (activeRequest === task) {
      activeRequest = null
      activeRequestKey = ''
      isTtsLoading.value = false
    }
  })
  activeRequest = task
  return task
}

/**
 * 返回 true 表示成功播放 (或排队中)
 * 返回 false 表示浏览器不支持 / 无声卡
 */
function speakWebSpeech(text: string, lang: string): boolean {
  if (!('speechSynthesis' in window)) return false

  const synth = window.speechSynthesis

  // 取语音列表 — Chrome 首次需要异步加载
  let voices = synth.getVoices()
  if (voices.length === 0) {
    // 等 voices 就绪后再播
    const onReady = () => {
      synth.onvoiceschanged = null
      doSpeakWeb(text, lang)
    }
    synth.onvoiceschanged = onReady
    // 200ms 后还没就绪就直接播（用默认语音）
    setTimeout(() => {
      if (synth.onvoiceschanged === onReady) {
        synth.onvoiceschanged = null
        doSpeakWeb(text, lang)
      }
    }, 200)
    return true
  }

  doSpeakWeb(text, lang)
  return true
}

function doSpeakWeb(text: string, lang: string) {
  const synth = window.speechSynthesis
  synth.cancel()

  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  u.rate = 0.72
  u.pitch = 1
  u.volume = 1

  // 选最佳英语语音
  const voices = synth.getVoices()
  const preferred = voices.find(v =>
    v.lang.startsWith('en') &&
    (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha'))
  ) || voices.find(v => v.lang.startsWith('en'))
  if (preferred) u.voice = preferred

  // Chrome bug workaround: 长时间不说话的 synthesis 会暂停
  // 先发一个空的 utterance 唤醒了再播
  if (!ttsReady) {
    ttsReady = true
    const wake = new SpeechSynthesisUtterance('')
    wake.volume = 0
    synth.speak(wake)
  }

  synth.speak(u)
}

async function fetchTts(text: string, lang: string, signal: AbortSignal) {
  try {
    const response = await api.get<Blob>('/tts', {
      params: { text, lang },
      responseType: 'blob',
      signal,
    })
    const audioBlob = response.data
    if (!audioBlob.type.startsWith('audio/')) throw new Error('TTS response is not audio')

    if (!audioEl) {
      audioEl = new Audio()
      audioEl.preload = 'auto'
    }

    // 暂停当前的 (如果有)
    audioEl.pause()
    audioEl.currentTime = 0

    const previousUrl = audioEl.src
    const objectUrl = URL.createObjectURL(audioBlob)
    audioEl.src = objectUrl

    // canplay 事件触发 = 音频头已就绪，可以无延迟播出
    await new Promise<void>((resolve, reject) => {
      const onCanPlay = () => {
        audioEl!.removeEventListener('canplay', onCanPlay)
        audioEl!.removeEventListener('error', onError)
        resolve()
      }
      const onError = () => {
        audioEl!.removeEventListener('canplay', onCanPlay)
        audioEl!.removeEventListener('error', onError)
        reject(new Error('audio load failed'))
      }
      audioEl!.addEventListener('canplay', onCanPlay)
      audioEl!.addEventListener('error', onError)

      // 超时保护：2 秒后直接 play (部分缓冲也够了)
      setTimeout(() => {
        if (audioEl!.readyState >= 2) {
          audioEl!.removeEventListener('canplay', onCanPlay)
          audioEl!.removeEventListener('error', onError)
          resolve()
        }
      }, 2000)
    })

    await audioEl.play()
    if (previousUrl.startsWith('blob:')) URL.revokeObjectURL(previousUrl)
  } catch (error) {
    if (axios.isCancel(error) || (error instanceof DOMException && error.name === 'AbortError')) return
    // 最终降级：Web Speech
    speakWebSpeech(text, lang)
  }
}

// 初始化语音库
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
}
