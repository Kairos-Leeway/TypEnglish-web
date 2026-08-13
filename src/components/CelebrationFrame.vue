<script setup lang="ts">
import { computed, watch } from 'vue'

const props = defineProps<{ modelValue: boolean; correctCount: number }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; done: [] }>()

const tier = computed(() => {
  if (props.correctCount >= 8) return 'grand'
  if (props.correctCount >= 4) return 'bright'
  return 'gentle'
})

const sparkCount = computed(() => Math.min(Math.max(props.correctCount, 0), 16))
const sparks = computed(() => Array.from({ length: sparkCount.value }, (_, index) => {
  const angle = -160 + (320 / Math.max(sparkCount.value - 1, 1)) * index
  const distance = 105 + (index % 3) * 22 + (tier.value === 'grand' ? 28 : 0)
  const radians = angle * Math.PI / 180
  return {
    x: `${Math.cos(radians) * distance}px`,
    y: `${Math.sin(radians) * distance * 0.72}px`,
    delay: `${index * 55}ms`,
    size: `${5 + (index % 4) * 1.5}px`,
  }
}))

let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.modelValue,
  (v) => {
    if (timer) { clearTimeout(timer); timer = null }
    if (!v) return
    timer = setTimeout(() => {
      emit('update:modelValue', false)
      emit('done')
    }, 2400)
  },
  { immediate: true }
)
</script>

<template>
  <Transition name="cf-fade">
    <div v-if="modelValue && correctCount > 0" class="celebration-frame" :class="`is-${tier}`" aria-hidden="true">
      <div class="score-bloom">
        <div class="bloom-halo" />
        <div v-if="tier === 'grand'" class="bloom-rays" />
        <span
          v-for="(spark, index) in sparks"
          :key="index"
          class="answer-spark"
          :style="{ '--spark-x': spark.x, '--spark-y': spark.y, '--spark-delay': spark.delay, '--spark-size': spark.size }"
        />
        <div class="score-token">
          <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="5 13 9 17 19 7" /></svg>
          <strong>+{{ correctCount }}</strong>
          <span>答对</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.celebration-frame {
  position: fixed;
  inset: 0;
  z-index: 999;
  pointer-events: none;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.score-bloom {
  position: relative;
  width: 1px;
  height: 1px;
  transform: translateY(-42px);
}
.bloom-halo {
  position: absolute;
  width: 420px;
  height: 280px;
  left: -210px;
  top: -140px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(240, 192, 96, .2), rgba(232, 115, 74, .07) 42%, transparent 72%);
  animation: bloomIn 1.8s cubic-bezier(.2,.8,.2,1) both;
}
.is-gentle .bloom-halo { opacity: .5; transform: scale(.72); }
.bloom-rays {
  position: absolute;
  width: 260px;
  height: 260px;
  left: -130px;
  top: -130px;
  border-radius: 50%;
  background: repeating-conic-gradient(from 8deg, rgba(240,192,96,.18) 0 2deg, transparent 2deg 22deg);
  mask: radial-gradient(circle, transparent 0 30%, #000 65%, transparent 72%);
  animation: rayTurn 2.2s ease-out both;
}
.answer-spark {
  --spark-x: 0px;
  --spark-y: 0px;
  --spark-delay: 0ms;
  --spark-size: 6px;
  position: absolute;
  width: var(--spark-size);
  height: var(--spark-size);
  left: calc(var(--spark-size) / -2);
  top: calc(var(--spark-size) / -2);
  border-radius: 50%;
  background: #f0c060;
  box-shadow: 0 0 0 3px rgba(240,192,96,.12), 0 0 16px rgba(232,115,74,.55);
  animation: sparkFlight 1.45s var(--spark-delay) cubic-bezier(.16,.8,.3,1) both;
}
.answer-spark:nth-of-type(3n) { background: #e8734a; }
.answer-spark:nth-of-type(3n + 1) { background: #5b9a5e; }
.score-token {
  position: absolute;
  left: -42px;
  top: -42px;
  width: 84px;
  height: 84px;
  display: grid;
  grid-template-columns: 24px auto;
  grid-template-rows: 1fr 1fr;
  align-items: center;
  justify-content: center;
  column-gap: 4px;
  color: #8d541e;
  background: rgba(255,252,244,.95);
  border: 1px solid rgba(232,164,74,.28);
  border-radius: 50%;
  box-shadow: 0 12px 40px rgba(115,74,31,.16), inset 0 0 0 5px rgba(240,192,96,.1);
  animation: tokenPop 1.8s cubic-bezier(.18,1.4,.3,1) both;
}
.score-token svg { width: 24px; grid-row: 1 / 3; fill: none; stroke: #5b9a5e; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.score-token strong { align-self: end; font-size: 21px; line-height: 1; }
.score-token span { align-self: start; font-size: 11px; font-weight: 650; color: #a87a4e; }
.is-gentle .score-token { transform: scale(.9); }

@keyframes bloomIn {
  0% { opacity: 0; transform: scale(.35); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.18); }
}
@keyframes rayTurn {
  0% { opacity: 0; transform: scale(.5) rotate(-20deg); }
  35% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.15) rotate(18deg); }
}
@keyframes sparkFlight {
  0% { opacity: 0; transform: translate(0, 0) scale(.2); }
  24% { opacity: 1; }
  72% { opacity: .9; }
  100% { opacity: 0; transform: translate(var(--spark-x), var(--spark-y)) scale(.65); }
}
@keyframes tokenPop {
  0% { opacity: 0; transform: scale(.45) rotate(-8deg); }
  22% { opacity: 1; transform: scale(1.08) rotate(2deg); }
  55% { opacity: 1; transform: scale(1) rotate(0); }
  100% { opacity: 0; transform: scale(.94) translateY(-12px); }
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
  .bloom-halo,
  .bloom-rays,
  .answer-spark,
  .score-token {
    animation: none;
    display: none;
  }
}
</style>
