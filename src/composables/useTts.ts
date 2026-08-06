/**
 * TTS 朗读工具
 * 策略：Web Speech API 为主 (零延迟)，Edge TTS 为辅 (备选)
 *
 * 为什么主推 Web Speech？
 * - 零网络延迟，第一个字不会卡
 * - Chrome 的 Google 语音质量已经很好
 * - rate=0.85 语速接近真人口语
 *
 * 关键修复：
 * - 延迟第一次 speak 直到 audio 引擎就绪
 * - Chrome 的 SpeechSynthesis 在后台页签会暂停，用 <audio> 兜底
 */
let audioEl: HTMLAudioElement | null = null
let ttsReady = false

/** 预初始化：提前加载 Edge 音频流到浏览器缓存 */
export function prewarmTts() {
  // 轻量预加载 — 用 "hello" 触发一次沉寂播放
  const dummy = new Audio()
  dummy.src = '/api/tts?text=hello&lang=en-US'
  dummy.volume = 0
  dummy.play().then(() => {
    dummy.pause()
    ttsReady = true
  }).catch(() => {
    ttsReady = true // 即使失败也不要阻塞
  })
}

export function speak(text: string, lang = 'en-US') {
  // 主方案: Web Speech API (Chrome/Safari 原生，零延迟)
  if (speakWebSpeech(text, lang)) return

  // 备选: Edge TTS 后端代理
  fetchTts(text, lang)
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
  u.rate = 0.85
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

async function fetchTts(text: string, lang: string) {
  try {
    const url = `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}`
    if (!audioEl) {
      audioEl = new Audio()
      audioEl.preload = 'auto'
    }

    // 暂停当前的 (如果有)
    audioEl.pause()
    audioEl.currentTime = 0

    audioEl.src = url

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
  } catch {
    // 最终降级：Web Speech
    speakWebSpeech(text, lang)
  }
}

// 初始化语音库
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
}
