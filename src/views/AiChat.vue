<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import AiFormCard from '../components/AiFormCard.vue'
import ConversationSidebar from '../components/ConversationSidebar.vue'
import GlobalTopbar from '../components/GlobalTopbar.vue'
import api from '../api'
import type { ChatToolAction, ChatToolRun, ConversationMessage } from '../api/types'
import {
  buildQuestionFormSubmission,
  formSubmissionToolId,
  visibleChatContent,
} from '../utils/aiFormSubmission'

type ChatMessage = { role: ConversationMessage['role']; content: string; tools?: ChatToolRun[] }
const messages = ref<ChatMessage[]>([])
const router = useRouter()
const input = ref('')
const loading = ref(false)
const streaming = ref(false)
const chatRef = ref<HTMLElement>()
let abortController: AbortController | null = null
const conversationId = ref<number | null>(null)
const sidebarRef = ref<InstanceType<typeof ConversationSidebar>>()
const submittedFormIds = ref(new Set<string>())

const suggestions = ['帮我出一些题', '帮我总结一下最近的错题', '分析一下我的薄弱环节', '用表格对比 abandon 和 desert 的区别']

function legacyPracticeTool(content: string): ChatToolRun[] {
  if (!/(练习已就绪|练习已准备好|开始这轮练习)/.test(content)) return []
  const count = Number(content.match(/(\d+)\s*(?:题|道)/)?.[1] || 10)
  const cloze = /完形|cloze/i.test(content)
  return [{
    id: `legacy-practice-${count}-${cloze ? 'cloze' : 'typing'}`,
    phase: 'done', name: 'createPracticeSession', title: '练习已准备好',
    summary: `已准备 ${count} 题的个性化练习`,
    action: { type: 'start_practice', label: '开始这轮练习', route: cloze ? '/practice/cloze' : '/practice', query: { language: 'en', count, coach: '1' } }
  }]
}

