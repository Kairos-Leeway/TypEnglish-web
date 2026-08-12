<script setup lang="ts">
import { watch } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; done: [] }>()

let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.modelValue,
  (v) => {
    if (timer) { clearTimeout(timer); timer = null }
    if (!v) return
    timer = setTimeout(() => {
      emit('update:modelValue', false)
      emit('done')
    }, 2600)
  },
  { immediate: true }
)
</script>

<template>
  <Transition name="cf-fade">
    <div v-if="modelValue" class="celebration-frame" aria-hidden="true">
      <div class="cf-ambient" />
      <div class="cf-border" />
      <div class="cf-glow" />
    </div>
  </Transition>
</template>

<style scoped>
.celebration-frame {
  position: fixed;
  inset: 0;
  z-index: 999;
  pointer-events: none;
  overflow: hidden;
}

/* 柔和的环境光晕 */
.cf-ambient {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(232, 115, 74, 0.12) 0%,
    rgba(240, 160, 96, 0.06) 35%,
    transparent 70%
  );
  animation: cfBreathe 1.6s ease-in-out infinite;
}

/* 页面边框 */
.cf-border {
  position: absolute;
  inset: 14px;
  border-radius: 28px;
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  box-shadow:
    0 0 0 1px rgba(232, 115, 74, 0.15),
    0 0 30px rgba(232, 115, 74, 0.25),
    inset 0 0 0 1px rgba(255, 255, 255, 0.4);
  animation: cfPulse 1.2s ease-in-out infinite;
}

/* 外层漫射光 */
.cf-glow {
  position: absolute;
  inset: 6px;
  border-radius: 34px;
  background: transparent;
  box-shadow: 0 0 80px rgba(232, 115, 74, 0.22);
  animation: cfBreathe 1.6s ease-in-out infinite reverse;
}

@keyframes cfPulse {
  0%, 100% {
    opacity: 0.55;
    border-color: rgba(255, 255, 255, 0.75);
    box-shadow:
      0 0 0 1px rgba(232, 115, 74, 0.1),
      0 0 24px rgba(232, 115, 74, 0.18),
      inset 0 0 0 1px rgba(255, 255, 255, 0.3);
  }
  50% {
    opacity: 1;
    border-color: rgba(255, 255, 255, 1);
    box-shadow:
      0 0 0 2px rgba(232, 115, 74, 0.28),
      0 0 64px rgba(232, 115, 74, 0.45),
      inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
}

@keyframes cfBreathe {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.75; }
}

.cf-fade-enter-active,
.cf-fade-leave-active {
  transition: opacity 0.45s ease;
}
.cf-fade-enter-from,
.cf-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .cf-border,
  .cf-glow,
  .cf-ambient {
    animation: none;
    opacity: 0.7;
  }
}
</style>
