<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { speak } from '../composables/useTts'
import { useErrorBookStore } from '../stores/errorBook'
import GlobalTopbar from '../components/GlobalTopbar.vue'

const router = useRouter()
const errorBook = useErrorBookStore()

// --- 数据 ---
const wordErrors = ref<any[]>([])
const wordTotal = ref(0)
const wordPage = ref(1)

const sentenceErrors = ref<any[]>([])
const sentTotal = ref(0)
const sentPage = ref(1)

const activeTab = ref<'word' | 'sentence'>('word')
const loading = ref(false)
const pageSize = 30

// ====== 加载 ======
async function loadWordErrors() {
  loading.value = true
  try {
    const { data } = await api.get('/errorbook', { params: { page: wordPage.value, size: pageSize } })
    wordErrors.value = data.items || []
    wordTotal.value = (data.total > 0) ? data.total : wordErrors.value.length
  } catch { wordErrors.value = []; wordTotal.value = 0 }
  finally { loading.value = false }
}

async function loadSentenceErrors() {
  loading.value = true
  try {
    const { data } = await api.get('/errorbook/sentences', { params: { page: sentPage.value, size: pageSize } })
    sentenceErrors.value = (data.items || []).map((se: any) => {
      let slots: any[] = []
      try { slots = typeof se.slotResults === 'string' ? JSON.parse(se.slotResults) : (se.slotResults || []) } catch { slots = [] }
      return { ...se, slots }
    })
    sentTotal.value = (data.total > 0) ? data.total : sentenceErrors.value.length
  } catch { sentenceErrors.value = []; sentTotal.value = 0 }
  finally { loading.value = false }
}

function switchTab(tab: 'word' | 'sentence') {
  activeTab.value = tab
}

// 分页
const totalWordPages = computed(() => Math.ceil(wordTotal.value / pageSize))
const totalSentPages = computed(() => Math.ceil(sentTotal.value / pageSize))

// ====== 单词批量练习 → 路由到拼写练习页面 ======
function startWordPractice() {
  const shuffled = [...wordErrors.value].sort(() => Math.random() - 0.5)
  console.log('[ErrorBook] wordErrors:', wordErrors.value.length, 'items')
  const batchSize = Math.min(30, Math.max(10, shuffled.length))
  const batch = shuffled.slice(0, batchSize)
  // 提取 word 对象（拼写练习页面需要的格式：{id, word, translation, phonetic}）
  const wordItems = batch.map(e => e.word)
  localStorage.setItem('reviewWords', JSON.stringify(wordItems))
  router.push('/practice/review?review=word')
}

function startSentenceBatchPractice() {
  const shuffled = [...sentenceErrors.value].sort(() => Math.random() - 0.5)
  const batchSize = Math.min(15, Math.max(10, shuffled.length))
  const batch = shuffled.slice(0, batchSize)
  localStorage.setItem('reviewSentences', JSON.stringify(batch))
  router.push('/practice/review?review=sentence')
}

// 单个句子重练也复用练习页面
function startSentenceRepractice(se: any) {
  localStorage.setItem('reviewSentences', JSON.stringify([se]))
  router.push('/practice/review?review=sentence')
}



const clearConfirm = reactive({ visible: false, type: '' as 'word' | 'sentence', inputText: '' })

function showClearConfirm(type: 'word' | 'sentence') { clearConfirm.type = type; clearConfirm.inputText = ''; clearConfirm.visible = true }
function hideClearConfirm() { clearConfirm.visible = false; clearConfirm.inputText = '' }

const confirmKeyword = 'DELETE'
const confirmValid = computed(() => clearConfirm.inputText === confirmKeyword)

async function doClearAll() {
  if (!confirmValid.value) return
  hideClearConfirm()
  const isWord = clearConfirm.type === 'word'
  if (isWord) {
    await api.delete('/errorbook/clear-all').catch(() => {})
    wordErrors.value = []; wordTotal.value = 0
  } else {
    await api.delete('/errorbook/sentences/clear-all').catch(() => {})
    sentenceErrors.value = []; sentTotal.value = 0
  }
  errorBook.setErrorCount(0)
}


