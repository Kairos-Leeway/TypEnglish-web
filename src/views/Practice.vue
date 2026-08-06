<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api'
import { speak } from '../composables/useTts'
import { playChime, playKeytap } from '../composables/useChime'
import { useWordLookup } from '../composables/useWordLookup'
import { useXp } from '../composables/useXp'
const { level, progress, gain: gainXp } = useXp()
const { lookup } = useWordLookup()

const route = useRoute()
const words = ref<any[]>([])
const currentIndex = ref(0)
const userInput = ref('')
const loading = ref(true)
const finished = ref(false)
const correctCount = ref(0)
const results = ref<Array<{word:any;correct:boolean;answer:string;attempts:number}>>([])
const attempts = ref(0)
const showHint = ref(false)
const showAnswer = ref(false)
const mustRetype = ref(false)
const shaking = ref(false)
const inputRef = ref<HTMLInputElement>()
const selectedCategory = ref('')
const MAX_ATTEMPTS = 3
const fetchedPhonetic = ref<string|null>(null)
const fetchedExample = ref<string|null>(null)

// 当前单词没有音标/例句 → AI 查询补全
watch([currentIndex, words], async () => {
  const cur = words.value[currentIndex.value]
  if (!cur) { fetchedPhonetic.value = null; fetchedExample.value = null; return }
  if (cur.phonetic && cur.example) { fetchedPhonetic.value = null; fetchedExample.value = null; return }
  const detail = await lookup('en', cur.word)
  if (!cur.phonetic && detail?.phonetic) {
    fetchedPhonetic.value = detail.phonetic
    cur.phonetic = detail.phonetic
  }
  if (!cur.example && detail?.example) {
    fetchedExample.value = detail.example
    cur.example = detail.example
  }
}, { immediate: true })
const feedback = ref('')
const feedbackMsg = ref('')
const feedbackStyle = ref<Record<string,string>|null>(null)
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

function showFeedback(type: 'ok'|'err'|'hint', msg?: string) {
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedback.value = type
  feedbackMsg.value = msg || ''
  feedbackStyle.value = null
  requestAnimationFrame(() => {
    feedbackStyle.value = { opacity: '1', transform: 'translateX(-50%) translateY(0)' }
    feedbackTimer = setTimeout(() => {
      feedbackStyle.value = { opacity: '0', transform: 'translateX(-50%) translateY(-6px)' }
      feedbackTimer = setTimeout(() => { feedback.value = ''; feedbackStyle.value = null }, 200)
    }, 800)
  })
}

function hintText(){const w=words.value[currentIndex.value];if(!w)return'';const wd=w.word as string;return wd[0]+'_'.repeat(wd.length-1)+` (${wd.length}个字母)`}

/** 当前单词 */
const curWord = computed(() => words.value[currentIndex.value])
/** 当前例句（来自词库或 AI 补全） */
const exampleText = computed(() => curWord.value?.example || fetchedExample.value || '')
/** 例句展示：将目标词替换为通过输入逐字填充的下划线 */
const maskedExample = computed(() => {
  const ex = exampleText.value
  const w = curWord.value?.word
  if (!ex || !w) return ''
  const input = userInput.value
  // 构建展示字符串：原词位置按已输入内容逐步揭示
  const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const len = w.length
  // 用已输入的内容填充，其余为空格占位（为每个字符留间距）
  const filled = input.padEnd(len, ' ').slice(0, len)
  return ex.replace(regex, () => filled)
})
/** 例句中目标词所在的下划线（纯 CSS 展示用） */
function renderExampleHtml() {
  const ex = exampleText.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const w = curWord.value?.word
  if (!ex || !w) return `&ldquo;${ex}&rdquo;`
  const input = userInput.value
  const len = w.length
  const filled = input.padEnd(len, ' ')
  let html = ''
  for (let i = 0; i < len; i++) {
    const ch = filled[i]
    if (ch !== ' ')
      html += `<span class="ex-char filled">${ch}</span>`
    else
      html += `<span class="ex-char">_</span>`
  }
  const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  return `&ldquo;${ex.replace(regex, () => `<span class="ex-blank">${html}</span>`)}&rdquo;`
}

async function startSession(wrongWords?: any[]){
  loading.value=true;finished.value=false;currentIndex.value=0;correctCount.value=0;results.value=[];userInput.value='';feedback.value='';feedbackStyle.value=null;fetchedPhonetic.value=null
  attempts.value=0;showHint.value=false;showAnswer.value=false
  try{
    if (wrongWords && wrongWords.length > 0) {
      words.value = wrongWords
    } else {
      const{data}=await api.post('/practice/session',{language:'en',mode:'typing',count:10,category:selectedCategory.value||undefined})
      words.value=data.words
    }
    await nextTick();inputRef.value?.focus()
  }catch(e:any){console.error(e)}
  finally{loading.value=false}
}

