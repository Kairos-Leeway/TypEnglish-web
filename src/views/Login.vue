<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const isLogin = ref(true)
const form = ref({ username: '', email: '', password: '', account: '' })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    if (isLogin.value) {
      await auth.login(form.value.account, form.value.password)
    } else {
      await auth.register(form.value.username, form.value.email, form.value.password)
    }
    router.push('/')
  } catch (e: any) {
    error.value = e.response?.data?.msg || e.message || '操作失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <!-- 装饰背景 -->
    <div class="bg-decoration">
      <div class="orb orb-1" />
      <div class="orb orb-2" />
      <div class="orb orb-3" />
    </div>

    <div class="auth-wrapper">
      <!-- 左侧品牌区 -->
      <div class="brand-panel">
        <div class="brand-content">
          <h1 class="brand-title">TypEnglish</h1>
          <p class="brand-subtitle">AI 驱动的语言学习</p>
          <div class="feature-list">
            <div class="feature-item">
              <span class="feature-icon">AI</span>
              <span>智能出题,词库无限增长</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📝</span>
              <span>打字 + 听写 + 翻译多种模式</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📊</span>
              <span>错题本 + 个性化复习建议</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🌍</span>
              <span>英语 · 日语 · 德语持续扩展</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧表单区 -->
      <div class="form-panel">
        <div class="form-card">
          <div class="form-tabs">
            <button
              :class="['tab', { active: isLogin }]"
              @click="isLogin = true"
            >登录</button>
            <button
              :class="['tab', { active: !isLogin }]"
              @click="isLogin = false"
            >注册</button>
          </div>

          <form @submit.prevent="submit" class="form-body">
            <div v-if="!isLogin" class="input-group">
              <el-icon><User /></el-icon>
              <input v-model="form.username" placeholder="用户名" autocomplete="username" />
            </div>

            <div class="input-group">
              <el-icon v-if="isLogin"><User /></el-icon>
              <el-icon v-else><Message /></el-icon>
              <input
                v-if="isLogin"
                v-model="form.account"
                placeholder="用户名或邮箱"
                autocomplete="username"
              />
              <input
                v-else
                v-model="form.email"
                type="email"
                placeholder="邮箱地址"
                autocomplete="email"
              />
            </div>

            <div class="input-group">
              <el-icon><Lock /></el-icon>
              <input
                v-model="form.password"
                type="password"
                placeholder="密码"
                autocomplete="current-password"
              />
            </div>

            <p v-if="error" class="error-msg">{{ error }}</p>

            <button type="submit" class="submit-btn" :disabled="loading">
              <span v-if="loading" class="spinner" />
              <span v-else>{{ isLogin ? '登 录' : '注 册' }}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2a1a15 0%, #3d2218 40%, #2e2520 100%);
  position: relative;
  overflow: hidden;
}

.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.3;
  animation: float 8s ease-in-out infinite;
}
.orb-1 { width: 400px; height: 400px; background: #e8734a; top: -100px; right: -100px; }
.orb-2 { width: 300px; height: 300px; background: #d4653a; bottom: -80px; left: -80px; animation-delay: -4s; }
.orb-3 { width: 200px; height: 200px; background: #f0a080; top: 50%; left: 40%; animation-delay: -2s; }
@keyframes float {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-30px) scale(1.05); }
}

.auth-wrapper {
  display: flex;
  width: 900px;
  max-width: 95vw;
  min-height: 520px;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0,0,0,0.4);
  position: relative;
  z-index: 1;
}

.brand-panel {
  flex: 1;
  background: linear-gradient(150deg, rgba(232,115,74,0.95) 0%, rgba(212,101,58,0.95) 100%);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  padding: 48px 40px;
  color: #fff;
}
.brand-title {
  font-size: 36px;
  font-weight: 800;
  margin: 0 0 8px;
  letter-spacing: -1px;
}
.brand-subtitle {
  font-size: 16px;
  opacity: 0.85;
  margin: 0 0 36px;
}
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  opacity: 0.9;
}
.feature-icon {
  width: 32px;
  height: 32px;
  background: rgba(255,255,255,0.2);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.form-panel {
  flex: 1;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.form-card {
  width: 100%;
  max-width: 320px;
}
.form-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 32px;
  border-radius: 10px;
  background: rgba(184,160,151,.06);
  padding: 4px;
}
.tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #b8a097;
  cursor: pointer;
  transition: all 0.2s;
}
.tab.active {
  background: #fff;
  color: #e8734a;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.input-group {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border: 1.5px solid rgba(184,160,151,.18);
  border-radius: 10px;
  background: #fef9f4;
  transition: border-color 0.2s;
}
.input-group:focus-within {
  border-color: #e8734a;
  background: #fff;
}
.input-group .el-icon {
  color: #b8a097;
  font-size: 16px;
  flex-shrink: 0;
}
.input-group input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 14px 0;
  font-size: 15px;
  color: #2d2422;
  outline: none;
}
.input-group input::placeholder {
  color: #b8a097;
}

.error-msg {
  color: #c94a4a;
  font-size: 13px;
  margin: 0;
  text-align: center;
  background: #fdf0f0;
  padding: 8px 12px;
  border-radius: 8px;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #e8734a, #d4653a);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
}
.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 25px rgba(232,115,74,0.4);
}
.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.spinner {
  width: 20px; height: 20px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .brand-panel { display: none; }
  .auth-wrapper { max-width: 100vw; min-height: 100vh; border-radius: 0; }
  .form-panel { padding: 24px; }
}
</style>
