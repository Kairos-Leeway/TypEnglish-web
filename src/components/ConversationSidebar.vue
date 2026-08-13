<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../api'
import type { Conversation } from '../api/types'

const props = defineProps<{
  currentId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  newChat: []
  deleted: [id: number]
}>()

const conversations = ref<Conversation[]>([])
const loading = ref(false)
const editingId = ref<number | null>(null)
const editTitle = ref('')

async function loadConversations() {
  loading.value = true
  try {
    const { data } = await api.get('/ai/conversations')
    conversations.value = data as Conversation[]
  } catch { /* ignore */ }
  finally { loading.value = false }
}

async function handleDelete(id: number) {
  try {
    await api.delete(`/ai/conversation/${id}`)
    emit('deleted', id)
    loadConversations()
  } catch { /* ignore */ }
}

function startEdit(c: Conversation) {
  editingId.value = c.id
  editTitle.value = c.title
}

async function saveEdit() {
  if (!editingId.value || !editTitle.value.trim()) {
    editingId.value = null
    return
  }
  try {
    await api.put(`/ai/conversation/${editingId.value}/title`, { title: editTitle.value.trim() })
    loadConversations()
  } catch { /* ignore */ }
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (d.toDateString() === now.toDateString()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(loadConversations)
defineExpose({ loadConversations })
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">对话记录</span>
      <button class="new-chat-btn" @click="$emit('newChat')" title="新对话">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <div class="sidebar-list" v-if="!loading">
      <div v-if="conversations.length === 0" class="sidebar-empty">暂无历史对话</div>
      <div
        v-for="c in conversations"
        :key="c.id"
        :class="['sidebar-item', { active: c.id === currentId }]"
        @click="$emit('select', c.id)"
      >
        <template v-if="editingId === c.id">
          <input
            v-model="editTitle"
            class="sidebar-edit-input"
            @keyup.enter="saveEdit"
            @keyup.escape="cancelEdit"
            @blur="saveEdit"
            ref="editInput"
            @click.stop
          />
        </template>
        <template v-else>
          <span class="sidebar-item-title" @dblclick.stop="startEdit(c)">{{ c.title }}</span>
          <span class="sidebar-item-time">{{ formatTime(c.updateTime) }}</span>
        </template>
        <button class="sidebar-item-del" @click.stop="handleDelete(c.id)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
    <div v-else class="sidebar-loading">加载中...</div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 252px;
  min-width: 252px;
  box-sizing: border-box;
  overflow: hidden;
  background: rgba(255,255,255,.62);
  border: 1px solid rgba(255,255,255,.78);
  border-radius: 21px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.94);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 12px 13px 10px 17px;
  border-bottom: 1px solid rgba(45,36,32,.06);
}
.sidebar-title {
  font-size: 14px;
  font-weight: 700;
  color: #2d2422;
}
.new-chat-btn {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255,255,255,.82);
  border-radius: 11px;
  background: rgba(255,255,255,.72);
  color: #e8734a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(45,35,30,.055);
  transition: transform .18s ease, background .18s ease, box-shadow .18s ease;
}
.new-chat-btn:hover { background: #fff; transform: rotate(5deg) scale(1.04); box-shadow: 0 5px 14px rgba(45,35,30,.08) }
.sidebar-list { flex: 1; overflow-y: auto; padding: 9px; }
.sidebar-empty {
  text-align: center;
  color: #b8a097;
  font-size: 13px;
  padding: 38px 16px;
}
.sidebar-loading {
  text-align: center;
  color: #b8a097;
  font-size: 13px;
  padding: 24px;
}
.sidebar-item {
  padding: 11px 12px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, transform .16s ease;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}
.sidebar-item:hover { background: rgba(255,255,255,.62); transform: translateX(2px) }
.sidebar-item.active { border-color: rgba(255,122,80,.14); background: rgba(255,244,238,.86) }
.sidebar-item.active::before { content: ''; position: absolute; left: 5px; top: 12px; bottom: 12px; width: 2px; border-radius: 99px; background: #ff7048 }
.sidebar-item-title {
  font-size: 13px;
  color: #2d2422;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 24px;
}
.sidebar-item-time {
  font-size: 11px;
  color: #b8a097;
}
.sidebar-edit-input {
  font-size: 13px;
  padding: 2px 4px;
  border: 1.5px solid #e8734a;
  border-radius: 4px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  color: #2d2422;
}
.sidebar-item-del {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #b8a097;
  cursor: pointer;
  padding: 2px;
  opacity: 0;
  transition: opacity .15s;
}
.sidebar-item:hover .sidebar-item-del { opacity: 1; }
.sidebar-item-del:hover { color: #c94a4a; }

@media (max-width: 820px) {
  .sidebar { width: 210px; min-width: 210px }
}
@media (max-width: 680px) {
  .sidebar { display: none }
}
</style>
