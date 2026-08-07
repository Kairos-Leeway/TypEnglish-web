<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import ConversationSidebar from '../components/ConversationSidebar.vue'
import GlobalTopbar from '../components/GlobalTopbar.vue'
import api from '../api'
import type { ConversationMessage } from '../api/types'

const messages = ref<Array<{ role: string; content: string }>>([])
const input = ref('')
const loading = ref(false)
const streaming = ref(false)
const chatRef = ref<HTMLElement>()
let abortController: AbortController | null = null
const conversationId = ref<number | null>(null)
const sidebarRef = ref<InstanceType<typeof ConversationSidebar>>()

const suggestions = ['帮我总结一下最近的错题', '分析一下我的薄弱环节', '给我一些学习建议', '用表格对比 abandon 和 desert 的区别']

/** 选择对话 — 加载历史消息 */
async function selectConversation(id: number) {
  cancelStream()
  conversationId.value = id
  try {
    const { data } = await api.get(`/ai/conversation/${id}/messages`)
    const msgs = data as ConversationMessage[]
    messages.value = msgs.map(m => ({ role: m.role, content: m.content }))
  } catch {
    messages.value = []
  }
  nextTick(() => {
    chatRef.value?.scrollTo({ top: chatRef.value.scrollHeight })
  })
}

/** 新建对话 */
function newChat() {
  cancelStream()
  conversationId.value = null
  messages.value = []
}

/** 删除对话 */
function onDeleted(id: number) {
  if (conversationId.value === id) {
    newChat()
  }
}

async function send() {
  if (!input.value.trim() || loading.value) return
  const msg = input.value.trim(); input.value = ''
  messages.value.push({ role: 'user', content: msg })

  // 创建空的 AI 气泡用于流式填充
  messages.value.push({ role: 'assistant', content: '' })
  // 发消息后立即滚到底部
  nextTick(() => {
    if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight
  })
  loading.value = true; streaming.value = true

  try {
    abortController = new AbortController()
    const token = localStorage.getItem('token')
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const body: Record<string, string> = { message: msg }
    if (conversationId.value) body.conversationId = String(conversationId.value)
    const res = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: abortController.signal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    let currentEvent = ''
    const currentData: string[] = []

    function processLine(line: string) {
      if (line.startsWith('event:') && line[6] === ' ') {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        // SSE 规范：跳过 "data:" 后紧跟的第一个空格（协议分隔符），其余内容原样保留
        const data = line.slice(5)
        currentData.push(data)
      } else if (line === '') {
        dispatchCurrentEvent()
        currentEvent = ''
        currentData.length = 0
      }
    }

    function dispatchCurrentEvent() {
      if (currentData.length === 0) return
      const eventType = currentEvent || 'message'
      const text = currentData.join('\n')

      if (eventType === 'message') {
        const last = messages.value[messages.value.length - 1]
        if (last && last.role === 'assistant') {
          last.content += text
          messages.value = [...messages.value]
          // 流式输出过程中持续自动滚到底部
          nextTick(() => {
            if (chatRef.value) {
              chatRef.value.scrollTop = chatRef.value.scrollHeight
            }
          })
        }
      } else if (eventType === 'done') {
        // done 事件包含 conversationId，新对话时更新
        try {
          const meta = JSON.parse(text)
          if (meta.conversationId && !conversationId.value) {
            conversationId.value = meta.conversationId
            sidebarRef.value?.loadConversations()
          }
        } catch { /* ignore */ }
      }
    }

    function flushRemaining() {
      dispatchCurrentEvent()
      currentEvent = ''
      currentData.length = 0
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx)
        buffer = buffer.slice(newlineIdx + 1)
        processLine(line.replace(/\r$/, ''))
      }
    }

    if (buffer.trim()) {
      processLine(buffer.replace(/\r$/, ''))
    }
    flushRemaining()
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      const last = messages.value[messages.value.length - 1]
      if (last && last.role === 'assistant' && !last.content) {
        last.content = '抱歉,AI 服务暂时不可用。'
      }
    }
  } finally {
    loading.value = false; streaming.value = false; abortController = null
    await nextTick()
    chatRef.value?.scrollTo({ top: chatRef.value.scrollHeight, behavior: 'smooth' })
  }
}

function cancelStream() {
  abortController?.abort()
  abortController = null
  loading.value = false; streaming.value = false
}
onUnmounted(() => abortController?.abort())
</script>

