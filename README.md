# TypEnglish · 前端

Vue 3 + TypeScript + Vite 前端应用。

## 技术栈

Vue 3 · TypeScript · Vite · Element Plus · Pinia · Vue Router · Axios

## 目录结构

```
src/
├── views/                    # 页面
├── components/               # 共享组件（GlobalTopbar 等）
├── stores/                   # Pinia 状态管理（auth、errorBook）
├── api/                      # Axios 封装
├── composables/              # 组合式函数
├── assets/                   # 全局样式
└── router/                   # 路由配置
```

## 路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/login` | Login | 登录（无需认证） |
| `/` | Home | 首页 |
| `/practice` | Practice | 拼写练习 |
| `/practice/sentence` | SentencePractice | 句子翻译 |
| `/practice/cloze` | ClozePractice | 完形填空 |
| `/errorbook` | ErrorBook | 错题本 |
| `/ai-generate` | AiGenerate | AI 出题 |
| `/ai-chat` | AiChat | AI 助教 |