function isAnswerCorrect(input: string, word: string) {
  return input.toLowerCase().trim() === word.toLowerCase().trim()
}

async function submit() {
  const cur = words.value[currentIndex.value]
  const input = userInput.value.trim()
  if (!input) return
  if (mustRetype.value) {
    if (isAnswerCorrect(input, cur.word)) {
      mustRetype.value = false; showAnswer.value = false
      nextWord(); return
    } else {
      shaking.value = true; setTimeout(() => shaking.value = false, 500)
      showFeedback('hint', '请正确输入上面的单词')
      userInput.value = ''
      await nextTick(); inputRef.value?.focus()
      return
    }
  }
  const ok = isAnswerCorrect(input, cur.word)
  if (ok) {
    playChime(); gainXp(5); showFeedback('ok')
    results.value.push({word:cur,correct:true,answer:input,attempts:attempts.value+1})
    if(attempts.value===0)correctCount.value++
    await api.post('/practice/submit',{wordId:cur.id,mode:'typing',correct:true,answer:input}).catch(()=>{})
    setTimeout(() => nextWord(), 300); return
  }
  attempts.value++;shaking.value=true;setTimeout(()=>shaking.value=false,500)
  if(attempts.value>=MAX_ATTEMPTS){
    showAnswer.value=true;showHint.value=false;mustRetype.value=true
    showFeedback('err', '正确答案已显示')
    results.value.push({word:cur,correct:false,answer:input,attempts:attempts.value})
    await api.post('/practice/submit',{wordId:cur.id,mode:'typing',correct:false,answer:input}).catch(()=>{})
    userInput.value=''
  }else if(attempts.value>=2){
    showHint.value=true;showFeedback('hint', '再试一次'); userInput.value=''
  }else{
    showFeedback('err', '不对，请重试'); userInput.value=''
  }
  await nextTick();inputRef.value?.focus()
}
function nextWord(){
  feedback.value = ''; feedbackStyle.value = null
  if(currentIndex.value<words.value.length-1){
    currentIndex.value++;userInput.value='';attempts.value=0;showHint.value=false;showAnswer.value=false;mustRetype.value=false
    nextTick(()=>inputRef.value?.focus())
  }else{ finished.value=true }
}
function skipToNext(){
  const cur=words.value[currentIndex.value]
  results.value.push({word:cur,correct:false,answer:'(跳过)',attempts:attempts.value})
  api.post('/practice/submit',{wordId:cur.id,mode:'typing',correct:false,answer:'(跳过)'}).catch(()=>{})
  nextWord()
}
function endSession(){ finished.value = true }

const deleteConfirmVisible = ref(false)
const deleteTargetWord = ref('')
function confirmDeleteWord() { deleteTargetWord.value = words.value[currentIndex.value]?.word || ''; deleteConfirmVisible.value = true }
async function doDeleteWord() {
  const cur = words.value[currentIndex.value]; deleteConfirmVisible.value = false
  if (!cur || !cur.id) return
  await api.delete(`/words/${cur.id}`).catch(() => {})
  words.value.splice(currentIndex.value, 1)
  if (words.value.length === 0) { finished.value = true }
  else if (currentIndex.value >= words.value.length) { currentIndex.value-- }
  attempts.value = 0; showHint.value = false; showAnswer.value = false; mustRetype.value = false
  userInput.value = ''; feedback.value = ''
  nextTick(() => inputRef.value?.focus())
}

function onGlobalKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod && e.key !== 'Escape') return
  if (mod && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); speak(words.value[currentIndex.value]?.word) }
  if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); toggleHint() }
  if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); skipToNext() }
  if (e.key === 'Escape') { e.preventDefault(); finished.value = true }
}
onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown))

function toggleHint() { if (showHint.value || showAnswer.value) return; showHint.value = true }
const wrongWords = ref<any[]>([])
function retryWrong(){
  wrongWords.value = results.value.filter(r => !r.correct).map(r => r.word)
  if (wrongWords.value.length > 0) startSession(wrongWords.value)
}
onMounted(()=>{if(route.query.category)selectedCategory.value=route.query.category as string;startSession()})
</script>

