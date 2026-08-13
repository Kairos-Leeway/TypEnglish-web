<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useErrorBookStore } from '../stores/errorBook'
import GlobalTopbar from '../components/GlobalTopbar.vue'
import api from '../api'

const router = useRouter()
const auth = useAuthStore()
const errorBook = useErrorBookStore()
const stats = ref({ total: 0, correct: 0, accuracy: 0 })
const chapters = ref<Array<{category: string, wordCount: number}>>([])
const deleteCatVisible = ref(false)
const deleteCatName = ref('')

function confirmDeleteCategory(cat: string) {
  deleteCatName.value = cat
  deleteCatVisible.value = true
}
function cancelDeleteCategory() {
  deleteCatVisible.value = false
}

async function doDeleteCategory() {
  deleteCatVisible.value = false
  await api.delete('/words/category', { data: { category: deleteCatName.value } }).catch(() => {})
  chapters.value = chapters.value.filter(c => c.category !== deleteCatName.value)
}

onMounted(async () => {
  try {
    const statsRes = await api.get('/practice/stats')
    stats.value = statsRes.data
  } catch {}
  errorBook.fetchErrorCount()
  api.get('/categories').then(({ data }) => chapters.value = data).catch(() => {})
})
</script>

<template>
  <div class="home">
    <GlobalTopbar />
    <main class="main-content">
      <div class="greeting">
        <h1>Hi, {{ auth.user?.username }}</h1>
        <p>今天想练习什么？</p>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{{ stats.total }}</span>
          <span class="stat-label">总练习</span>
        </div>
        <div class="stat-card accent">
          <span class="stat-value">{{ stats.accuracy }}%</span>
          <span class="stat-label">正确率</span>
        </div>
        <div class="stat-card warn">
          <span class="stat-value">{{ errorBook.errorCount }}</span>
          <span class="stat-label">待复习</span>
        </div>
      </div>

      <h2 class="section-title">词库章节</h2>
      <div class="chapter-grid">
        <div
          v-for="ch in chapters"
          :key="ch.category"
          class="chapter-card"
          @click="$router.push({ path: '/practice', query: { category: ch.category } })"
        >
          <div class="ch-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <div class="ch-info">
            <span class="ch-name">{{ ch.category }}</span>
            <span class="ch-count">{{ ch.wordCount }} 词</span>
          </div>
          <span class="ch-arrow">→</span>
          <button class="ch-delete" title="删除整个题库" @click.stop="confirmDeleteCategory(ch.category)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <h2 class="section-title">练习模式</h2>
      <div class="mode-grid">
        <div class="mode-card" @click="router.push('/practice')">
          <div class="mc-header">
            <div class="mc-icon spelling">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </div>
            <span class="mc-arrow">→</span>
          </div>
          <h3>拼写练习</h3>
          <p>看中文释义拼出英文单词，写错不直接给答案</p>
        </div>
        <div class="mode-card" @click="router.push('/practice/cloze')">
          <div class="mc-header">
            <div class="mc-icon cloze">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="9" x2="15" y2="9"/>
                <line x1="9" y1="15" x2="12" y2="15"/>
              </svg>
            </div>
            <span class="mc-arrow">→</span>
          </div>
          <h3>完形填空</h3>
          <p>句子里随机挖空，根据上下文填词，接近真实阅读</p>
        </div>
        <div class="mode-card" @click="router.push('/practice/sentence')">
          <div class="mc-header">
            <div class="mc-icon sentence">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
              </svg>
            </div>
            <span class="mc-arrow">→</span>
          </div>
          <h3>句子翻译</h3>
          <p>看中文句子逐词填空，写对变绿锁定</p>
        </div>
      </div>
    </main>

    <!-- 删除确认弹窗 -->
    <div v-if="deleteCatVisible" class="modal-overlay" @click.self="cancelDeleteCategory()">
      <div class="modal-card" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff9500" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="modal-title">删除整个题库？</h3>
        <p class="modal-body">
          此操作<span style="color:#ff9500;font-weight:600">不可撤销</span>，
          将删除 <strong style="color:#1d1d1f">「{{ deleteCatName }}」</strong> 下的所有单词。
        </p>
        <div class="modal-actions" style="margin-top:8px">
          <button class="modal-btn cancel" @click="cancelDeleteCategory()">取消</button>
          <button class="modal-btn confirm warn" @click="doDeleteCategory()">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  background: transparent;
}

.main-content {
  width: min(1320px, calc(100% - 44px));
  margin: 0 auto;
  padding: 40px 0 80px;
}

