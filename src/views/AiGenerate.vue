<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const mode = ref<'word' | 'sentence' | 'cloze'>('word')
const topic = ref('')
const count = ref(10)
const difficulty = ref(2)
const language = ref('en')
const generating = ref(false)
const result = ref<any>(null)
const error = ref('')
const countdown = ref(0)
const topicPresets = ['日常', '商务', '科技', '旅行', '学术', '美食', '运动', '自然']

async function generate() {
  if (generating.value) return
  generating.value = true; error.value = ''; result.value = null
  try {
    if (mode.value === 'word') {
      const { data } = await api.post('/ai/generate-words', { topic: topic.value || '日常', count: count.value, difficulty: difficulty.value, language: language.value })
      result.value = { ...data, mode: 'word' }
    } else if (mode.value === 'sentence') {
      const { data } = await api.post('/ai/generate-sentences', { topic: topic.value || '日常', count: Math.min(count.value, 10), difficulty: difficulty.value, language: language.value })
      result.value = { ...data, mode: 'sentence' }
    } else {
      const { data } = await api.post('/ai/generate-sentences', { topic: topic.value || '日常', count: Math.min(count.value, 10), difficulty: difficulty.value, language: language.value })
      result.value = { ...data, mode: 'cloze' }
    }
  } catch (e: any) { error.value = e.response?.data?.msg || e.message || '生成失败,请检查 AI 服务' }
  finally { generating.value = false }
}

function startPractice() {
  if (result.value?.mode === 'sentence') doCountdown('/practice/sentence')
  else if (result.value?.mode === 'cloze') doCountdown('/practice/cloze')
  else doCountdown('/practice')
}

function doCountdown(path: string) {
  countdown.value = 3
  const timer = setInterval(() => { countdown.value--; if (countdown.value <= 0) { clearInterval(timer); router.push(path) } }, 1000)
}
</script>

