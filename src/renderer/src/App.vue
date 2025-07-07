<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useSettingStore } from './stores/setting'
import { onMounted, watch, onUnmounted } from 'vue'

const route = useRoute()
const router = useRouter()
const settingStore = useSettingStore()

// 监听路由变化，设置页面标题
watch(() => route.name, (newName) => {
  if (newName) {
    document.title = `YoChat - ${String(newName)}`
  } else {
    document.title = 'YoChat'
  }
})

// 初始化应用
onMounted(async () => {
  // 加载设置并应用主题
  await settingStore.loadSettings()
  const themeMode = settingStore.getSetting('theme') || 'light'
  settingStore.toggleTheme(themeMode)
  
  // 应用字体大小设置
  applyFontSize()
  
  // 监听导航事件
  navigationRemoveListener = window.api.navigation.onNavigateTo((route) => {
    router.push(route)
  })
})

// 导航监听器清理函数
let navigationRemoveListener: (() => void) | null = null

// 组件卸载时清理监听器
onUnmounted(() => {
  if (navigationRemoveListener) {
    navigationRemoveListener()
    navigationRemoveListener = null
  }
})

// 应用字体大小设置
function applyFontSize() {
  const fontSize = settingStore.getSetting('font_size') || 'medium'
  document.documentElement.setAttribute('data-font-size', fontSize)
}
</script>

<template>
  <v-app>
    <router-view />
  </v-app>
</template>

<style>
/* 全局样式 */
html, body {
  overflow: hidden;
  margin: 0;
  padding: 0;
  height: 100%;
  user-select: none; /* 防止文本被选中 */
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 深色模式下的滚动条 */
.v-theme--dark ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.v-theme--dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