<template>
  <div class="practice">
    <header class="topbar">
      <router-link to="/" class="logo-link"><span class="logo-icon">T</span></router-link>
      <span class="page-title">TypEnglish · 拼写练习</span>
      <div style="flex:1"/>
      <div class="xp-bar"><span class="xp-label">Lv.{{ level }}</span><el-progress :percentage="progress" :show-text="false" :stroke-width="4" style="width:72px" color="#10b981"/></div>
      <router-link to="/" class="back-link">退出</router-link>
    </header>

    <div v-if="loading" class="center-state"><div class="loader"/><p>准备题目中...</p></div>

    <div v-else-if="finished" class="result-panel">
      <div class="result-header">
        <div class="result-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div><h2>练习完成</h2><p class="result-meta">{{words.length}} 题 · {{results.filter(r=>r.correct).length}} 正确</p></div>
      </div>
      <div class="result-big-num">{{results.length>0 ? Math.round(results.filter(r=>r.correct).length/results.length*100) : 0}}%</div>
      <div class="result-words">
        <span v-for="(r,i) in results" :key="i" :class="['rw-chip', r.correct ? 'rw-ok' : 'rw-err']">{{ r.word.word }}</span>
      </div>
      <div class="result-actions">
        <button class="retry-btn" @click="startSession()">再来一轮</button>
        <button v-if="results.filter(r=>!r.correct).length>0" class="retry-wrong-btn" @click="retryWrong">只复习错题</button>
      </div>
    </div>

    <template v-else-if="words.length>0">
      <div class="main-content">
        <div class="top-zone">
          <div class="progress-bar"><div class="progress-fill" :style="{width:(currentIndex/words.length*100)+'%'}"/></div>
          <div class="progress-row">
            <span class="counter">{{currentIndex+1}}/{{words.length}}</span>
            <div class="progress-actions">
              <button class="mini-btn" @click="toggleHint" :disabled="showHint || showAnswer" title="显示提示 (Ctrl+I)">提示</button>
              <button class="mini-btn" @click="endSession">结束</button>
              <button class="mini-btn" @click="skipToNext" title="跳过 (Ctrl+S)">跳过</button>
              <button v-if="words[currentIndex]" class="mini-btn del-btn" @click="confirmDeleteWord">✕ 删除</button>
            </div>
          </div>
        </div>
        <div class="mid-zone">
          <!-- 例句联动输入 -->
          <div v-if="exampleText" class="example-banner">
            <div v-if="showAnswer" class="example-full">&ldquo;{{ exampleText }}&rdquo;</div>
            <div v-else class="example-masked" v-html="renderExampleHtml()" />
          </div>
          <div class="card-body">
            <p class="chinese-word">{{ words[currentIndex].translation }}</p>
            <p v-if="words[currentIndex].phonetic || fetchedPhonetic" class="phonetic-text">/{{ words[currentIndex].phonetic || fetchedPhonetic }}/</p>
            <p v-if="words[currentIndex].partOfSpeech" class="pos-tag">{{ words[currentIndex].partOfSpeech }}</p>
            <p v-if="showHint" class="hint-text">{{hintText()}}</p>
            <p v-if="showAnswer" class="reveal-answer">{{ words[currentIndex].word }}</p>
          </div>
          <div class="input-row">
            <input ref="inputRef" v-model="userInput" class="answer-input" :class="{wrong:shaking,revealed:showAnswer}" placeholder="输入单词..." autocomplete="off" spellcheck="false" @keyup.enter="submit()" @keydown="playKeytap()"/>
            <button class="speak-btn" @click="speak(words[currentIndex].word)" :disabled="showAnswer" title="听发音">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            </button>
          </div>
          <span v-if="attempts>0 && !mustRetype" class="attempts-badge">{{attempts}}/{{MAX_ATTEMPTS}} 次尝试</span>
          <div class="feedback-toast" :class="{ 'fb-ok': feedback==='ok', 'fb-err': feedback==='err', 'fb-hint': feedback==='hint', 'fb-show': !!feedbackStyle }" :style="feedbackStyle">
            <div class="fb-inner" v-if="feedback==='ok'">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>正确</span>
            </div>
            <div class="fb-inner" v-else-if="feedback==='err'">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>{{ feedbackMsg }}</span>
            </div>
            <div class="fb-inner" v-else-if="feedback==='hint'">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>{{ feedbackMsg }}</span>
            </div>
          </div>
        </div>
        <div class="bottom-zone">
          <span class="si-label">快捷键</span>
          <div class="si-items">
            <span class="si-item"><kbd>↵</kbd><span>确认</span></span>
            <span class="si-item"><kbd>Ctrl+H</kbd><span>朗读</span></span>
            <span class="si-item"><kbd>Ctrl+I</kbd><span>提示</span></span>
            <span class="si-item"><kbd>Ctrl+S</kbd><span>跳过</span></span>
            <span class="si-item"><kbd>Esc</kbd><span>结束</span></span>
          </div>
        </div>
      </div>
    </template>

    <el-dialog v-model="deleteConfirmVisible" title="确认删除" width="380px" center>
      <p style="text-align:center;margin:16px 0;color:#475569;font-size:15px">从题库中删除 <strong style="color:#1e293b">"{{deleteTargetWord}}"</strong>？</p>
      <template #footer><el-button @click="deleteConfirmVisible=false">取消</el-button><el-button type="danger" @click="doDeleteWord">删除</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ====== 全局 ====== */
