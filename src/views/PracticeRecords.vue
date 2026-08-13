<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import api from '../api'
import GlobalTopbar from '../components/GlobalTopbar.vue'

const records = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 15
const loading = ref(true)
const listRef = ref<HTMLElement>()

const dailyStats = ref<any[]>([])
const stats = ref({ total: 0, correct: 0, accuracy: 0 })

const modeLabels: Record<string, string> = {
  typing: '拼写', cloze: '完形填空', translation: '句子翻译', listening: '听力'
}
const modeColors: Record<string, string> = {
  typing: '#6366f1', cloze: '#e8734a', translation: '#10b981', listening: '#f59e0b'
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))
const hasMore = computed(() => page.value < totalPages.value)

interface Slot {
  index: number; word: string; visible: boolean; correct: boolean; answer: string
}
function parseSlots(r: any): Slot[] {
  if (r.type !== 'sentence') return []
  try {
    const raw = typeof r.slot_results === 'string' ? JSON.parse(r.slot_results) : (r.slot_results || [])
    return raw as Slot[]
  } catch { return [] }
}

// ── Heatmap ──
interface Cell { date: string; count: number; correct: number; level: number }
const cells = computed<Cell[]>(() => {
  const dayMap = new Map<string, { count: number; correct: number }>()
  for (const d of dailyStats.value) {
    const key = String(d.date || '').substring(0, 10)
    dayMap.set(key, { count: d.count, correct: d.correct ?? 0 })
  }
  const max = dailyStats.value.length ? Math.max(...dailyStats.value.map((d: any) => d.count)) : 1
  const result: Cell[] = []
  const now = new Date()
  for (let i = 26 * 7 - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    const key = d.toISOString().substring(0, 10)
    const v = dayMap.get(key)
    const count = v?.count ?? 0
    result.push({ date: key, count, correct: v?.correct ?? 0, level: computeLevel(count, max) })
  }
  return result
})

const weeks = computed(() => {
  const w: Cell[][] = []
  for (let i = 0; i < cells.value.length; i += 7) w.push(cells.value.slice(i, i + 7))
  return w
})

function computeLevel(count: number, _max: number): number {
  if (count === 0) return 0
  if (count >= 80) return 7
  if (count >= 50) return 6
  if (count >= 35) return 5
  if (count >= 20) return 4
  if (count >= 10) return 3
  if (count >= 5)  return 2
  return 1
}

function fillPercent(count: number, level: number): number {
  if (level === 0) return 0
  // 每档内按比例填满：从每档下限到上限之间线性
  const lo = [0, 1, 5, 10, 20, 35, 50, 80][level]
  const hi = [1, 5, 10, 20, 35, 50, 80, 200][level]
  return Math.min(100, Math.round((count - lo) / (hi - lo) * 100))
}

// ── Tooltip ──
const tooltipCell = ref<Cell | null>(null)
const tooltipStyle = ref<Record<string, string>>({})
function onCellEnter(e: MouseEvent, cell: Cell) {
  tooltipCell.value = cell
  const el = e.target as HTMLElement
  const rect = el.getBoundingClientRect()
  tooltipStyle.value = { left: rect.left + rect.width / 2 + 'px', top: rect.top - 6 + 'px' }
}
function onCellLeave() { tooltipCell.value = null }

// ── 滚动加载 ──
let scrollBusy = false
function onScroll() {
  if (!listRef.value || scrollBusy || !hasMore.value) return
  const el = listRef.value
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
    scrollBusy = true
    page.value++
    loadRecords(false).finally(() => (scrollBusy = false))
  }
}

async function loadRecords(reset = true) {
  if (reset) { page.value = 1; records.value = [] }
  loading.value = true
  try {
    const { data } = await api.get('/practice/records', { params: { page: page.value, size: pageSize } })
    if (reset) records.value = data.items || []
    else records.value.push(...(data.items || []))
    total.value = data.total || 0
  } catch { if (reset) { records.value = []; total.value = 0 } }
  finally { loading.value = false }
}

async function loadDailyStats() {
  try {
    const { data } = await api.get('/practice/daily-stats', { params: { days: 365 } })
    dailyStats.value = data || []
  } catch { dailyStats.value = [] }
}

async function loadStats() {
  try {
    const { data } = await api.get('/practice/stats')
    stats.value = data
  } catch {}
}

function modeTag(m: string) { return modeLabels[m] || m }

function formatTime(ts: string) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(async () => {
  await Promise.all([loadRecords(), loadDailyStats(), loadStats()])
})
onUnmounted(() => { if (listRef.value) listRef.value.removeEventListener('scroll', onScroll) })
</script>