onMounted(async () => {
  await Promise.all([loadWordErrors(), loadSentenceErrors()])
  // 确保 store 也同步最新数据
  errorBook.setErrorCount(wordTotal.value + sentTotal.value)
})
</script>

<template>
  <div class="errorbook">
    <GlobalTopbar />

    <main class="main-area">
      <!-- 空状态 -->
      <div v-if="wordTotal===0 && sentTotal===0" class="empty-state">
        <div class="empty-icon-wrap"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
        <h2>全部掌握!</h2><p>没有待复习的错题</p>
        <router-link to="/practice" class="go-practice">去练习 →</router-link>
      </div>

      <!-- 分类卡片 -->
      <div v-if="wordTotal>0 || sentTotal>0" class="category-cards">
        <div :class="['cat-card',{active:activeTab==='word'}]" @click="switchTab('word')">
          <div class="cat-icon" style="background:#eef2ff;color:#6366f1">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </div>
          <div class="cat-body">
            <span class="cat-label">单词错题</span>
            <span class="cat-count">{{wordTotal}} 个</span>
            <span class="cat-desc">拼写练习中写错的词</span>
          </div>
          <span class="cat-arrow">→</span>
        </div>
        <div :class="['cat-card',{active:activeTab==='sentence'}]" @click="switchTab('sentence')">
          <div class="cat-icon" style="background:#f0fdf4;color:#34c759">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="cat-body">
            <span class="cat-label">句子错题</span>
            <span class="cat-count">{{sentTotal}} 个</span>
            <span class="cat-desc">完形填空 & 翻译中的句子</span>
          </div>
          <span class="cat-arrow">→</span>
        </div>
      </div>

      <!-- ========= 单词错题列表 ========= -->
      <template v-if="activeTab==='word' && wordErrors.length>0">
        <div class="list-toolbar">
          <span class="list-info">第 {{wordPage}} 页 · 共 {{wordTotal}} 词</span>
          <div style="display:flex;gap:10px">
            <button class="action-btn danger" @click="showClearConfirm('word')">全部清空</button>
            <button class="action-btn primary" @click="startWordPractice">拼写练习 ({{Math.min(30,wordErrors.length)}}个)</button>
          </div>
        </div>
        <div class="word-list">
          <div v-for="item in wordErrors" :key="item.id" class="word-card">
            <div class="word-main">
              <div class="word-title">
                <span class="ww-word">{{item.word.word}}</span>
                <span v-if="item.word.phonetic" class="ww-phonetic">{{item.word.phonetic}}</span>
              </div>
              <div class="ww-trans">{{item.word.translation}}</div>
            </div>
            <div class="word-meta">
              <span :class="['ww-err',{many:item.errorCount>=3}]">错 {{item.errorCount}} 次</span>
              <button class="ww-speak" @click="speak(item.word.word)" title="听发音">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div v-if="totalWordPages>1" class="pagination">
          <button :disabled="wordPage<=1" @click="wordPage--;loadWordErrors()">‹</button>
          <template v-for="p in totalWordPages" :key="p">
            <span v-if="Math.abs(p-wordPage)<=2||p===1||p===totalWordPages"
                  :class="['page-num',{current:p===wordPage}]" @click="wordPage=p;loadWordErrors()">{{p}}</span>
            <span v-else-if="Math.abs(p-wordPage)===3" class="page-dots">…</span>
          </template>
          <button :disabled="wordPage>=totalWordPages" @click="wordPage++;loadWordErrors()">›</button>
        </div>
      </template>


      <!-- ========= 句子错题列表 ========= -->
      <template v-if="activeTab==='sentence' && sentenceErrors.length>0">
        <div class="list-toolbar">
          <span class="list-info">第 {{sentPage}} 页 · 共 {{sentTotal}} 句</span>
          <div style="display:flex;gap:10px">
            <button class="action-btn danger" @click="showClearConfirm('sentence')">全部清空</button>
            <button class="action-btn primary" @click="startSentenceBatchPractice">批量练习 (抽{{Math.max(10,sentenceErrors.length)}}句)</button>
          </div>
        </div>
        <div class="sentence-grid">
          <div v-for="se in sentenceErrors" :key="se.id" class="sentence-tile">
            <div class="st-header">
              <span :class="['st-badge',se.mode==='cloze'?'bd-cloze':'bd-trans']">{{se.mode==='cloze'?'完形填空':'句子翻译'}}</span>
              <span class="st-meta">{{se.correctSlots}}/{{se.totalSlots}} 正确 · {{se.createdAt?.substring(0,10)}}</span>
            </div>
            <p class="st-chinese">{{se.chinese}}</p>
            <div class="st-slots">
              <span v-for="(s,i) in se.slots" :key="i" :class="['st-slot', s.visible?'st-vis':(s.correct?'st-ok':'st-err')]" :title="s.visible?'':(s.correct?'填对':'填错/未填')">
                {{s.word}}<span v-if="!s.visible&&!s.correct&&s.answer" class="st-answer">→{{s.answer}}</span>
              </span>
            </div>
            <button class="st-repractice" @click="startSentenceRepractice(se)">↻ 重新练习</button>
          </div>
        </div>
        <div v-if="totalSentPages>1" class="pagination">
          <button :disabled="sentPage<=1" @click="sentPage--;loadSentenceErrors()">‹</button>
          <template v-for="p in totalSentPages" :key="p">
            <span v-if="Math.abs(p-sentPage)<=2||p===1||p===totalSentPages"
                  :class="['page-num',{current:p===sentPage}]" @click="sentPage=p;loadSentenceErrors()">{{p}}</span>
            <span v-else-if="Math.abs(p-sentPage)===3" class="page-dots">…</span>
          </template>
          <button :disabled="sentPage>=totalSentPages" @click="sentPage++;loadSentenceErrors()">›</button>
        </div>
      </template>

      <!-- ===== 清空二次确认弹窗 ===== -->
      <div v-if="clearConfirm.visible" class="modal-overlay" @click.self="hideClearConfirm()">
        <div class="modal-card" @click.stop>
          <div class="modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 class="modal-title">{{ clearConfirm.type === 'word' ? '清空所有单词错题？' : '清空所有句子错题？' }}</h3>
          <p class="modal-body">
            此操作<span style="color:#ff3b30;font-weight:600">不可撤销</span>，
            将删除你全部的{{ clearConfirm.type === 'word' ? wordTotal : sentTotal }} 条{{
              clearConfirm.type === 'word' ? '单词' : '句子'
            }}错题记录。
          </p>
          <div class="confirm-input-wrap">
            <span class="confirm-input-label">输入 <b>DELETE</b> 以继续</span>
            <input
              v-model="clearConfirm.inputText"
              class="confirm-input"
              :placeholder="confirmKeyword"
              autofocus
              @keydown.enter="doClearAll()"
              @input="clearConfirm.inputText = clearConfirm.inputText.toUpperCase()"
            />
          </div>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="hideClearConfirm()">取消</button>
            <button class="modal-btn confirm" :disabled="!confirmValid" @click="doClearAll()">确认清空</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.errorbook{min-height:100vh;background:transparent}