.practice{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:#fef9f4}

/* ====== 顶栏 ====== */
.topbar{display:flex;align-items:center;padding:0 24px;height:56px;background:rgba(255,255,255,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(184,160,151,.15);flex-shrink:0;z-index:10}
.logo-link{text-decoration:none}
.logo-icon{width:34px;height:34px;background:#e8734a;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700}
.page-title{font-size:17px;font-weight:600;color:#2d2422;margin-left:10px}
.back-link{font-size:16px;color:#b8a097;text-decoration:none;margin-left:16px;transition:color .15s}.back-link:hover{color:#4a3d39}
.xp-bar{display:flex;align-items:center;gap:6px;margin-right:2px}.xp-label{font-size:14px;font-weight:600;color:#e8734a;white-space:nowrap}

/* ====== 加载 / 状态 ====== */
.center-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#b8a097;gap:16px}
.loader{width:28px;height:28px;border:2px solid rgba(184,160,151,.18);border-top-color:#e8734a;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ====== 结果面板 ====== */
.result-panel{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:48px 24px}
.result-header{display:flex;align-items:center;gap:14px}
.result-icon{width:52px;height:52px;background:#fef3ee;border-radius:14px;display:flex;align-items:center;justify-content:center}
.result-panel h2{font-size:26px;font-weight:700;color:#2d2422;margin:0}.result-meta{font-size:17px;color:#b8a097;margin:4px 0 0}
.result-big-num{font-size:72px;font-weight:800;color:#e8734a;line-height:1}
.result-words{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:560px}
.rw-chip{padding:8px 18px;border-radius:10px;font-size:17px;font-weight:500}
.rw-ok{background:#f3f9f3;color:#5b9a5e}.rw-err{background:#fdf0f0;color:#c94a4a}
.result-actions{display:flex;gap:10px;margin-top:8px}
.retry-btn{padding:16px 56px;background:#e8734a;color:#fff;border:none;border-radius:12px;font-size:18px;font-weight:600;cursor:pointer;transition:all .15s}
.retry-btn:hover{background:#d4653a;transform:translateY(-1px)}
.retry-wrong-btn{padding:16px 40px;background:#fff;color:#4a3d39;border:1.5px solid rgba(184,160,151,.18);border-radius:12px;font-size:18px;font-weight:600;cursor:pointer;transition:all .15s}
.retry-wrong-btn:hover{border-color:rgba(184,160,151,.25);background:#fef9f4}

/* ====== 主体内容区 ====== */
.main-content{flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:0 24px}

/* —— 顶部：进度条 + 计数 —— */
.top-zone{flex-shrink:0;padding-top:20px;max-width:720px;width:100%;margin:0 auto}
.progress-bar{width:100%;height:3px;background:rgba(184,160,151,.15);border-radius:2px;overflow:hidden}
.progress-fill{height:100%;background:#e8734a;border-radius:2px;transition:width .4s ease}
.progress-row{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
.counter{font-size:16px;color:#b8a097;font-weight:500}
.attempts-badge{font-size:13px;color:#c94a4a;font-weight:600;text-align:center;margin-top:10px}
.progress-actions{display:flex;gap:2px}
.mini-btn{padding:5px 12px;border:1px solid rgba(184,160,151,.18);border-radius:8px;background:transparent;font-size:13px;color:#b8a097;cursor:pointer;transition:all .15s;font-family:inherit}
.mini-btn:hover{background:rgba(184,160,151,.06);color:#4a3d39;border-color:rgba(184,160,151,.35)}
.mini-btn:disabled{opacity:.4;cursor:not-allowed}
.mini-btn.del-btn:hover{color:#c94a4a;border-color:rgba(201,74,74,.3);background:#fdf0f0}

/* —— 中间：题目 + 输入 —— */
.mid-zone{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 0;gap:0}
/* ---- 例句 ---- */
.example-banner{max-width:560px;text-align:center;margin:0 auto 48px}
.example-full{font-size:17px;color:#2d2422;line-height:1.6;font-style:italic}
.example-masked{font-size:17px;color:#2d2422;line-height:1.6;font-style:italic}
/* 例句中的填空区 */
.example-masked :deep(.ex-blank){
  display:inline-flex;gap:3px;
  background:rgba(232,115,74,.08);border-bottom:2px solid #e8734a;
  padding:0 6px;margin:0 2px;border-radius:3px 3px 0 0;
}
.example-masked :deep(.ex-char){
  display:inline-block;width:14px;text-align:center;
  font-style:normal;font-weight:600;font-size:16px;color:#2d2422;
}
.example-masked :deep(.ex-char:not(.filled)){
  color:#cbd5e1;
}

/* ---- 题目卡片 ---- */
.card-body{text-align:center;max-width:560px}
.chinese-word{font-size:44px;font-weight:700;color:#2d2422;margin:0;line-height:1.3;word-break:break-word}
.phonetic-text{font-size:18px;color:#e8734a;margin:10px 0 0;font-family:Georgia,serif}
.pos-tag{font-size:16px;color:#b8a097;margin:6px 0 0;font-style:italic}
.hint-text{margin-top:14px;font-size:18px;color:#e8734a;background:#fef3ee;display:inline-block;padding:6px 18px;border-radius:8px;font-family:'SF Mono',monospace;letter-spacing:2px}
.reveal-answer{margin-top:14px;font-size:22px;color:#c94a4a;font-weight:700;background:#fdf0f0;display:inline-block;padding:6px 18px;border-radius:8px}
.input-row{display:flex;align-items:flex-end;justify-content:center;gap:0;margin-top:36px}
.answer-input{width:100%;max-width:480px;padding:12px 0;border:none;border-bottom:2.5px solid rgba(184,160,151,.25);font-size:28px;outline:0;text-align:center;font-family:inherit;background:transparent;transition:border-color .2s;border-radius:0;letter-spacing:1px;box-sizing:border-box;color:#2d2422}
.answer-input::placeholder{color:rgba(184,160,151,.25)}
.answer-input:focus{border-bottom-color:#e8734a}
.answer-input.revealed{border-bottom-color:#f5a5a5;color:#c94a4a}
.speak-btn{width:40px;height:40px;border:none;border-radius:10px;background:rgba(184,160,151,.06);color:#b8a097;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s;margin-left:8px}
.speak-btn:hover{background:rgba(184,160,151,.18);color:#4a3d39}
.feedback-toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%) translateY(8px);z-index:200;opacity:0;transition:all .25s ease;pointer-events:none}
.feedback-toast.fb-show{opacity:1;transform:translateX(-50%) translateY(0)}
.fb-inner{display:flex;align-items:center;gap:8px;padding:10px 22px;border-radius:20px;font-size:16px;font-weight:600;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);white-space:nowrap}
.fb-ok .fb-inner{background:rgba(91,154,94,.12);color:#3d7a40;border:1px solid rgba(91,154,94,.2)}
.fb-err .fb-inner{background:rgba(201,74,74,.1);color:#b33a3a;border:1px solid rgba(201,74,74,.18)}
.fb-hint .fb-inner{background:rgba(232,164,74,.1);color:#c9782d;border:1px solid rgba(232,164,74,.2)}

/* —— 底部：快捷键 —— */
.bottom-zone{flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:28px;padding:14px 0 18px}
.si-label{font-size:13px;font-weight:600;color:#b8a097;text-transform:uppercase;letter-spacing:1.5px;flex-shrink:0}
.si-items{display:flex;align-items:center;gap:24px}
.si-item{display:inline-flex;align-items:center;gap:4px}
.si-item kbd{display:inline-block;padding:2px 8px;border:1px solid rgba(184,160,151,.18);border-radius:4px;background:rgba(184,160,151,.08);font-size:13px;font-family:inherit;color:#b8a097;font-weight:500;white-space:nowrap}
.si-item span{font-size:13px;color:#b8a097}

/* ====== 响应式 ====== */
@media(max-width:768px){
  .topbar{padding:0 16px;height:50px}
  .page-title{font-size:14px}
  .main-content{padding:0 16px}
  .top-zone{padding-top:14px;max-width:100%}
  .chinese-word{font-size:34px!important}
  .answer-input{max-width:260px;font-size:24px}
  .shortcut-row .si-label{display:none}.shortcut-row .si-items{flex-wrap:wrap;gap:8px}
}
</style>
