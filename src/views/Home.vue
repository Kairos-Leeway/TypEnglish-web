<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const router = useRouter()
const auth = useAuthStore()
const stats = ref({ total: 0, correct: 0, accuracy: 0 })
const errorCount = ref(0)
const chapters = ref<Array<{category: string, wordCount: number}>>([])
const deleteCatVisible = ref(false)
const deleteCatName = ref('')

function confirmDeleteCategory(cat: string) {
  deleteCatName.value = cat
  deleteCatVisible.value = true
}

async function doDeleteCategory() {
  deleteCatVisible.value = false
  await api.delete('/words/category', { data: { category: deleteCatName.value } }).catch(() => {})
  chapters.value = chapters.value.filter(c => c.category !== deleteCatName.value)
}

onMounted(async () => {
  try {
    const [s, e, se] = await Promise.all([
      api.get('/practice/stats'),
      api.get('/errorbook?size=1'),
      api.get('/errorbook/sentences?size=1')
    ])
    stats.value = s.data
    const wordErrCount = (e.data.total > 0) ? e.data.total : (e.data.items ? e.data.items.length : 0)
    const sentErrCount = (se.data.total > 0) ? se.data.total : (se.data.items ? se.data.items.length : 0)
    errorCount.value = wordErrCount + sentErrCount
  } catch {}
  api.get('/categories').then(({ data }) => chapters.value = data).catch(() => {})
})

function logout() { auth.logout(); router.push('/login') }
</script>

<template>
  <div class="home">
    <header class="topbar">
      <div class="logo"><span class="logo-icon">T</span><span class="logo-text">TypEnglish</span></div>
      <nav class="topbar-nav">
        <router-link to="/" class="nav-link active">首页</router-link>
        <router-link to="/errorbook" class="nav-link">错题本<strong v-if="errorCount" class="nav-badge">{{errorCount}}</strong></router-link>
        <router-link to="/ai-generate" class="nav-link">AI出题</router-link>
        <router-link to="/ai-chat" class="nav-link">AI助教</router-link>
      </nav>
      <div class="topbar-right"><span class="user-name">{{auth.user?.username}}</span><button class="logout-btn" @click="logout">退出</button></div>
    </header>
    <main class="main-content">
      <div class="greeting"><h1>Hi, {{auth.user?.username}}</h1><p>今天想练习什么?</p></div>
      <div class="stats-row"><div class="stat-card"><span class="stat-value">{{stats.total}}</span><span class="stat-label">总练习</span></div><div class="stat-card accent"><span class="stat-value">{{stats.accuracy}}%</span><span class="stat-label">正确率</span></div><div class="stat-card warn"><span class="stat-value">{{errorCount}}</span><span class="stat-label">待复习</span></div></div>
      <h2 class="section-title">词库章节</h2>
      <div class="chapter-grid"><div v-for="ch in chapters" :key="ch.category" class="chapter-card" @click="$router.push({ path: '/practice', query: { category: ch.category }})"><div class="ch-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><div class="ch-info"><span class="ch-name">{{ch.category}}</span><span class="ch-count">{{ch.wordCount}}词</span></div><span class="ch-arrow">→</span><button class="ch-delete" title="删除整个题库" @click.stop="confirmDeleteCategory(ch.category)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div>
      <h2 class="section-title">练习模式</h2>
      <div class="mode-grid">
        <div class="mode-card" @click="router.push('/practice')"><div class="mc-header"><div class="mc-icon" style="background:#eef2ff;color:#6366f1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div><span class="mc-arrow">→</span></div><h3>拼写练习</h3><p>看中文释义拼出英文单词,写错不直接给答案</p></div>
        <div class="mode-card" @click="router.push('/practice/cloze')"><div class="mc-header"><div class="mc-icon" style="background:#f0fdf4;color:#10b981"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="12" y2="15"/></svg></div><span class="mc-arrow">→</span></div><h3>完形填空</h3><p>句子里随机挖空,根据上下文填词,接近真实阅读</p></div>
        <div class="mode-card" @click="router.push('/practice/sentence')"><div class="mc-header"><div class="mc-icon" style="background:#fef3c7;color:#f59e0b"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div><span class="mc-arrow">→</span></div><h3>句子翻译</h3><p>看中文句子逐词填空,写对变绿锁定</p></div>
      </div>
    </main>
    <!-- 删除确认弹窗 -->
    <el-dialog v-model="deleteCatVisible" title="确认删除" width="380px" center>
      <p style="text-align:center;margin:16px 0;color:#475569;font-size:15px">确定要删除整个题库 <strong style="color:#1e293b">「{{deleteCatName}}」</strong> 吗？<br/><span style="font-size:13px;color:#94a3b8">这将删除该题库下的所有单词</span></p>
      <template #footer><el-button @click="deleteCatVisible=false">取消</el-button><el-button type="danger" @click="doDeleteCategory">确认删除</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.home{min-height:100vh;background:#fef9f4}
