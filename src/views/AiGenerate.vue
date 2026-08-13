<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import GlobalTopbar from '../components/GlobalTopbar.vue'
import api from '../api'

const router = useRouter()

const mode = ref<'word' | 'sentence'>('word')
const topic = ref('')
const count = ref(10)
// 上限：单词 100，句子 200
const countMax = computed(() => mode.value === 'word' ? 100 : 200)
const countMin = computed(() => mode.value === 'word' ? 5 : 5)

// 切换模式时修正越界值
watch(mode, () => {
  result.value = null
  progress.value = null
  clampCount()
})
function clampCount() {
  if (count.value > countMax.value) count.value = countMax.value
  if (count.value < countMin.value) count.value = 10
}
const difficulty = ref(2)
const language = ref('en')
const generating = ref(false)
const result = ref<any>(null)
const error = ref('')
const countdown = ref(0)
const progress = ref<{ done: number; total: number; batch: number; totalBatches: number } | null>(null)
const progressPercent = computed(() => {
  if (!progress.value) return 0
  return Math.round((progress.value.done / progress.value.total) * 100)
})
const topicPresets = ['日常', '商务', '科技', '旅行', '学术', '美食', '运动', '自然']

async function generate() {
  if (generating.value) return
  generating.value = true; error.value = ''; result.value = null; progress.value = null
  try {
    if (mode.value === 'word') {
      const { data } = await api.post('/ai/generate-words', {
        topic: topic.value || '日常', count: count.value,
        difficulty: difficulty.value, language: language.value
      })
      result.value = { ...data, mode: 'word' }
    } else {
      await generateSentencesStream()
    }
  } catch (e: any) { error.value = e.response?.data?.msg || e.message || '生成失败,请检查 AI 服务' }
  finally { generating.value = false }
}

async function generateSentencesStream() {
  const token = localStorage.getItem('token')
  const res = await fetch('/api/ai/generate-sentences-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      topic: topic.value || '日常', count: count.value,
      difficulty: difficulty.value, language: language.value
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''
  const currentData: string[] = []

  function dispatch() {
    if (currentData.length === 0) return
    const text = currentData.join('\n')
    try {
      const parsed = JSON.parse(text)
      if (currentEvent === 'progress' || parsed.type === 'progress') {
        progress.value = parsed
      } else if (currentEvent === 'done' || parsed.type === 'done') {
        result.value = { ...parsed, success: true }
      } else if (currentEvent === 'error' || parsed.type === 'error') {
        error.value = parsed.msg || '生成失败'
      }
    } catch { /* skip */ }
    currentData.length = 0
  }

  function processLine(line: string) {
    if (line.startsWith('event:')) {
      currentEvent = line[6] === ' ' ? line.slice(7).trim() : line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      currentData.push(line[5] === ' ' ? line.slice(6) : line.slice(5))
    } else if (line === '') {
      dispatch(); currentEvent = ''
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      processLine(buffer.slice(0, nl).replace(/\r$/, ''))
      buffer = buffer.slice(nl + 1)
    }
  }
  if (buffer.trim()) processLine(buffer.replace(/\r$/, ''))
  dispatch()
}

function startPractice() {
  doCountdown('/practice/sentence')
}
function startClozePractice() {
  doCountdown('/practice/cloze')
}

function doCountdown(path: string) {
  countdown.value = 3
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) { clearInterval(timer); router.push(path) }
  }, 1000)
}
</script>

