<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const props = defineProps<{
  content: string
}>()

// 使用 marked.use() 插件方式注册代码高亮（marked v5+ 推荐用法）
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value
        } catch {}
      }
      return hljs.highlightAuto(code).value
    },
  }),
)

// marked 基础配置
marked.setOptions({
  breaks: true,
  gfm: true,
})

/** 修复流式 SSE 拼接导致的 markdown 标记符紧跟内容（无空格）的问题。
 *  例如：event1="##", event2="标题" → "##标题"（markdown 不解析），应为 "## 标题" */
function fixMalformedMarkdown(text: string): string {
  return text
    // 标题：##text → ## text
    .replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
    // 无序列表：-text → - text, *text → * text, +text → + text
    .replace(/^([-*+])([^\s])/gm, '$1 $2')
    // 有序列表：1.text → 1. text
    .replace(/^(\d+\.)([^\s])/gm, '$1 $2')
    // 引用：>text → > text
    .replace(/^(>+)([^\s>])/gm, '$1 $2')
}

const html = computed(() => {
  try {
    const raw = props.content || ''
    return marked.parse(fixMalformedMarkdown(raw)) as string
  } catch {
    return props.content || ''
  }
})
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>

<style>
/* GitHub 风格的 markdown 样式（仅作用于 .markdown-body 内部） */
.markdown-body {
  line-height: 1.7;
  word-break: break-word;
}

.markdown-body > *:first-child {
  margin-top: 0;
}

.markdown-body > *:last-child {
  margin-bottom: 0;
}

.markdown-body p {
  margin: 0.5em 0;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin: 1em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-body h1 { font-size: 1.4em; }
.markdown-body h2 { font-size: 1.25em; }
.markdown-body h3 { font-size: 1.1em; }

.markdown-body ul,
.markdown-body ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.markdown-body li {
  margin: 0.25em 0;
}

.markdown-body blockquote {
  margin: 0.5em 0;
  padding: 0.25em 1em;
  border-left: 4px solid #ddd;
  color: #666;
}

.markdown-body code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f1f1;
  color: #333;
}

.markdown-body pre {
  margin: 0.75em 0;
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e2e;
}

.markdown-body pre code {
  display: block;
  padding: 14px 16px;
  background: transparent;
  color: #cdd6f4;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
}

.markdown-body table {
  border-collapse: collapse;
  margin: 0.75em 0;
  width: 100%;
  font-size: 14px;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  text-align: left;
}

.markdown-body th {
  background: #f5f5f5;
  font-weight: 600;
}

.markdown-body a {
  color: #e8734a;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 1em 0;
}

.markdown-body img {
  max-width: 100%;
  border-radius: 6px;
}

.markdown-body strong {
  font-weight: 600;
}
</style>