<template>
  <div class="records-page">
    <GlobalTopbar />
    <main class="main-area">

      <!-- 总览 -->
      <div class="overview-row">
        <div class="ov-card">
          <span class="ov-value">{{ stats.total }}</span>
          <span class="ov-label">总练习</span>
        </div>
        <div class="ov-card accent">
          <span class="ov-value">{{ stats.accuracy }}%</span>
          <span class="ov-label">正确率</span>
        </div>
        <div class="ov-card green">
          <span class="ov-value">{{ stats.correct }}</span>
          <span class="ov-label">答对</span>
        </div>
      </div>

      <!-- 热力图 -->
      <div v-if="cells.length > 0" class="heatmap-section">
        <h3 class="section-title">练习热力图</h3>
        <div class="heatmap-wrap">
          <div class="heat-y-labels">
            <span v-for="d in ['一','三','五','日']" :key="d">{{ d }}</span>
          </div>
          <div class="heat-grid">
            <template v-for="(week, wi) in weeks" :key="wi">
              <span v-for="(cell, di) in week" :key="di"
                class="heat-cell"
                :class="'lvl-' + cell.level"
                :style="{ '--fill': fillPercent(cell.count, cell.level) + '%' }"
                @mouseenter="onCellEnter($event, cell)"
                @mouseleave="onCellLeave">
                <span v-if="cell.level > 0" class="cell-fill" :style="{ height: fillPercent(cell.count, cell.level) + '%' }" />
              </span>
            </template>
          </div>
        </div>
        <div class="heat-legend">
          <span class="leg-label">少</span>
          <span class="leg-swatch lvl-0"><span class="sw-fill" /></span>
          <span class="leg-swatch lvl-1"><span class="sw-fill" style="height:15%" /></span>
          <span class="leg-swatch lvl-2"><span class="sw-fill" style="height:30%" /></span>
          <span class="leg-swatch lvl-3"><span class="sw-fill" style="height:45%" /></span>
          <span class="leg-swatch lvl-4"><span class="sw-fill" style="height:60%" /></span>
          <span class="leg-swatch lvl-5"><span class="sw-fill" style="height:75%" /></span>
          <span class="leg-swatch lvl-6"><span class="sw-fill" style="height:88%" /></span>
          <span class="leg-swatch lvl-7"><span class="sw-fill" style="height:100%" /></span>
          <span class="leg-label">多</span>
        </div>
      </div>

      <!-- 热力图 tooltip 浮层 -->
      <Teleport to="body">
        <div v-if="tooltipCell" class="heat-tooltip" :style="tooltipStyle">
          <div class="ht-date">{{ tooltipCell.date }}</div>
          <div v-if="tooltipCell.count === 0">无练习</div>
          <div v-else>练习 <b>{{ tooltipCell.count }}</b> 题 · 正确 <b>{{ tooltipCell.correct }}</b></div>
        </div>
      </Teleport>

      <!-- 记录列表 -->
      <h3 class="section-title">练习记录</h3>
      <div ref="listRef" class="records-scroll" @scroll="onScroll">
        <div v-if="records.length === 0 && !loading" class="empty-state">
          还没有练习记录，去<a href="/practice" style="color:#e8734a;margin-left:4px">练习</a>吧
        </div>
        <div v-else class="records-list">

          <template v-for="r in records" :key="r.type + '-' + r.id">
            <div v-if="r.type === 'word'" class="record-item">
              <div class="rec-left">
                <span :class="['rec-dot', r.correct ? 'ok' : 'err']" />
                <span class="rec-word">{{ r.word || r.answer }}</span>
                <span v-if="r.translation" class="rec-trans">{{ r.translation }}</span>
              </div>
              <div class="rec-right">
                <span class="rec-mode" :style="{ color: modeColors[r.mode] || '#b8a097' }">{{ modeTag(r.mode) }}</span>
                <span class="rec-time">{{ formatTime(r.created_at) }}</span>
              </div>
            </div>

            <div v-else class="record-sentence">
              <div class="rs-header">
                <span :class="['rs-badge', r.mode === 'cloze' ? 'bd-cloze' : 'bd-trans']">{{ modeTag(r.mode) }}</span>
                <span class="rs-time">{{ formatTime(r.created_at) }}</span>
                <span class="rs-score">{{ r.correct_slots }}/{{ r.total_slots }} 正确</span>
              </div>
              <p class="rs-chinese">{{ r.chinese }}</p>
              <div class="rs-slots">
                <template v-for="(s, i) in parseSlots(r)" :key="i">
                  <span v-if="s.visible" class="rs-punct">{{ s.word }}</span>
                  <span v-else :class="['rs-word', s.correct ? 'ok' : 'err']">{{ s.word }}</span>
                </template>
              </div>
            </div>
          </template>

          <div v-if="loading && records.length > 0" class="load-more">加载中...</div>
          <div v-else-if="!hasMore && records.length > 0" class="load-more end">— 已加载全部 —</div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.records-page { min-height: 100vh; background: transparent }