<template>
  <div class="ai-generate">
    <GlobalTopbar />
    <main class="main-area">
      <div class="gen-card">
        <section class="gen-config">
          <span class="section-kicker">QUESTION STUDIO</span>
          <h2>让 AI 帮你出题</h2>
          <p class="subtitle">选好参数，AI 自动生成题目并写入词库</p>

        <div class="mode-switch">
          <button :class="['mode-btn', { active: mode === 'word' }]" @click="mode = 'word'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>单词
          </button>
          <button :class="['mode-btn', { active: mode === 'sentence' }]" @click="mode = 'sentence'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>句子
          </button>
        </div>

        <div class="params">
          <div class="param-group">
            <label>主题</label>
            <div class="topic-chips">
              <button v-for="t in topicPresets" :key="t" :class="['chip', { active: topic === t }]" @click="topic = topic === t ? '' : t">{{ t }}</button>
            </div>
            <input v-model="topic" class="topic-input" placeholder="或自定义主题..." />
          </div>
          <div class="param-row">
            <div class="param-group">
              <label>数量（{{ countMin }}-{{ countMax }}）</label>
              <div class="stepper">
                <button @click="count = Math.max(countMin, count - 5)">-</button>
                <input v-model.number="count" class="stepper-input" @blur="clampCount" />
                <button @click="count = Math.min(countMax, count + 5)">+</button>
              </div>
            </div>
            <div class="param-group">
              <label>难度</label>
              <div class="stars">
                <button v-for="d in 5" :key="d" :class="['star', { active: d <= difficulty }]" @click="difficulty = d">
                  <svg width="18" height="18" viewBox="0 0 24 24" :fill="d <= difficulty ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <span class="diff-label">{{ {1:'入门',2:'基础',3:'中级',4:'进阶',5:'挑战'}[difficulty] }}</span>
              </div>
            </div>
          </div>
        </div>

        <button class="gen-btn" :disabled="generating" @click="generate">
          <span v-if="generating" class="spinner" />
          <span v-else>生成{{ mode === 'word' ? '单词' : '句子' }}</span>
        </button>

        <!-- 分批进度 -->
        <div v-if="generating && progress" class="progress-box">
          <div class="progress-bar-wrap"><div class="progress-bar-fill" :style="{ width: progressPercent + '%' }" /></div>
          <p class="progress-text">第 {{ progress.batch }}/{{ progress.totalBatches }} 批，已生成 {{ progress.done }}/{{ progress.total }} 句</p>
        </div>
        <div v-else-if="generating && mode !== 'word'" class="progress-box">
          <div class="progress-bar-wrap"><div class="progress-bar-fill indeterminate" /></div>
          <p class="progress-text">AI 正在出题...</p>
        </div>

          <div v-if="error" class="error-box">{{ error }}</div>
        </section>

        <aside class="gen-preview" aria-label="当前生成方案">
          <span class="preview-orbit" aria-hidden="true">
            <i /><i /><i />
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v18M3 12h18"/><path d="m5.6 5.6 12.8 12.8M18.4 5.6 5.6 18.4"/></svg>
          </span>
          <span class="preview-label">本次生成</span>
          <strong>{{ count }} {{ mode === 'word' ? '个单词' : '个句子' }}</strong>
          <p>{{ topic || '自由主题' }}</p>
          <span class="preview-level">难度 {{ difficulty }}/5 · {{ {1:'入门',2:'基础',3:'中级',4:'进阶',5:'挑战'}[difficulty] }}</span>
          <div class="preview-steps"><span class="done">设定</span><i /><span>生成</span><i /><span>入库</span></div>
        </aside>

        <!-- 单词结果 -->
        <div v-if="result && result.success && result.mode === 'word'" class="result-box">
          <div class="result-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>已生成 {{ result.created }} 个单词{{ result.skipped ? `，${result.skipped} 个跳过（已存在）` : '' }}</span>
          </div>
          <div v-if="result.words" class="result-words">
            <span v-for="w in result.words.slice(0, 20)" :key="w" class="result-word">{{ w }}</span>
            <span v-if="result.words.length > 20" class="result-more">...等 {{ result.words.length }} 个</span>
          </div>
          <button class="start-btn" @click="startClozePractice">开始练习 →</button>
          <div v-if="countdown > 0" class="countdown-overlay"><div class="countdown-num">{{ countdown }}</div><p>即将开始练习...</p></div>
        </div>

        <!-- 句子结果 -->
        <div v-if="result && result.success && !result.mode" class="result-box">
          <div class="result-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>已生成 {{ result.created }} 个句子</span>
          </div>
          <div v-if="result.sentences" class="result-sentences">
            <div v-for="(s, i) in result.sentences.slice(0, 30)" :key="i" class="result-sentence">
              <span class="rs-en">{{ s.english }}</span>
              <span class="rs-cn">{{ s.chinese }}</span>
            </div>
            <span v-if="result.sentences.length > 30" class="result-more">...等 {{ result.sentences.length }} 句</span>
          </div>
          <div class="result-actions">
            <button class="start-btn" @click="startPractice">句子翻译练习 →</button>
            <button class="start-btn secondary" @click="startClozePractice">完形填空练习 →</button>
          </div>
          <div v-if="countdown > 0" class="countdown-overlay"><div class="countdown-num">{{ countdown }}</div><p>即将开始练习...</p></div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.ai-generate{min-height:100vh;background:transparent}