<template>
  <div class="aichat">
    <GlobalTopbar />

    <div class="chat-body">
      <ConversationSidebar
        ref="sidebarRef"
        :currentId="conversationId"
        @select="selectConversation"
        @newChat="newChat"
        @deleted="onDeleted"
      />

      <main class="chat-layout">
        <div class="chat-panel" ref="chatRef">
          <div v-if="messages.length===0" class="chat-empty">
            <div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <h3>跟 AI 聊聊你的学习</h3>
            <div class="suggestions">
              <button v-for="s in suggestions" :key="s" class="sug-btn" @click="input=s;send()">{{s}}</button>
            </div>
          </div>

          <div v-for="(m,i) in messages" :key="i" :class="['msg-row',m.role,{streaming:streaming&&m.role==='assistant'&&i===messages.length-1}]">
            <div class="msg-avatar">{{m.role==='user'?'我':'AI'}}</div>
            <div class="msg-bubble">
              <MarkdownRenderer v-if="m.role==='assistant'" :content="m.content"/>
              <span v-else style="white-space:pre-wrap">{{m.content}}</span>
              <span v-if="streaming&&m.role==='assistant'&&i===messages.length-1&&!m.content" class="typing"><span class="dot"/><span class="dot"/><span class="dot"/></span>
            </div>
          </div>
        </div>

        <div class="input-panel">
          <input v-model="input" class="msg-input" placeholder="输入消息,Enter 发送..." :disabled="loading" @keyup.enter="send"/>
          <button v-if="!streaming" class="send-btn" :disabled="!input.trim()||loading" @click="send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
          <button v-else class="send-btn stop" @click="cancelStream">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.aichat{height:100vh;display:flex;flex-direction:column;background:#fef9f4}
.topbar{flex-shrink:0;z-index:10}
.logo-link{text-decoration:none}
.logo-icon{width:30px;height:30px;background:#e8734a;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.page-title{margin-left:12px;font-size:15px;font-weight:600;color:#2d2422}
.back-link{font-size:14px;color:#b8a097;text-decoration:none;transition:color .15s;font-weight:500;margin-left:20px}.back-link:hover{color:#e8734a}
.chat-body{flex:1;display:flex;overflow:hidden}
.chat-layout{flex:1;display:flex;flex-direction:column;width:100%;padding:0 32px 0;box-sizing:border-box;overflow:hidden}
.chat-panel{flex:1;overflow-y:auto;padding:24px 0;margin-bottom:12px;scroll-behavior:smooth}
.chat-panel::-webkit-scrollbar{width:6px}
.chat-panel::-webkit-scrollbar-track{background:transparent}
.chat-panel::-webkit-scrollbar-thumb{background:rgba(184,160,151,.25);border-radius:3px}
.chat-panel::-webkit-scrollbar-thumb:hover{background:rgba(184,160,151,.45)}
.chat-empty{text-align:center;padding:80px 0}
.empty-icon{width:64px;height:64px;background:#fff;border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.chat-empty h3{font-size:18px;color:#2d2422;margin:0 0 20px;font-weight:600}
.suggestions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:700px;margin:0 auto}
.sug-btn{padding:8px 16px;background:#fff;border:1px solid rgba(184,160,151,.15);border-radius:20px;font-size:13px;color:#2d2422;cursor:pointer;transition:all .15s}
.sug-btn:hover{border-color:#e8734a;color:#e8734a;background:#fef3ee}
.msg-row{display:flex;gap:10px;margin-bottom:20px;align-items:flex-start}
.msg-row.user{flex-direction:row-reverse}
.msg-avatar{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.msg-row.user .msg-avatar{background:#e8734a;color:#fff}
.msg-row.assistant .msg-avatar{background:#fef3ee;color:#e8734a}
.msg-bubble{max-width:80%;padding:12px 18px;border-radius:14px;font-size:14px;line-height:1.7;word-break:break-word;overflow-wrap:break-word}
.msg-row.user .msg-bubble{background:#e8734a;color:#fff;border-bottom-right-radius:4px}
.msg-row.assistant .msg-bubble{background:#fff;color:#2d2422;border-bottom-left-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.msg-row.streaming .msg-bubble{box-shadow:0 0 12px rgba(232,115,74,.3);animation:breathe 1.6s ease-in-out infinite}
@keyframes breathe{0%,100%{box-shadow:0 0 8px rgba(232,115,74,.15)}50%{box-shadow:0 0 18px rgba(232,115,74,.35)}}
.typing{display:inline-flex;gap:4px;align-items:center;height:18px;margin-left:4px}
.dot{width:5px;height:5px;background:#e8734a;border-radius:50%;animation:bounce 1.4s ease-in-out infinite}
.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,80%,100%{transform:scale(.6)}40%{transform:scale(1)}}
.input-panel{display:flex;gap:8px;padding:0 0 20px;flex-shrink:0}
.msg-input{flex:1;padding:12px 18px;border:1.5px solid rgba(184,160,151,.18);border-radius:14px;font-size:14px;outline:0;background:#fff;color:#2d2422}
.msg-input::placeholder{color:#b8a097}
.msg-input:focus{border-color:#e8734a;background:#fff}
.send-btn{width:44px;height:44px;background:#e8734a;color:#fff;border:none;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s}
.send-btn:hover:not(:disabled){background:#d4653a;transform:scale(1.05)}.send-btn:disabled{opacity:.4;cursor:not-allowed}
.send-btn.stop{background:#c94a4a}
</style>