<template>
  <div class="ai-generate">
    <header class="topbar"><div class="topbar-inner"><router-link to="/" class="logo-link"><span class="logo-icon">T</span></router-link><span class="page-title">TypEnglish · AI 出题</span><div style="flex:1"/><router-link to="/" class="back-link">退出</router-link></div></header>
    <main class="main-area">
      <div class="gen-card"><h2>让 AI 帮你出题</h2><p class="subtitle">选好参数,AI 自动生成题目并写入词库</p>

        <div class="mode-switch">
          <button :class="['mode-btn',{active:mode==='word'}]" @click="mode='word'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>单词</button>
          <button :class="['mode-btn',{active:mode==='sentence'}]" @click="mode='sentence'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>句子</button>
          <button :class="['mode-btn',{active:mode==='cloze'}]" @click="mode='cloze'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="12" y2="15"/></svg>完形</button>
        </div>

        <div class="params">
          <div class="param-group"><label>主题</label><div class="topic-chips"><button v-for="t in topicPresets" :key="t" :class="['chip',{active:topic===t}]" @click="topic=topic===t?'':t">{{t}}</button></div><input v-model="topic" class="topic-input" placeholder="或自定义主题..."/></div>
          <div class="param-row"><div class="param-group"><label>数量</label><div class="stepper"><button @click="count=Math.max(mode!=='word'?3:5,count-5)">-</button><span class="stepper-val">{{count}}</span><button @click="count=Math.min(mode!=='word'?15:50,count+5)">+</button></div></div><div class="param-group"><label>难度</label><div class="stars"><button v-for="d in 5" :key="d" :class="['star',{active:d<=difficulty}]" @click="difficulty=d"><svg width="18" height="18" viewBox="0 0 24 24" :fill="d<=difficulty?'currentColor':'none'" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button><span class="diff-label">{{{1:'入门',2:'基础',3:'中级',4:'进阶',5:'挑战'}[difficulty]}}</span></div></div></div>
        </div>

        <button class="gen-btn" :disabled="generating" @click="generate"><span v-if="generating" class="spinner"/><span v-else>生成{{mode==='word'?'单词':mode==='sentence'?'句子':'完形'}}</span></button>
        <div v-if="error" class="error-box">{{error}}</div>

        <div v-if="result && result.success" class="result-box">
          <div class="result-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>已生成 {{result.created}} 个{{mode==='word'?'单词':mode==='cloze'?'完形':'句子'}}{{result.skipped?`, ${result.skipped} 个跳过(已存在)`:''}}</span></div>
          <div v-if="mode==='word' && result.words" class="result-words"><span v-for="w in result.words.slice(0,20)" :key="w" class="result-word">{{w}}</span><span v-if="result.words.length>20" class="result-more">...等 {{result.words.length}} 个</span></div>
          <button class="start-btn" @click="startPractice">{{mode==='cloze'?'开始练习':'开始练习'}} →</button>
          <div v-if="countdown>0" class="countdown-overlay"><div class="countdown-num">{{countdown}}</div><p>即将开始练习...</p></div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.ai-generate{min-height:100vh;background:#fef9f4}
.topbar{display:flex;align-items:center;height:56px;padding:0 24px;background:rgba(255,255,255,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(184,160,151,.15)}
.topbar-inner{display:flex;align-items:center;width:100%}
.logo-link{text-decoration:none}.logo-icon{width:30px;height:30px;background:#e8734a;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.page-title{margin-left:12px;font-size:15px;font-weight:600;color:#2d2422}
.back-link{font-size:14px;color:#b8a097;text-decoration:none;transition:color .15s;font-weight:500;margin-left:20px}.back-link:hover{color:#e8734a}
.main-area{max-width:640px;margin:0 auto;padding:60px 48px}
.gen-card{background:#fff;border-radius:20px;padding:40px;border:1px solid rgba(184,160,151,.18);box-shadow:0 1px 3px rgba(0,0,0,.04)}
.gen-card h2{font-size:22px;color:#2d2422;margin:0 0 4px}
.subtitle{font-size:14px;color:#b8a097;margin:0 0 28px}
.mode-switch{display:flex;gap:8px;margin-bottom:24px}
.mode-btn{flex:1;padding:12px;border:2px solid rgba(184,160,151,.18);border-radius:12px;background:#fff;color:#b8a097;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s}
.mode-btn:hover{border-color:rgba(232,115,74,.4)}.mode-btn.active{border-color:#e8734a;color:#e8734a;background:#fef3ee}
.params{margin-bottom:24px}
.param-group{margin-bottom:16px}.param-group label{display:block;font-size:13px;font-weight:600;color:#2d2422;margin-bottom:8px}
.topic-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.chip{padding:5px 14px;border:1px solid rgba(184,160,151,.18);border-radius:20px;background:#fff;color:#2d2422;font-size:13px;cursor:pointer;transition:all .15s}
.chip:hover{border-color:rgba(232,115,74,.4)}.chip.active{border-color:#e8734a;background:#fef3ee;color:#e8734a;font-weight:600}
.topic-input{width:100%;padding:10px 14px;border:1.5px solid rgba(184,160,151,.18);border-radius:10px;font-size:14px;outline:0;box-sizing:border-box;background:#fff;color:#2d2422}.topic-input:focus{border-color:#e8734a;background:#fff}
.topic-input::placeholder{color:#b8a097}
.param-row{display:flex;gap:24px}
.stepper{display:flex;align-items:center;gap:0;border:1.5px solid rgba(184,160,151,.18);border-radius:10px;overflow:hidden;width:fit-content}
.stepper button{width:38px;height:38px;border:none;background:#fff;font-size:18px;cursor:pointer;color:#2d2422;display:flex;align-items:center;justify-content:center}
.stepper button:hover{background:#fef3ee}
.stepper-val{width:48px;text-align:center;font-size:16px;font-weight:700;color:#2d2422}
.stars{display:flex;align-items:center;gap:2px}.star{background:0 0;border:none;cursor:pointer;color:#e8a44a;padding:0;display:flex}.star:hover{transform:scale(1.1)}
.diff-label{font-size:13px;color:#b8a097;margin-left:8px}
.gen-btn{width:100%;padding:14px;background:#e8734a;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;box-shadow:0 4px 12px rgba(232,115,74,.2)}
.gen-btn:hover:not(:disabled){background:#d4653a;transform:translateY(-1px);box-shadow:0 8px 20px rgba(232,115,74,.3)}.gen-btn:disabled{opacity:.7;cursor:not-allowed}
.spinner{width:20px;height:20px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.error-box{margin-top:16px;padding:12px 16px;background:rgba(254,226,226,.5);color:#c94a4a;border-radius:10px;font-size:14px}
.result-box{margin-top:20px;padding:20px;background:#fef9f4;border-radius:14px;border:1px solid rgba(232,115,74,.15);position:relative}
.result-header{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:#2d2422;margin-bottom:12px}
.result-words{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.result-word{padding:4px 10px;background:#fff;border-radius:6px;font-size:13px;color:#2d2422;border:1px solid rgba(184,160,151,.18)}
.result-more{font-size:12px;color:#b8a097;display:flex;align-items:center}
.start-btn{padding:10px 28px;background:#e8734a;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all .15s;box-shadow:0 4px 12px rgba(232,115,74,.2)}
.start-btn:hover{background:#d4653a;transform:translateY(-1px);box-shadow:0 6px 20px rgba(232,115,74,.3)}
.countdown-overlay{position:absolute;inset:0;background:rgba(254,249,244,.95);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.countdown-num{font-size:56px;font-weight:800;color:#e8734a;animation:pop .5s ease}
.countdown-overlay p{color:#2d2422;font-size:15px;margin:8px 0 0}
@keyframes pop{0%{transform:scale(.5);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
</style>