.greeting {
  margin-bottom: 36px;
}
.greeting h1 {
  font-size: 38px;
  font-weight: 800;
  color: #1d1d1f;
  margin: 0 0 8px;
  letter-spacing: -.8px;
}
.greeting p {
  font-size: 17px;
  color: #6e6e73;
  margin: 0;
  font-weight: 500;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-bottom: 48px;
}
.stat-card {
  background: rgba(255, 255, 255, .78);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, .6);
  border-radius: 22px;
  padding: 26px;
  text-align: center;
  box-shadow: 0 12px 36px rgba(0, 0, 0, .04), 0 4px 12px rgba(0, 0, 0, .02), inset 0 0 0 1px rgba(255, 255, 255, .5);
  transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .06), 0 6px 16px rgba(0, 0, 0, .03), inset 0 0 0 1px rgba(255, 255, 255, .6);
}
.stat-value {
  font-size: 34px;
  font-weight: 800;
  color: #1d1d1f;
  display: block;
  line-height: 1.1;
  letter-spacing: -.5px;
}
.stat-label {
  font-size: 14px;
  color: #6e6e73;
  margin-top: 8px;
  display: block;
  font-weight: 600;
}
.stat-card.accent .stat-value { color: #ff7a50; }
.stat-card.warn .stat-value { color: #ff3b30; }

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #1d1d1f;
  margin: 0 0 18px;
  letter-spacing: -.2px;
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 48px;
}
.chapter-card {
  background: rgba(255, 255, 255, .78);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, .6);
  border-radius: 18px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all .2s ease;
  position: relative;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .03), 0 2px 8px rgba(0, 0, 0, .02), inset 0 0 0 1px rgba(255, 255, 255, .5);
}
.chapter-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 14px 40px rgba(0, 0, 0, .06), 0 4px 12px rgba(0, 0, 0, .03), inset 0 0 0 1px rgba(255, 255, 255, .6);
}
.ch-icon {
  width: 42px;
  height: 42px;
  background: #fff5f0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff7a50;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(255, 122, 80, .1);
}
.ch-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.ch-name {
  font-size: 15px;
  font-weight: 700;
  color: #1d1d1f;
}
.ch-count {
  font-size: 13px;
  color: #6e6e73;
  font-weight: 500;
}
.ch-arrow {
  color: #6e6e73;
  font-size: 15px;
  font-weight: 600;
  transition: all .2s ease;
}
.chapter-card:hover .ch-arrow {
  color: #ff7a50;
  transform: translateX(4px);
}
.ch-delete {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, .18);
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
  z-index: 2;
}
.ch-delete:hover {
  color: #ff3b30;
  background: rgba(255, 59, 48, .08);
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-bottom: 32px;
}
.mode-card {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, .06);
  border-radius: 22px;
  padding: 28px;
  cursor: pointer;
  transition: all .25s ease;
  box-shadow: 0 12px 36px rgba(0, 0, 0, .04), 0 4px 12px rgba(0, 0, 0, .02);
}
.mode-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, .08), 0 8px 22px rgba(0, 0, 0, .04);
}
.mc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.mc-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .06);
}
.mc-icon.spelling { background: #f5f3ff; color: #7c6fba; }
.mc-icon.cloze { background: #f0fdf4; color: #34c759; }
.mc-icon.sentence { background: #fff7ed; color: #ff9500; }
.mc-arrow {
  font-size: 16px;
  color: #6e6e73;
  font-weight: 600;
  transition: all .2s ease;
}
.mode-card:hover .mc-arrow {
  color: #ff7a50;
  transform: translateX(4px);
}
.mode-card h3 {
  font-size: 17px;
  font-weight: 700;
  color: #1d1d1f;
  margin: 0 0 8px;
}
.mode-card p {
  font-size: 14px;
  color: #6e6e73;
  margin: 0;
  line-height: 1.55;
  font-weight: 500;
}

@media (max-width: 1024px) {
  .chapter-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 768px) {
  .main-content { width: calc(100% - 16px); padding: 28px 0 60px; }
  .greeting h1 { font-size: 30px; }
  .stats-row,
  .mode-grid { grid-template-columns: 1fr; }
  .chapter-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .stat-card { padding: 22px; }
}

/* ── 删除确认弹窗 ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, .32);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn .2s ease;
}
.modal-card {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, .06);
  border-radius: 24px;
  padding: 36px 40px 28px;
  max-width: 380px;
  width: 90%;
  text-align: center;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .14);
  animation: scaleIn .25s ease;
}
.modal-icon { margin-bottom: 14px }
.modal-title { font-size: 19px; font-weight: 800; color: #1d1d1f; margin: 0 0 8px }
.modal-body { font-size: 15px; color: #6e6e73; line-height: 1.6; margin: 0 0 24px }
.modal-actions { display: flex; gap: 12px; justify-content: center }
.modal-btn {
  padding: 11px 28px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: all .15s;
}
.modal-btn.cancel { background: rgba(0, 0, 0, .05); color: #6e6e73 }
.modal-btn.cancel:hover { background: rgba(0, 0, 0, .1); color: #1d1d1f }
.modal-btn.confirm { background: #ff3b30; color: #fff; box-shadow: 0 4px 12px rgba(255, 59, 48, .25) }
.modal-btn.confirm:hover { background: #e02e24; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(255, 59, 48, .35) }
.modal-btn.confirm.warn { background: #ff9500; box-shadow: 0 4px 12px rgba(255, 149, 0, .25) }
.modal-btn.confirm.warn:hover { background: #e68600; box-shadow: 0 6px 18px rgba(255, 149, 0, .35) }

@keyframes fadeIn { 0% { opacity: 0 } 100% { opacity: 1 } }
@keyframes scaleIn { 0% { opacity: 0; transform: scale(.92) } 100% { opacity: 1; transform: scale(1) } }
</style>
