<script setup lang="ts">
</script>

<template>
  <div class="app-shell">
    <div class="ambient-field" aria-hidden="true">
      <i class="ambient-orb orb-coral" />
      <i class="ambient-orb orb-ice" />
      <i class="ambient-orb orb-gold" />
      <span class="ambient-grain" />
    </div>
    <router-view />
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #f7f8fb;
  background-attachment: fixed;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.app-shell { position: relative; isolation: isolate; width: 100%; min-height: 100vh; min-height: 100dvh; overflow-x: hidden }
.app-shell > :not(.ambient-field) { position: relative; z-index: 1 }
.ambient-field { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: linear-gradient(145deg,#f8fbff 0%,#f8f7fb 42%,#fff9f5 100%) }
.ambient-orb { position: absolute; display: block; border-radius: 50%; filter: blur(10px); opacity: .72; will-change: transform }
.orb-coral { left: -9vw; top: 18vh; width: 42vw; height: 42vw; background: radial-gradient(circle at 58% 48%,rgba(255,178,142,.28),rgba(255,207,180,.09) 52%,transparent 72%); animation: driftCoral 18s ease-in-out infinite alternate }
.orb-ice { right: -11vw; top: -12vh; width: 48vw; height: 48vw; background: radial-gradient(circle at 42% 58%,rgba(176,202,255,.3),rgba(205,217,255,.1) 54%,transparent 73%); animation: driftIce 22s ease-in-out infinite alternate }
.orb-gold { left: 39vw; bottom: -30vw; width: 50vw; height: 50vw; background: radial-gradient(circle at 50% 40%,rgba(255,220,154,.2),rgba(255,234,195,.07) 50%,transparent 72%); animation: driftGold 20s ease-in-out infinite alternate }
.ambient-grain { position: absolute; inset: 0; opacity: .15; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E"); mix-blend-mode:soft-light }
@keyframes driftCoral { to { transform: translate(12vw,-7vh) scale(1.12) } }
@keyframes driftIce { to { transform: translate(-9vw,12vh) scale(.92) } }
@keyframes driftGold { to { transform: translate(-7vw,-8vh) scale(1.08) } }
/* 全局滚动条美化 */
::-webkit-scrollbar { width: 6px }
::-webkit-scrollbar-track { background: transparent }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px }
::-webkit-scrollbar-thumb:hover { background: #94a3b8 }
</style>
