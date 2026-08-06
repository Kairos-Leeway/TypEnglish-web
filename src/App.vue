<script setup lang="ts">
</script>

<template>
  <router-view />
</template>

<style>
body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: linear-gradient(135deg, #f0f4ff 0%, #f8fafc 30%, #f5f0ff 70%, #f0f4ff 100%);
  background-attachment: fixed;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
/* 全局滚动条美化 */
::-webkit-scrollbar { width: 6px }
::-webkit-scrollbar-track { background: transparent }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px }
::-webkit-scrollbar-thumb:hover { background: #94a3b8 }
</style>