.topbar-inner{display:flex;align-items:center;width:100%}
.logo-link{text-decoration:none}
.logo-icon{width:30px;height:30px;background:#ff7a50;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.page-title{margin-left:12px;font-size:15px;font-weight:600;color:#1d1d1f}
.count-tag{margin-left:10px;font-size:12px;color:#ff3b30;background:rgba(254,226,226,.5);padding:2px 10px;border-radius:10px;font-weight:600}
.back-link{font-size:14px;color:#86868b;text-decoration:none;transition:color .15s;font-weight:500;margin-left:20px}.back-link:hover{color:#ff7a50}
.main-area{max-width:1200px;margin:0 auto;padding:40px 48px 80px}

/* 空状态 */
.empty-state{text-align:center;padding:100px 0}
.empty-icon-wrap{width:80px;height:80px;background:rgba(255,255,255,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.65);border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 10px 30px rgba(0, 0, 0, .06),0 3px 10px rgba(0, 0, 0, .04),inset 0 0 0 1px rgba(255,255,255,.5)}
.empty-state h2{font-size:22px;color:#1d1d1f;margin:0 0 6px}.empty-state p{color:#86868b;margin:0 0 20px}
.go-practice{display:inline-block;padding:10px 28px;background:#ff7a50;color:#fff;border-radius:10px;font-weight:600;text-decoration:none;font-size:15px;box-shadow:0 4px 12px rgba(232,115,74,.2)}

/* 分类卡片 */
.category-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:28px}
.cat-card{background:rgba(255,255,255,.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.6);border-radius:20px;padding:24px;display:flex;align-items:center;gap:16px;cursor:pointer;transition:all .2s;box-shadow:0 12px 36px rgba(0,0,0,.05),0 4px 12px rgba(0,0,0,.03),inset 0 0 0 1px rgba(255,255,255,.5)}
.cat-card:hover,.cat-card.active{transform:translateY(-2px);background:rgba(255,255,255,.86);box-shadow:0 18px 48px rgba(0,0,0,.08),0 6px 16px rgba(0,0,0,.04),inset 0 0 0 1px rgba(255,255,255,.6)}
.cat-icon{width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cat-body{flex:1;display:flex;flex-direction:column;gap:4px}
.cat-label{font-size:16px;font-weight:700;color:#1d1d1f}
.cat-count{font-size:28px;font-weight:800;color:#ff7a50;line-height:1}
.cat-desc{font-size:12px;color:#86868b}
.cat-arrow{font-size:20px;color:#86868b;transition:all .2s}
.cat-card:hover .cat-arrow,.cat-card.active .cat-arrow{color:#ff7a50;transform:translateX(4px)}

/* 列表工具栏 */
.list-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.list-info{font-size:13px;color:#86868b}
.action-btn{padding:9px 22px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}
.action-btn.primary{background:#ff7a50;color:#fff;box-shadow:0 4px 12px rgba(232,115,74,.2)}
.action-btn.primary:hover{background:#ff5722;transform:translateY(-1px);box-shadow:0 6px 20px rgba(232,115,74,.3)}
.action-btn.danger{background:#fff;color:#ff3b30;border:1px solid rgba(254,202,202,.5)}
.action-btn.danger:hover{background:rgba(254,226,226,.5)}

/* 单词网格 */
.word-list{display:flex;flex-direction:column;gap:14px;margin-bottom:24px}
.word-card{background:rgba(255,255,255,.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.6);border-radius:20px;padding:22px 26px;display:flex;align-items:center;justify-content:space-between;gap:20px;transition:all .2s;box-shadow:0 10px 30px rgba(0,0,0,.04),0 3px 10px rgba(0,0,0,.02),inset 0 0 0 1px rgba(255,255,255,.5)}
.word-card:hover{background:rgba(255,255,255,.86);transform:translateY(-2px);box-shadow:0 16px 44px rgba(0,0,0,.07),0 5px 14px rgba(0,0,0,.03),inset 0 0 0 1px rgba(255,255,255,.6)}
.word-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.word-title{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.ww-word{font-size:22px;font-weight:800;color:#1d1d1f;letter-spacing:-.4px}
.ww-phonetic{font-size:14px;color:#86868b;font-family:Georgia,serif}
.ww-trans{font-size:15px;color:#6e6e73;line-height:1.5}
.word-meta{display:flex;align-items:center;gap:14px;flex-shrink:0}
.ww-speak{width:40px;height:40px;border:none;border-radius:12px;background:rgba(255,122,80,.1);color:#ff7a50;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.ww-speak:hover{background:#ff7a50;color:#fff;transform:scale(1.05)}
.ww-err{font-size:13px;font-weight:700;color:#ff9500;background:rgba(255,149,0,.1);padding:6px 14px;border-radius:20px}
.ww-err.many{color:#ff3b30;background:rgba(255,59,48,.1)}

/* 句子网格 */
.sentence-grid{display:flex;flex-direction:column;gap:14px;margin-bottom:24px}
.sentence-tile{background:rgba(255,255,255,.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.6);border-radius:20px;padding:22px 26px;transition:all .2s;box-shadow:0 10px 30px rgba(0,0,0,.04),0 3px 10px rgba(0,0,0,.02),inset 0 0 0 1px rgba(255,255,255,.5)}
.sentence-tile:hover{background:rgba(255,255,255,.86);box-shadow:0 18px 48px rgba(0,0,0,.07),0 5px 14px rgba(0,0,0,.03),inset 0 0 0 1px rgba(255,255,255,.6)}
.st-header{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.st-badge{font-size:12px;font-weight:700;padding:4px 12px;border-radius:8px}
.bd-cloze{background:rgba(255,122,80,.1);color:#ff7a50}
.bd-trans{background:rgba(255,149,0,.1);color:#ff9500}
.st-meta{font-size:13px;color:#86868b}
.st-chinese{font-size:17px;font-weight:600;color:#1d1d1f;margin:0 0 14px;line-height:1.6}
.st-slots{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.st-slot{padding:6px 14px;border-radius:10px;font-size:15px;font-weight:500}
.st-slot.st-vis{background:rgba(0,0,0,.04);color:#86868b;border:1px dashed rgba(0,0,0,.1)}
.st-slot.st-ok{background:rgba(52,199,89,.1);color:#34c759}
.st-slot.st-err{background:rgba(255,59,48,.1);color:#ff3b30;text-decoration:line-through}
.st-answer{text-decoration:none!important;font-size:12px;color:#ff9500;margin-left:6px;font-weight:400}
.st-repractice{align-self:flex-start;padding:9px 22px;border:1.5px solid rgba(255,122,80,.2);border-radius:12px;background:rgba(255,255,255,.6);color:#1d1d1f;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}
.st-repractice:hover{background:rgba(255,122,80,.1);border-color:#ff7a50;color:#ff7a50;transform:translateY(-1px)}

/* 分页 */
.pagination{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:24px}
.pagination button{width:36px;height:36px;border:1px solid rgba(255,255,255,.65);border-radius:10px;background:rgba(255,255,255,.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#1d1d1f;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0, 0, 0, .05),inset 0 0 0 1px rgba(255,255,255,.5)}
.pagination button:hover:not(:disabled){border-color:rgba(232,115,74,.4);color:#ff7a50;background:#fff}
.pagination button:disabled{opacity:.35;cursor:not-allowed}
.page-num{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:14px;color:#6e6e73;cursor:pointer;transition:all .15s}
.page-num:hover{background:rgba(255,255,255,.5);color:#1d1d1f}
.page-num.current{background:#ff7a50;color:#fff;font-weight:700}
.page-dots{color:#86868b;padding:0 4px}

/* 单词练习卡片 */
.practice-card{background:#fff;border-radius:20px;border:1px solid rgba(0, 0, 0, .18);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04);max-width:600px;margin:0 auto}
.card-top{padding:20px 24px 0}
.progress-bar{height:5px;background:rgba(0, 0, 0, .15);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:#ff7a50;border-radius:3px;transition:width .4s}
.card-top-row{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
.counter{font-size:13px;color:#86868b}
.text-btn{font-size:13px;color:#86868b;background:0 0;border:none;cursor:pointer;padding:4px 10px;border-radius:6px}
.text-btn:hover{background:rgba(0, 0, 0, .06);color:#1d1d1f}
.card-body{padding:32px 24px 24px;text-align:center}
.prompt-label{font-size:13px;color:#86868b;margin:0 0 12px}
.prompt-word{font-size:30px;font-weight:700;color:#1d1d1f;margin:0 0 6px}
.phonetic-text{font-size:16px;color:#ff7a50;margin:6px 0 0;font-family:Georgia,serif}
.input-area{padding:0 24px 20px}
.input-row{display:flex;align-items:center;gap:10px;justify-content:center}
.speak-btn{width:44px;height:44px;border:1.5px solid rgba(0, 0, 0, .18);border-radius:12px;background:#fff;color:#ff7a50;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.speak-btn:hover{background:#fef3ee}
.answer-input{padding:13px 18px;border:2px solid rgba(0, 0, 0, .18);border-radius:12px;font-size:18px;outline:0;text-align:center;max-width:300px;font-family:inherit;background:#fff;color:#1d1d1f}
.answer-input:focus{border-color:#ff7a50;background:#fff}
.answer-input::placeholder{color:#86868b}
.action-row{margin-top:16px;text-align:center}
.submit-btn{padding:11px 40px;background:#ff7a50;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(232,115,74,.2)}
.submit-btn:hover:not(:disabled){background:#ff5722;transform:translateY(-1px)}.submit-btn:disabled{opacity:.4;cursor:not-allowed}
.submit-btn.next{background:#34c759}
.fb{margin-top:12px;font-size:15px;font-weight:600;color:#34c759;text-align:center}
.fb.wrong{color:#ff3b30}

/* ── 清空确认弹窗 ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.35); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: fadeIn .2s ease;
}
.modal-card {
  background: rgba(255, 255, 255, .92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, .7); border-radius: 24px; padding: 36px 40px 28px;
  max-width: 380px; width: 90%; text-align: center;
  box-shadow: 0 24px 70px rgba(0,0,0,.14);
  animation: scaleIn .25s ease;
}
.modal-icon { margin-bottom: 14px }
.modal-title { font-size: 18px; font-weight: 700; color: #1d1d1f; margin: 0 0 8px }
.modal-body { font-size: 14px; color: #6e6e73; line-height: 1.6; margin: 0 0 24px }
.modal-actions { display: flex; gap: 12px; justify-content: center }
.modal-btn { padding: 10px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all .15s }
.modal-btn.cancel { background: rgba(0, 0, 0, .08); color: #6e6e73 }
.modal-btn.cancel:hover { background: rgba(0, 0, 0, .15); color: #1d1d1f }
.modal-btn.confirm { background: #ff3b30; color: #fff; box-shadow: 0 2px 8px rgba(201,74,74,.25) }
.modal-btn.confirm:hover { background: #d6281e; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(201,74,74,.35) }
.modal-btn.confirm:disabled { opacity: .35; cursor: not-allowed; transform: none; box-shadow: none }
.confirm-input-wrap { margin: 0 0 20px; text-align: center }
.confirm-input-label { display: block; font-size: 12px; color: #86868b; margin-bottom: 8px }
.confirm-input-label b { color: #ff3b30 }
.confirm-input { width: 100%; max-width: 200px; padding: 10px 14px; border: 2px solid rgba(0, 0, 0, .18); border-radius: 10px; font-size: 15px; font-family: inherit; text-align: center; color: #1d1d1f; outline: none; transition: border-color .15s }
.confirm-input:focus { border-color: #ff3b30 }
.confirm-input::placeholder { color: #d4c8c2; font-size: 13px }
@keyframes fadeIn { 0%{opacity:0} 100%{opacity:1} }
@keyframes scaleIn { 0%{opacity:0;transform:scale(.92)} 100%{opacity:1;transform:scale(1)} }

@media(max-width:768px){
  .topbar,.main-area{padding-left:20px;padding-right:20px}
  .category-cards{grid-template-columns:1fr}
  .word-grid{grid-template-columns:repeat(2,1fr)}
}
</style>
