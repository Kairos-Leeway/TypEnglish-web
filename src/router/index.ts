import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'Login', component: () => import('../views/Login.vue') },
    { path: '/', name: 'Home', component: () => import('../views/Home.vue'), meta: { requiresAuth: true } },
    { path: '/practice', name: 'Practice', component: () => import('../views/PracticeEngine.vue'), meta: { requiresAuth: true } },
    { path: '/practice/sentence', name: 'SentencePractice', component: () => import('../views/PracticeEngine.vue'), meta: { requiresAuth: true } },
    { path: '/practice/cloze', name: 'ClozePractice', component: () => import('../views/PracticeEngine.vue'), meta: { requiresAuth: true } },
    { path: '/practice/review', name: 'ReviewPractice', component: () => import('../views/PracticeEngine.vue'), meta: { requiresAuth: true } },
    { path: '/errorbook', name: 'ErrorBook', component: () => import('../views/ErrorBook.vue'), meta: { requiresAuth: true } },
    { path: '/ai-generate', name: 'AiGenerate', component: () => import('../views/AiGenerate.vue'), meta: { requiresAuth: true } },
    { path: '/ai-chat', name: 'AiChat', component: () => import('../views/AiChat.vue'), meta: { requiresAuth: true } }
  ]
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) next('/login')
  else if (to.path === '/login' && token) next('/')
  else next()
})

export default router
