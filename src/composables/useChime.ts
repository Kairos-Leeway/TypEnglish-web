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