.topbar{display:flex;align-items:center;height:56px;padding:0 24px;background:rgba(255,255,255,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(184,160,151,.15)}
.topbar-inner{display:flex;align-items:center;width:100%}
.logo{display:flex;align-items:center;gap:10px;margin-right:36px}
.logo-icon{width:30px;height:30px;background:#e8734a;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.logo-text{font-size:16px;font-weight:600;color:#2d2422}
.topbar-nav{display:flex;gap:2px;flex:1}
.nav-link{padding:8px 16px;border-radius:8px;font-size:14px;font-weight:500;color:#b8a097;text-decoration:none;transition:all .15s;position:relative}
.nav-link:hover{color:#2d2422;background:rgba(255,255,255,.6)}
.nav-link.active{color:#2d2422;background:rgba(255,255,255,.6)}
.nav-badge{position:absolute;top:-4px;right:-6px;background:#c94a4a;color:#fff;font-size:11px;font-weight:800;min-width:20px;height:20px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 2px 4px rgba(201,74,74,.3);animation:pulse-badge 2s ease-in-out infinite}
@keyframes pulse-badge{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
.topbar-right{display:flex;align-items:center;gap:16px}
.user-name{font-size:14px;color:#2d2422}
.logout-btn{padding:6px 14px;border:1px solid rgba(184,160,151,.18);border-radius:8px;background:rgba(255,255,255,.5);color:#b8a097;font-size:13px;cursor:pointer;transition:all .15s}
.logout-btn:hover{border-color:#c94a4a;color:#c94a4a}
.main-content{max-width:1200px;margin:0 auto;padding:48px 48px 80px}
.greeting{margin-bottom:32px}.greeting h1{font-size:32px;font-weight:700;color:#2d2422;margin:0 0 6px}.greeting p{font-size:16px;color:#b8a097;margin:0}
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:40px}
.stat-card{background:#fff;border-radius:16px;padding:24px;text-align:center;border:1px solid rgba(184,160,151,.18);box-shadow:0 1px 3px rgba(0,0,0,.04)}
.stat-value{font-size:32px;font-weight:700;color:#2d2422;display:block;line-height:1.1}
.stat-label{font-size:13px;color:#b8a097;margin-top:8px;display:block}
.stat-card.accent .stat-value{color:#e8734a}.stat-card.warn .stat-value{color:#c94a4a}
.section-title{font-size:16px;font-weight:600;color:#2d2422;margin:0 0 16px}
.chapter-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:40px}
.chapter-card{background:#fff;border-radius:14px;padding:18px;border:1px solid rgba(184,160,151,.18);display:flex;align-items:center;gap:12px;cursor:pointer;transition:all .15s;position:relative;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.chapter-card:hover{background:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.08)}
.ch-icon{width:40px;height:40px;background:#fef3ee;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#e8734a;flex-shrink:0}
.ch-info{display:flex;flex-direction:column;flex:1;min-width:0}
.ch-name{font-size:14px;font-weight:600;color:#2d2422}
.ch-count{font-size:12px;color:#b8a097}
.ch-arrow{color:#b8a097;font-size:14px;transition:all .15s}
.chapter-card:hover .ch-arrow{color:#e8734a;transform:translateX(3px)}
.ch-delete{position:absolute;top:6px;right:8px;width:24px;height:24px;border:none;background:transparent;color:rgba(184,160,151,.25);cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all .15s;z-index:2}
.ch-delete:hover{color:#c94a4a;background:rgba(254,226,226,.5)}
.mode-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:32px}
.mode-card{background:#fff;border-radius:16px;padding:28px;border:1px solid rgba(184,160,151,.18);cursor:pointer;transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.mode-card:hover{background:#fff;transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}
.mc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.mc-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center}
.mc-arrow{font-size:16px;color:#b8a097;transition:all .2s}
.mode-card:hover .mc-arrow{color:#e8734a;transform:translateX(4px)}
.mode-card h3{font-size:16px;font-weight:700;color:#2d2422;margin:0 0 6px}
.mode-card p{font-size:13px;color:#b8a097;margin:0;line-height:1.5}
@media(max-width:768px){.topbar-nav{display:none}.stats-row,.mode-grid{grid-template-columns:1fr}.chapter-grid{grid-template-columns:repeat(2,1fr)}.topbar-inner,.main-content{padding-left:20px;padding-right:20px}}
</style>