/** 选择对话 — 加载历史消息 */
async function selectConversation(id: number) {
  cancelStream()
  conversationId.value = id
  try {
    const { data } = await api.get(`/ai/conversation/${id}/messages`)
    const msgs = data as ConversationMessage[]
    submittedFormIds.value = new Set(
      msgs.map(m => m.role === 'user' ? formSubmissionToolId(m.content) : null)
        .filter((toolId): toolId is string => Boolean(toolId)),
    )
    messages.value = msgs.map(m => ({
      role: m.role,
      content: m.role === 'user' ? visibleChatContent(m.content) : m.content,
      tools: m.tools?.length ? m.tools : legacyPracticeTool(m.content)
    }))
  } catch {
    messages.value = []
    submittedFormIds.value = new Set()
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
  submittedFormIds.value = new Set()
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
  await streamMessage(msg)
}

async function streamMessage(msg: string) {
  if (!msg.trim() || loading.value) return
  messages.value.push({ role: 'user', content: visibleChatContent(msg) })

  // 创建空的 AI 气泡用于流式填充
  messages.value.push({ role: 'assistant', content: '', tools: [] })
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
      } else if (eventType === 'tool') {
        try {
          const tool = JSON.parse(text) as ChatToolRun
          const last = messages.value[messages.value.length - 1]
          if (last?.role === 'assistant') {
            const tools = [...(last.tools || [])]
            const index = tools.findIndex(item => item.id === tool.id)
            if (index >= 0) tools[index] = tool
            else tools.push(tool)
            last.tools = tools
            messages.value = [...messages.value]
          }
          nextTick(() => chatRef.value?.scrollTo({ top: chatRef.value.scrollHeight }))
        } catch { /* ignore malformed tool event */ }
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

function runToolAction(action?: ChatToolAction) {
  if (!action || action.type !== 'start_practice') return
  router.push({ path: action.route, query: action.query || {} })
}

function submitToolForm(tool: ChatToolRun, values: Record<string, string | number>) {
  if (tool.action?.type !== 'input_form' || loading.value || submittedFormIds.value.has(tool.id)) return
  submittedFormIds.value = new Set([...submittedFormIds.value, tool.id])
  void streamMessage(buildQuestionFormSubmission(tool.id, values))
}

function isFormSubmitted(toolId: string) {
  return submittedFormIds.value.has(toolId)
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
              <div v-if="m.role==='assistant' && m.tools?.length" class="tool-stack">
                <div
                  v-for="tool in m.tools"
                  :key="tool.id"
                  :class="['tool-card',tool.phase,{ 'input-form': tool.action?.type==='input_form' }]"
                >
                  <div class="tool-orb">
                    <span v-if="tool.phase==='start'" class="tool-spinner" />
                    <svg v-else-if="tool.phase==='done'" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>
                    <svg v-else viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>
                  </div>
                  <div class="tool-copy"><strong>{{tool.title}}</strong><span v-if="tool.summary">{{tool.summary}}</span></div>
                  <button
                    v-if="tool.phase==='done'&&tool.action?.type==='start_practice'"
                    class="tool-action"
                    @click="runToolAction(tool.action)"
                  >
                    {{tool.action.label}} <span>→</span>
                  </button>
                  <div v-if="tool.phase==='done'&&tool.action?.type==='input_form'" class="tool-form-slot">
                    <AiFormCard
                      :action="tool.action"
                      :disabled="loading || !conversationId"
                      :submitted="isFormSubmitted(tool.id)"
                      @submit="submitToolForm(tool,$event)"
                    />
                  </div>
                </div>
              </div>
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
.aichat{height:100vh;height:100dvh;display:flex;flex-direction:column;background:transparent}
.topbar{flex-shrink:0;z-index:10}
.logo-link{text-decoration:none}
.logo-icon{width:30px;height:30px;background:#e8734a;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.page-title{margin-left:12px;font-size:15px;font-weight:600;color:#2d2422}
.back-link{font-size:14px;color:#b8a097;text-decoration:none;transition:color .15s;font-weight:500;margin-left:20px}.back-link:hover{color:#e8734a}
.chat-body{flex:1;display:flex;gap:16px;width:min(1320px,calc(100% - 44px));min-height:0;margin:12px auto 16px;overflow:visible}
.chat-layout{position:relative;flex:1;display:flex;flex-direction:column;min-width:0;width:100%;padding:0 18px;box-sizing:border-box;overflow:hidden;border:1px solid rgba(255,255,255,.58);border-radius:21px;background:rgba(255,255,255,.24);box-shadow:inset 0 1px 0 rgba(255,255,255,.54)}
.chat-layout::before{content:'';position:absolute;top:-140px;left:50%;width:480px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,182,151,.12),transparent 68%);filter:blur(8px);transform:translateX(-50%);pointer-events:none}
.chat-panel{flex:1;overflow-y:auto;padding:24px 4px;margin-bottom:8px;scroll-behavior:smooth}
.chat-panel::-webkit-scrollbar{width:6px}
.chat-panel::-webkit-scrollbar-track{background:transparent}
.chat-panel::-webkit-scrollbar-thumb{background:rgba(184,160,151,.25);border-radius:3px}
.chat-panel::-webkit-scrollbar-thumb:hover{background:rgba(184,160,151,.45)}
.chat-empty{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;padding:68px 20px 32px}
.empty-icon{width:64px;height:64px;background:rgba(255,255,255,.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.65);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 12px 36px rgba(184,160,151,.08),0 4px 12px rgba(184,160,151,.04),inset 0 0 0 1px rgba(255,255,255,.5)}
.chat-empty h3{font-size:20px;color:#2d2422;margin:0 0 24px;font-weight:700}
.suggestions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:700px;margin:0 auto}
.sug-btn{padding:10px 18px;background:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.65);border-radius:20px;font-size:14px;color:#2d2422;cursor:pointer;transition:all .15s}
.sug-btn:hover{border-color:rgba(232,115,74,.4);color:#e8734a;background:#fff}
.msg-row{display:flex;gap:10px;margin-bottom:20px;align-items:flex-start}
.msg-row.user{flex-direction:row-reverse}
.msg-avatar{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.msg-row.user .msg-avatar{background:#e8734a;color:#fff}
.msg-row.assistant .msg-avatar{background:rgba(255,255,255,.78);color:#e8734a;box-shadow:0 4px 12px rgba(184,160,151,.08)}
.msg-bubble{max-width:min(78%,900px);padding:13px 20px;border-radius:16px;font-size:15px;line-height:1.7;word-break:break-word;overflow-wrap:break-word}
.msg-row.user .msg-bubble{background:linear-gradient(135deg,#e8734a,#f0a060);color:#fff;border-bottom-right-radius:4px;box-shadow:0 6px 18px rgba(232,115,74,.25)}
.msg-row.assistant .msg-bubble{background:rgba(255,255,255,.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#2d2422;border-bottom-left-radius:4px;box-shadow:0 6px 18px rgba(184,160,151,.08),inset 0 0 0 1px rgba(255,255,255,.5)}
.msg-row.streaming .msg-bubble{box-shadow:0 0 16px rgba(232,115,74,.25);animation:breathe 1.6s ease-in-out infinite}
.tool-stack{display:grid;gap:8px;margin:0 0 12px}
.tool-card{display:flex;align-items:center;gap:11px;min-width:min(430px,62vw);padding:11px 12px;border:1px solid rgba(232,115,74,.13);border-radius:14px;background:linear-gradient(135deg,rgba(255,249,246,.94),rgba(255,255,255,.82));box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}
.tool-card.done{border-color:rgba(75,170,117,.2);background:linear-gradient(135deg,rgba(242,252,247,.95),rgba(255,255,255,.86))}
.tool-card.error{border-color:rgba(205,82,76,.2);background:rgba(255,246,245,.9)}
.tool-card.input-form{flex-wrap:wrap;min-width:min(540px,68vw)}
.tool-form-slot{flex:0 0 100%;box-sizing:border-box;padding-left:41px}
.tool-orb{width:30px;height:30px;display:grid;place-items:center;flex:0 0 auto;border-radius:10px;color:#e8734a;background:rgba(232,115,74,.1)}
.tool-card.done .tool-orb{color:#2f9a65;background:rgba(47,154,101,.1)}.tool-card.error .tool-orb{color:#c94a4a}
.tool-orb svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.tool-spinner{width:13px;height:13px;border:2px solid rgba(232,115,74,.22);border-top-color:#e8734a;border-radius:50%;animation:toolSpin .8s linear infinite}@keyframes toolSpin{to{transform:rotate(360deg)}}
.tool-copy{display:flex;flex-direction:column;min-width:0;flex:1;line-height:1.35}.tool-copy strong{font-size:13px;color:#493d39}.tool-copy span{font-size:12px;color:#9b857d;margin-top:2px}
.tool-action{border:0;border-radius:10px;padding:8px 11px;white-space:nowrap;background:#2d2928;color:#fff;font-size:12px;font-weight:650;cursor:pointer;transition:.18s}.tool-action:hover{transform:translateY(-1px);background:#e8734a;box-shadow:0 5px 14px rgba(232,115,74,.2)}.tool-action span{margin-left:4px}
@keyframes breathe{0%,100%{box-shadow:0 0 8px rgba(232,115,74,.12)}50%{box-shadow:0 0 20px rgba(232,115,74,.32)}}
.typing{display:inline-flex;gap:4px;align-items:center;height:18px;margin-left:4px}
.dot{width:5px;height:5px;background:#e8734a;border-radius:50%;animation:bounce 1.4s ease-in-out infinite}
.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,80%,100%{transform:scale(.6)}40%{transform:scale(1)}}
.input-panel{display:flex;gap:10px;padding:0 0 16px;flex-shrink:0}
.msg-input{flex:1;padding:14px 22px;border:1.5px solid rgba(255,255,255,.65);border-radius:18px;font-size:15px;outline:0;background:rgba(255,255,255,.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#2d2422;box-shadow:0 6px 18px rgba(184,160,151,.08),inset 0 0 0 1px rgba(255,255,255,.5)}
.msg-input::placeholder{color:#b8a097}
.msg-input:focus{border-color:rgba(232,115,74,.45);background:#fff;box-shadow:0 8px 26px rgba(232,115,74,.14),0 0 0 4px rgba(232,115,74,.08)}
.send-btn{width:48px;height:48px;background:linear-gradient(135deg,#e8734a,#f0a060);color:#fff;border:none;border-radius:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s;box-shadow:0 6px 18px rgba(232,115,74,.25)}
.send-btn:hover:not(:disabled){transform:scale(1.05);box-shadow:0 10px 26px rgba(232,115,74,.35)}.send-btn:disabled{opacity:.4;cursor:not-allowed}
.send-btn.stop{background:#c94a4a}
@media(max-width:820px){.chat-body{width:calc(100% - 24px);gap:10px;margin:10px auto 12px}.chat-layout{padding:0 12px}.msg-bubble{max-width:86%}}
@media(max-width:680px){.chat-body{width:calc(100% - 16px);margin-top:8px}.chat-layout{border-radius:17px}.chat-empty{padding-top:48px}.suggestions{gap:7px}.sug-btn{padding:9px 13px;font-size:12px}}
@media(max-width:680px){.tool-card,.tool-card.input-form{min-width:0;align-items:flex-start;flex-wrap:wrap}.tool-action{width:100%;margin-left:41px}.tool-form-slot{padding-left:0}}
</style>
