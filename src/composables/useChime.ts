/**
 * Web Audio API 合成苹果风铃风格的完成提示音
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function ensureRunning(ctx: AudioContext) {
  if (ctx.state === 'suspended') void ctx.resume()
}

/** 单题答对：轻盈的三音上行，带一点玻璃质感但不尖锐。 */
export function playCorrectTone() {
  try {
    const ctx = getCtx(); ensureRunning(ctx)
    const now = ctx.currentTime
    const master = ctx.createGain()
    const compressor = ctx.createDynamicsCompressor()
    master.gain.setValueAtTime(0.72, now)
    master.connect(compressor); compressor.connect(ctx.destination)

    const notes = [
      { frequency: 659.25, delay: 0, volume: 0.105 },
      { frequency: 987.77, delay: 0.055, volume: 0.095 },
      { frequency: 1318.51, delay: 0.115, volume: 0.075 },
    ]
    for (const note of notes) {
      const start = now + note.delay
      const osc = ctx.createOscillator()
      const overtone = ctx.createOscillator()
      const gain = ctx.createGain()
      const overtoneGain = ctx.createGain()
      osc.type = 'sine'; overtone.type = 'sine'
      osc.frequency.setValueAtTime(note.frequency, start)
      overtone.frequency.setValueAtTime(note.frequency * 2.01, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(note.volume, start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34)
      overtoneGain.gain.setValueAtTime(0.0001, start)
      overtoneGain.gain.exponentialRampToValueAtTime(note.volume * 0.12, start + 0.006)
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
      osc.connect(gain); overtone.connect(overtoneGain)
      gain.connect(master); overtoneGain.connect(master)
      osc.start(start); overtone.start(start)
      osc.stop(start + 0.36); overtone.stop(start + 0.18)
    }
  } catch {}
}

/** 单题答错：短促低落的双音，不刺耳、不制造失败焦虑。 */
export function playErrorTone() {
  try {
    const ctx = getCtx(); ensureRunning(ctx)
    const now = ctx.currentTime
    const master = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(1250, now)
    master.gain.setValueAtTime(0.65, now)
    master.connect(filter); filter.connect(ctx.destination)

    const notes = [
      { frequency: 329.63, delay: 0, duration: 0.16, volume: 0.105 },
      { frequency: 246.94, delay: 0.09, duration: 0.22, volume: 0.09 },
    ]
    for (const note of notes) {
      const start = now + note.delay
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(note.frequency, start)
      osc.frequency.exponentialRampToValueAtTime(note.frequency * 0.94, start + note.duration)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(note.volume, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration)
      osc.connect(gain); gain.connect(master)
      osc.start(start); osc.stop(start + note.duration + 0.02)
    }
  } catch {}
}

/** 播放类似苹果通知音的完成音效 — 纯净、清脆、不拖沓 */
export function playChime() {
  try {
    const ctx = getCtx()
    const now = ctx.currentTime

    // iOS 风格的双音上行: C6 → E6 (纯正弦波，干净利落)
    const notes = [
      { freq: 1047, delay: 0,    dur: 0.18, vol: 0.22 },  // C6
      { freq: 1319, delay: 0.08, dur: 0.32, vol: 0.20 },  // E6
    ]

    for (const note of notes) {
      const t = now + note.delay

      // 主音：纯正弦波
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.freq, t)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(note.vol, t + 0.008)
      gain.gain.setValueAtTime(note.vol * 0.7, t + note.dur * 0.35)
      gain.gain.exponentialRampToValueAtTime(0.001, t + note.dur)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(t); osc.stop(t + note.dur + 0.02)

      // 低八度和声 — 厚度但不抢戏
      const oscLow = ctx.createOscillator()
      const gLow = ctx.createGain()
      oscLow.type = 'sine'
      oscLow.frequency.setValueAtTime(note.freq / 2, t)
      gLow.gain.setValueAtTime(0, t)
      gLow.gain.linearRampToValueAtTime(note.vol * 0.15, t + 0.005)
      gLow.gain.exponentialRampToValueAtTime(0.001, t + note.dur * 0.7)
      oscLow.connect(gLow); gLow.connect(ctx.destination)
      oscLow.start(t); oscLow.stop(t + note.dur * 0.8)
    }
  } catch {
    // 静默降级
  }
}

/** 机械键盘按键音 — 短敲击+高频泛音，清脆小巧 */
export function playKeytap() {
  try {
    const ctx = getCtx()
    const now = ctx.currentTime

    // 底层：极短噪声爆音，模拟机械轴触底
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004))
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    const nGain = ctx.createGain()
    nGain.gain.setValueAtTime(0.06, now)
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025)
    noise.connect(nGain); nGain.connect(ctx.destination)
    noise.start(now); noise.stop(now + 0.03)

    // 高频"咔" — 纯正弦，模拟键帽回弹
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(3200, now)
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.02)
    g.gain.setValueAtTime(0.04, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.025)
    osc.connect(g); g.connect(ctx.destination)
    osc.start(now); osc.stop(now + 0.03)
  } catch {
    // 静默降级
  }
}

/** 跳过提示音 */
export function playSkipTone() {
  try {
    const ctx = getCtx()
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.linearRampToValueAtTime(350, now + 0.08)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(now); osc.stop(now + 0.22)
  } catch {}
}