.main-area { width: min(1320px, calc(100% - 44px)); margin: 0 auto; padding: 36px 0 80px }

/* 总览 */
.overview-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 36px }
.ov-card { background: rgba(255,255,255,.78); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.65); border-radius: 20px; padding: 22px; text-align: center; box-shadow: 0 12px 36px rgba(184,160,151,.07), 0 4px 12px rgba(184,160,151,.04), inset 0 0 0 1px rgba(255,255,255,.5) }
.ov-value { font-size: 28px; font-weight: 700; color: #2d2422; display: block }
.ov-label { font-size: 13px; color: #b8a097; margin-top: 6px; display: block }
.ov-card.accent .ov-value { color: #e8734a }
.ov-card.green .ov-value { color: #5b9a5e }

/* 热力图 */
.heatmap-section { margin-bottom: 36px }
.section-title { font-size: 17px; font-weight: 700; color: #2d2422; margin: 0 0 16px; letter-spacing: -.2px }
.heatmap-wrap { display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,.78); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 20px; padding: 20px; border: 1px solid rgba(255,255,255,.65); overflow-x: auto; box-shadow: 0 12px 36px rgba(184,160,151,.07), 0 4px 12px rgba(184,160,151,.04), inset 0 0 0 1px rgba(255,255,255,.5) }
.heat-y-labels { display: flex; flex-direction: column; font-size: 10px; color: #b8a097; flex-shrink: 0; padding: 0 2px; justify-content: space-between; height: 98px }
.heat-grid { display: grid; grid-template-rows: repeat(7, 1fr); grid-auto-flow: column; gap: 3px; flex: 1 }
/* 热力图格子 —— 水位填充 + 发光（档位越高越亮） */
.heat-cell {
  width: clamp(12px, 1.05vw, 16px); height: clamp(12px, 1.05vw, 16px); border-radius: 3px; cursor: pointer; flex-shrink: 0;
  position: relative; overflow: hidden;
  background: #f0ece9;
  transition: transform .15s ease, box-shadow .15s ease;
}
.heat-cell:hover {
  transform: scale(1.5); z-index: 3;
  box-shadow: 0 0 10px rgba(232,115,74,.4);
}
.cell-fill {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, #fcd9a7 0%, #e8734a 100%);
  border-radius: 2px;
  transition: height .4s ease;
}
.heat-cell:hover .cell-fill { animation: shimmer 1.2s ease-in-out infinite }
@keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:.72} }
.heat-cell.lvl-0 .cell-fill { display: none }
.heat-cell.lvl-1 { background: #f5ede7 }
.heat-cell.lvl-1 .cell-fill { box-shadow: 0 0 3px rgba(232,115,74,.3) }
.heat-cell.lvl-2 .cell-fill { box-shadow: 0 0 5px rgba(232,115,74,.4) }
.heat-cell.lvl-3 .cell-fill { box-shadow: 0 0 7px rgba(232,115,74,.5) }
.heat-cell.lvl-4 .cell-fill { box-shadow: 0 0 9px rgba(232,115,74,.55) }
.heat-cell.lvl-5 .cell-fill { box-shadow: 0 0 11px rgba(232,115,74,.6) }
.heat-cell.lvl-6 .cell-fill { box-shadow: 0 0 13px rgba(232,115,74,.7) }
.heat-cell.lvl-7 .cell-fill { box-shadow: 0 0 15px rgba(232,115,74,.8); animation: pulse-glow 2s ease-in-out infinite }
@keyframes pulse-glow { 0%,100%{box-shadow:0 0 10px rgba(232,115,74,.6)} 50%{box-shadow:0 0 20px rgba(232,115,74,.95)} }
.heat-cell.lvl-2 { background: #efe3da }
.heat-cell.lvl-3 { background: #e8d5c6 }
.heat-cell.lvl-4 { background: #e0c4ad }
.heat-cell.lvl-5 { background: #d6b093 }
.heat-cell.lvl-6 { background: #cb9977 }
.heat-cell.lvl-7 { background: #c08058 }
.heat-legend { display: flex; align-items: center; gap: 4px; margin-top: 10px; font-size: 11px; color: #b8a097; justify-content: flex-end }

.leg-label { font-size: 11px }
.leg-swatch { width: 12px; height: 12px; border-radius: 3px; position: relative; overflow: hidden; background: #f0ece9 }
.leg-swatch.lvl-1 { background: #f5ede7 } .leg-swatch.lvl-2 { background: #efe3da }
.leg-swatch.lvl-3 { background: #e8d5c6 } .leg-swatch.lvl-4 { background: #e0c4ad }
.leg-swatch.lvl-5 { background: #d6b093 } .leg-swatch.lvl-6 { background: #cb9977 }
.leg-swatch.lvl-7 { background: #c08058 }
.sw-fill { position: absolute; left:0; right:0; bottom:0; background: linear-gradient(180deg, #fcd9a7 0%, #e8734a 100%); border-radius: 2px }

/* Tooltip 浮层 */
.heat-tooltip {
  position: fixed; z-index: 9999; transform: translate(-50%, -100%);
  background: #1e293b; color: #f1f5f9; padding: 8px 14px; border-radius: 10px;
  font-size: 13px; line-height: 1.5; white-space: nowrap; pointer-events: none;
  box-shadow: 0 8px 24px rgba(0,0,0,.2);
  animation: ttIn .15s ease-out;
}
.heat-tooltip::after {
  content: ''; position: absolute; top: 100%; left: 50%; margin-left: -5px;
  border: 5px solid transparent; border-top-color: #1e293b;
}
.ht-date { font-size: 11px; color: #94a3b8; margin-bottom: 2px }
.heat-tooltip b { color: #fff }
@keyframes ttIn { 0% { opacity: 0; transform: translate(-50%, calc(-100% + 4px)) } 100% { opacity: 1; transform: translate(-50%, -100%) } }

/* 滚动列表 */
.records-scroll { height: 460px; overflow-y: auto; background: rgba(255,255,255,.78); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 20px; border: 1px solid rgba(255,255,255,.65); padding: 10px 20px; box-shadow: 0 12px 36px rgba(184,160,151,.07), 0 4px 12px rgba(184,160,151,.04), inset 0 0 0 1px rgba(255,255,255,.5) }
.records-scroll::-webkit-scrollbar { width: 5px }
.records-scroll::-webkit-scrollbar-thumb { background: rgba(184,160,151,.25); border-radius: 3px }
.records-list { display: flex; flex-direction: column }

.record-item { display: flex; align-items: center; justify-content: space-between; padding: 11px 6px; border-bottom: 1px solid rgba(184,160,151,.08); transition: background .12s }
.record-item:hover { background: rgba(184,160,151,.03) }
.rec-left { display: flex; align-items: center; gap: 8px; min-width: 0 }
.rec-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0 }
.rec-dot.ok { background: #5b9a5e }
.rec-dot.err { background: #c94a4a }
.rec-word { font-size: 15px; font-weight: 600; color: #2d2422 }
.rec-trans { font-size: 12px; color: #b8a097; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px }
.rec-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0 }
.rec-mode { font-size: 11px; font-weight: 600; white-space: nowrap }
.rec-time { font-size: 11px; color: #b8a097; white-space: nowrap }

.record-sentence { background: #fdfbf7; border-radius: 12px; padding: 14px 16px; margin: 4px 0; border: 1px solid rgba(184,160,151,.1) }
.rs-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px }
.rs-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 5px }
.bd-cloze { background: #fef3ee; color: #e8734a }
.bd-trans { background: rgba(254,243,199,.5); color: #c9782d }
.rs-time { font-size: 11px; color: #b8a097 }
.rs-score { font-size: 11px; color: #b8a097; margin-left: auto }
.rs-chinese { font-size: 14px; color: #2d2422; margin: 0 0 8px; line-height: 1.5 }
.rs-slots { display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
.rs-punct { font-size: 13px; color: #b8a097; padding: 0 1px }
.rs-word { font-size: 13px; font-weight: 500; padding: 3px 8px; border-radius: 5px; background: rgba(184,160,151,.06); color: #b8a097 }
.rs-word.ok { background: rgba(220,252,231,.6); color: #5b9a5e }
.rs-word.err { background: rgba(254,226,226,.5); color: #c94a4a }

.empty-state { text-align: center; padding: 80px 0; color: #b8a097 }
.load-more { text-align: center; padding: 14px 0; font-size: 12px; color: #b8a097 }
.load-more.end { color: rgba(184,160,151,.5) }

@media (max-width: 768px) {
  .main-area { width: calc(100% - 16px); padding: 24px 0 60px }
  .overview-row { grid-template-columns: repeat(3, 1fr); gap: 10px }
  .ov-card { padding: 14px }
  .ov-value { font-size: 22px }
  .rec-time { display: none }
  .records-scroll { height: 320px }
  .heat-cell { width: 11px; height: 11px; border-radius: 2px; overflow: hidden }
  .heat-grid { gap: 2px }
}
</style>