.main-area{width:min(1320px,calc(100% - 44px));margin:0 auto;padding:36px 0 80px;box-sizing:border-box}
.gen-card{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:44px;background:rgba(255,255,255,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.65);border-radius:24px;padding:40px;box-shadow:0 14px 40px rgba(184,160,151,.08),0 4px 12px rgba(184,160,151,.04),inset 0 0 0 1px rgba(255,255,255,.5)}
.gen-config{min-width:0}
.section-kicker{display:block;margin-bottom:8px;color:#e8734a;font-size:9px;font-weight:800;letter-spacing:1.6px}
.gen-card h2{font-size:22px;color:#2d2422;margin:0 0 4px}
.subtitle{font-size:14px;color:#b8a097;margin:0 0 28px}
.mode-switch{display:flex;gap:8px;margin-bottom:24px}
.mode-btn{flex:1;padding:12px;border:1.5px solid rgba(255,255,255,.65);border-radius:14px;background:rgba(255,255,255,.6);color:#8b7b74;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s}
.mode-btn:hover{border-color:rgba(232,115,74,.4);background:#fff}.mode-btn.active{border-color:#e8734a;color:#e8734a;background:#fff}
.params{margin-bottom:24px}
.param-group{margin-bottom:16px}.param-group label{display:block;font-size:13px;font-weight:600;color:#2d2422;margin-bottom:8px}
.topic-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.chip{padding:6px 16px;border:1px solid rgba(255,255,255,.65);border-radius:20px;background:rgba(255,255,255,.6);color:#2d2422;font-size:13px;cursor:pointer;transition:all .15s}
.chip:hover{border-color:rgba(232,115,74,.4);background:#fff}.chip.active{border-color:#e8734a;background:#fff;color:#e8734a;font-weight:600}
.topic-input{width:100%;padding:12px 18px;border:1.5px solid rgba(184,160,151,.15);border-radius:14px;font-size:15px;outline:0;box-sizing:border-box;background:rgba(255,255,255,.7);color:#2d2422;transition:all .15s}.topic-input:focus{border-color:rgba(232,115,74,.45);background:#fff;box-shadow:0 0 0 4px rgba(232,115,74,.08)}
.topic-input::placeholder{color:#b8a097}
.param-row{display:flex;gap:24px}
.stepper{display:flex;align-items:center;gap:0;border:1.5px solid rgba(255,255,255,.65);border-radius:12px;overflow:hidden;width:fit-content;background:rgba(255,255,255,.6)}
.stepper button{width:38px;height:38px;border:none;background:transparent;font-size:18px;cursor:pointer;color:#2d2422;display:flex;align-items:center;justify-content:center;transition:all .15s}
.stepper button:hover{background:rgba(232,115,74,.08);color:#e8734a}
.stepper-val{width:48px;text-align:center;font-size:16px;font-weight:700;color:#2d2422}
.stepper-input{width:52px;border:none;text-align:center;font-size:16px;font-weight:700;color:#2d2422;background:0 0;outline:0;padding:0;-moz-appearance:textfield}
.stepper-input::-webkit-outer-spin-button,.stepper-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.stepper-input:focus{color:#e8734a}
.stars{display:flex;align-items:center;gap:2px}.star{background:0 0;border:none;cursor:pointer;color:#e8a44a;padding:0;display:flex}.star:hover{transform:scale(1.1)}
.diff-label{font-size:13px;color:#b8a097;margin-left:8px}
.gen-btn{width:100%;padding:14px;background:#e8734a;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;box-shadow:0 4px 12px rgba(232,115,74,.2)}
.gen-btn:hover:not(:disabled){background:#d4653a;transform:translateY(-1px);box-shadow:0 8px 20px rgba(232,115,74,.3)}.gen-btn:disabled{opacity:.7;cursor:not-allowed}
.spinner{width:20px;height:20px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

.gen-preview{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;min-height:360px;padding:34px;box-sizing:border-box;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:linear-gradient(155deg,rgba(38,33,31,.96),rgba(65,49,43,.93));color:#fff;box-shadow:0 24px 48px rgba(62,44,36,.2),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
.gen-preview::before{content:'';position:absolute;inset:-35% -20% auto;height:60%;background:radial-gradient(ellipse,rgba(255,148,105,.2),transparent 68%);filter:blur(12px);animation:previewGlow 6s ease-in-out infinite alternate}
.gen-preview::after{content:'';position:absolute;right:-70px;bottom:-85px;width:210px;height:210px;border:1px solid rgba(255,255,255,.1);border-radius:50%;box-shadow:0 0 0 28px rgba(255,255,255,.025),0 0 0 58px rgba(255,255,255,.018)}
.preview-orbit{display:grid;place-items:center;width:66px;height:66px;margin-bottom:38px;border:1px solid rgba(255,255,255,.16);border-radius:50%;color:#ff9a76}
.preview-orbit i{position:absolute;width:5px;height:5px;border-radius:50%;background:#ff8b64;box-shadow:0 0 10px #ff8b64}
.preview-orbit i:nth-child(1){transform:translate(31px,-13px)}.preview-orbit i:nth-child(2){transform:translate(-26px,23px)}.preview-orbit i:nth-child(3){transform:translate(8px,34px)}
.preview-label{color:rgba(255,255,255,.54);font-size:10px;font-weight:750;letter-spacing:1.5px}
.gen-preview strong{margin-top:7px;font-size:30px;line-height:1.15;letter-spacing:-.7px}.gen-preview p{margin:8px 0 18px;color:rgba(255,255,255,.72);font-size:15px}.preview-level{padding:7px 11px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.76);font-size:11px}
.preview-steps{position:relative;z-index:1;display:flex;align-items:center;width:100%;margin-top:36px;color:rgba(255,255,255,.4);font-size:10px}.preview-steps i{flex:1;height:1px;margin:0 7px;background:rgba(255,255,255,.14)}.preview-steps .done{color:#ff9a76}
@keyframes previewGlow{to{transform:translate(18%,18%) scale(1.12);opacity:.62}}
.progress-box{margin-top:16px;padding:18px;background:rgba(255,255,255,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:14px;border:1px solid rgba(255,255,255,.65);box-shadow:0 6px 18px rgba(184,160,151,.05)}
.progress-bar-wrap{height:6px;background:rgba(184,160,151,.12);border-radius:999px;overflow:hidden;margin-bottom:10px}
.progress-bar-fill{height:100%;background:linear-gradient(90deg,#e8734a,#f0a478);border-radius:999px;transition:width .4s}
.progress-bar-fill.indeterminate{width:30%;animation:indeterminate-bar 1.5s ease-in-out infinite}
@keyframes indeterminate-bar{0%{transform:translateX(-100%)}100%{transform:translateX(430%)}}
.progress-text{font-size:13px;color:#b8a097;margin:0;text-align:center}

.error-box{margin-top:16px;padding:12px 16px;background:rgba(254,226,226,.5);color:#c94a4a;border-radius:10px;font-size:14px}
.result-box{grid-column:1/-1;margin-top:0;padding:22px;background:rgba(255,255,255,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:18px;border:1px solid rgba(255,255,255,.65);position:relative;box-shadow:0 8px 24px rgba(184,160,151,.06)}
.result-header{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;color:#2d2422;margin-bottom:14px}
.result-words{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.result-word{padding:5px 12px;background:rgba(255,255,255,.8);border-radius:8px;font-size:13px;color:#2d2422;border:1px solid rgba(255,255,255,.65)}
.result-sentences{display:flex;flex-direction:column;gap:8px;margin-bottom:18px;max-height:300px;overflow-y:auto}
.result-sentence{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,.8);border-radius:10px;border:1px solid rgba(255,255,255,.65);font-size:14px}
.rs-en{color:#2d2422;font-weight:500;flex:1}
.rs-cn{color:#b8a097;margin-left:12px;flex-shrink:0}
.result-more{font-size:12px;color:#b8a097;display:flex;align-items:center}
.result-actions{display:flex;gap:12px}
.start-btn{padding:12px 28px;background:linear-gradient(135deg,#e8734a,#f0a060);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;transition:all .15s;box-shadow:0 6px 18px rgba(232,115,74,.25)}
.start-btn:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(232,115,74,.35)}
.start-btn.secondary{background:#fff;color:#e8734a;border:1.5px solid rgba(232,115,74,.25);box-shadow:none}
.start-btn.secondary:hover{background:#fff5f0;border-color:#e8734a}
.countdown-overlay{position:absolute;inset:0;background:rgba(255,251,246,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2}
.countdown-num{font-size:56px;font-weight:800;color:#e8734a;animation:pop .5s ease}
.countdown-overlay p{color:#2d2422;font-size:15px;margin:8px 0 0}
@keyframes pop{0%{transform:scale(.5);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
@media(max-width:900px){.main-area{width:calc(100% - 24px);padding:28px 0 60px}.gen-card{grid-template-columns:1fr;padding:28px;gap:24px}.gen-preview{min-height:260px}.preview-orbit{margin-bottom:24px}}
@media(max-width:560px){.main-area{width:calc(100% - 16px)}.gen-card{padding:22px 18px}.param-row{flex-direction:column;gap:4px}.result-actions{flex-direction:column}}
</style>
