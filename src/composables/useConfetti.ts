import confetti from 'canvas-confetti'
import { playChime } from './useChime'

const COLORS = [
  '#e8734a', // coral
  '#f2996d', // light coral
  '#d4653a', // deep coral
  '#5b9a5e', // warm green
  '#e8a44a', // warm amber
  '#f0c060', // golden
  '#e87a6a', // salmon
  '#c9782d', // warm brown
]

/**
 * 轻量庆祝动画 — 天降花雨，不遮挡题目区域
 */
export function celebrate() {
  playChime()

  const end = Date.now() + 1000
  const frame = () => {
    confetti({
      particleCount: 2,
      angle: 270,
      spread: 40,
      startVelocity: 25,
      decay: 0.92,
      ticks: 100,
      colors: COLORS,
      scalar: 0.55,
      origin: { x: 0.1 + Math.random() * 0.8, y: -0.05 },
      drift: (Math.random() - 0.5) * 1.5,
      gravity: 1.0,
      disableForReducedMotion: true,
      zIndex: 1000,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

export function miniCelebrate() {
  confetti({
    particleCount: 15,
    spread: 50,
    startVelocity: 25,
    decay: 0.9,
    ticks: 120,
    colors: COLORS,
    origin: { x: 0.5, y: 0.5 },
    disableForReducedMotion: true,
    zIndex: 1000,
  })
}
