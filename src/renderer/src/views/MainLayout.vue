<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useConversationStore } from '../stores/conversation'
import { useAssistantStore } from '../stores/assistant'
import { useSettingStore } from '../stores/setting'
import { useModelStore } from '../stores/model'
import logoIcon from '../assets/icon.png'

const router = useRouter()
const conversationStore = useConversationStore()
const assistantStore = useAssistantStore()
const settingStore = useSettingStore()
const modelStore = useModelStore()

// 侧边栏状态
const sidebarVisible = ref(true)

// 窗口状态
const isMaximized = ref(false)

// 新建对话对话框
const newChatDialog = ref(false)
const newChatTitle = ref('新对话')

// 清空所有对话确认对话框
const clearAllDialog = ref(false)

// 初始化数据
onMounted(async () => {
  // 加载设置
  await settingStore.loadSettings()
  
  // 加载模型列表
  await modelStore.loadModels()
  
  // 加载助手列表
  await assistantStore.loadAssistants()
  
  // 加载对话列表
  await conversationStore.loadConversations()
  
  // 检查应用状态并决定跳转
  if (modelStore.models.length === 0) {
    // 如果没有模型配置，优先跳转到模型配置页面
    router.push('/models')
  } else if (assistantStore.assistants.length === 0) {
    // 如果有模型但没有助手，跳转到助手设置页面
    router.push('/assistants')
  } else if (router.currentRoute.value.path === '/') {
    // 如果在首页，保持在首页，让用户看到欢迎界面
    // 不做任何跳转
  }
  
  // 初始化窗口状态
  await checkMaximized()
  
  // 添加窗口状态变化监听
  window.addEventListener('resize', checkMaximized)
})


// 组件卸载前移除事件监听
onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMaximized)
})

// 创建新对话
async function createNewChat() {
  // 检查是否有模型配置
  if (modelStore.models.length === 0) {
    alert('请先配置至少一个AI模型')
    newChatDialog.value = false
    router.push('/models')
    return
  }
  
  // 检查是否有选择助手
  if (!assistantStore.currentAssistantId) {
    alert('请先选择或创建一个助手')
    return
  }
  
  const id = await conversationStore.createConversation(
    newChatTitle.value,
    assistantStore.currentAssistantId
  )
  
  if (id) {
    newChatDialog.value = false
    newChatTitle.value = '新对话'
    router.push(`/chat/${id}`)
  }
}

// 选择对话
function selectConversation(id: number) {
  router.push(`/chat/${id}`)
}

// 清空所有对话
async function clearAllConversations() {
  try {
    await window.api.invoke('clear-all-conversations')
    await conversationStore.loadConversations()
    clearAllDialog.value = false
    // 如果当前在聊天页面，跳转到首页
    if (router.currentRoute.value.path.startsWith('/chat/')) {
      router.push('/')
    }
  } catch (error) {
    console.error('清空所有对话失败:', error)
    alert('清空所有对话失败，请重试')
  }
}

// 窗口控制函数
function minimizeWindow() {
  window.api.window.minimize()
}

function toggleMaximize() {
  if (isMaximized.value) {
    window.api.window.unmaximize()
  } else {
    window.api.window.maximize()
  }
}

function closeWindow() {
  window.api.window.close()
}

// 检查窗口是否最大化
async function checkMaximized() {
  isMaximized.value = await window.api.window.isMaximized()
}

// 监听主题变化
watch(
  () => settingStore.getSetting('theme'),
  (newTheme) => {
    document.documentElement.setAttribute('data-theme', newTheme)
  },
  { immediate: true }
)
</script>

<template>
  <v-app :theme="settingStore.getSetting('theme')">
    <!-- 自定义窗口标题栏 -->
    <div class="custom-titlebar">
      <div class="titlebar-left">
        <!-- 侧边栏切换按钮 -->
        <v-btn 
          icon 
          size="small" 
          variant="text" 
          @click="sidebarVisible = !sidebarVisible"
          class="sidebar-toggle-btn"
        >
          <v-icon>{{ sidebarVisible ? 'mdi-menu-open' : 'mdi-menu' }}</v-icon>
        </v-btn>
        
        <!-- LOGO区域 -->
        <div class="logo-section" v-if="!sidebarVisible">
          <!-- <v-icon color="primary" class="mr-2">mdi-chat</v-icon> -->
          <img class="mr-2 logo-img" :src="logoIcon" />
          <span class="logo-text">YoChat</span>
        </div>
      </div>
      
      <div class="drag-region"></div>
      
      <div class="window-controls">
        <v-btn icon size="small" variant="text" @click="minimizeWindow">
          <v-icon>mdi-window-minimize</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="text" @click="toggleMaximize">
          <v-icon>{{ isMaximized ? 'mdi-window-restore' : 'mdi-window-maximize' }}</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="text" @click="closeWindow">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
    </div>

    <div class="app-content">
      <!-- 自定义侧边栏 -->
      <div v-show="sidebarVisible" class="custom-sidebar">
        <!-- LOGO区域 -->
        <div class="sidebar-header">
          <div class="logo-section">
            <!-- <v-icon color="primary" class="mr-2">mdi-chat</v-icon> -->
            <v-img class="mr-2 logo-img" :src="logoIcon" />
            <div class="logo-info">
              <div class="logo-title">YoChat</div>
            </div>
          </div>
        </div>
        
        <v-divider></v-divider>

        <!-- 新建对话按钮 -->
        <div class="pa-2">
          <v-btn 
            block 
            color="primary"
            rounded
            @click="newChatDialog = true" 
            prepend-icon="mdi-plus" 
            class="new-chat-btn"
          >
            新建对话
          </v-btn>
        </div>

        <v-divider></v-divider>

        <!-- 对话列表标题栏 -->
        <div class="conversation-header">
          <span class="conversation-title">对话列表</span>
          <v-btn
            icon
            size="small"
            variant="text"
            @click="clearAllDialog = true"
            class="clear-all-btn"
            title="清空所有对话"
          >
            <v-icon>mdi-delete-sweep</v-icon>
          </v-btn>
        </div>

        <!-- 对话列表 -->
        <div class="conversation-list-container">
          <v-list density="compact" nav class="conversation-list">
            <v-list-item
              v-for="conversation in conversationStore.conversations"
              :key="conversation.id"
              :title="conversation.title"
              :value="conversation.id"
              :active="conversationStore.currentConversationId === conversation.id"
              @click="selectConversation(conversation.id)"
              prepend-icon="mdi-chat"
              class="text-body-2"
              lines="one"
            ></v-list-item>
          </v-list>
        </div>

        <!-- 底部菜单 -->
        <div class="sidebar-footer">
          <v-divider></v-divider>
          <v-list>
            <v-list-item
              prepend-icon="mdi-brain"
              title="模型管理"
              @click="router.push('/models')"
              class="sidebar-menu-item"
            ></v-list-item>
            <v-list-item
              prepend-icon="mdi-robot"
              title="助手管理"
              @click="router.push('/assistants')"
              class="sidebar-menu-item"
            ></v-list-item>
            <v-list-item
              prepend-icon="mdi-cog"
              title="设置"
              @click="router.push('/settings')"
              class="sidebar-menu-item"
            ></v-list-item>
          </v-list>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="main-content" :class="{ 'sidebar-hidden': !sidebarVisible }">
        <router-view></router-view>
      </div>
    </div>

    <!-- 新建对话对话框 -->
    <v-dialog v-model="newChatDialog" max-width="450px">
      <v-card>
        <v-card-title class="text-subtitle-1">新建对话</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newChatTitle"
            label="对话标题"
            required
            density="compact"
            variant="outlined"
            class="mb-3"
          ></v-text-field>
          
          <v-select
            v-model="assistantStore.currentAssistantId"
            :items="assistantStore.assistants"
            item-title="name"
            item-value="id"
            label="选择助手"
            required
            density="compact"
            variant="outlined"
          ></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="text" size="small" @click="newChatDialog = false">取消</v-btn>
          <v-btn color="primary" size="small" @click="createNewChat">创建</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 清空所有对话确认对话框 -->
    <v-dialog v-model="clearAllDialog" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
          确认清空所有对话
        </v-card-title>
        <v-card-text>
          <p class="mb-3">此操作将永久删除所有对话记录，包括所有消息内容。</p>
          <v-alert type="warning" variant="tonal" class="mb-0">
            <strong>注意：</strong>此操作不可撤销，请谨慎操作！
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" variant="text" size="small" @click="clearAllDialog = false">取消</v-btn>
          <v-btn color="error" size="small" @click="clearAllConversations">确认清空</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<style scoped>
/* 自定义标题栏 */
.custom-titlebar {
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--v-theme-surface);
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 100;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.titlebar-left {
  display: flex;
  align-items: center;
  height: 100%;
}

.sidebar-toggle-btn {
  border-radius: 0;
  height: 45px;
  width: 45px;
  min-width: 45px;
}

.logo-section {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 100%;
}

.logo-img {
  width: 30px;
  height: 30px;
}

.logo-text {
  font-weight: 600;
  font-size: 14px;
  color: var(--v-theme-primary);
}

.drag-region {
  position: absolute;
  top: 0;
  left: 45px;
  right: 100px;
  height: 100%;
  -webkit-app-region: drag;
}

.window-controls {
  display: flex;
  align-items: center;
}

.window-controls .v-btn {
  border-radius: 0;
  height: 32px;
  width: 32px;
  min-width: 32px;
}

/* 应用内容布局 */
.app-content {
  display: flex;
  height: calc(100vh - 32px);
}

/* 自定义侧边栏 */
.custom-sidebar {
  width: 220px;
  background-color: var(--v-theme-surface);
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  min-height: 56px;
}

.logo-info {
  display: flex;
  flex-direction: column;
}

.logo-title {
  font-weight: 600;
  font-size: 16px;
  line-height: 1.2;
}

.logo-subtitle {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.2;
}

.sidebar-close-btn {
  border-radius: 4px;
  height: 32px;
  width: 32px;
  min-width: 32px;
}

.conversation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: rgba(var(--v-theme-on-surface), 0.02);
}

.conversation-title {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.clear-all-btn {
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.clear-all-btn:hover {
  opacity: 1;
}

.conversation-list-container {
  flex: 1;
  overflow: hidden;
}

.conversation-list {
  height: 100%;
  overflow-y: auto;
}

.sidebar-footer {
  margin-top: auto;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  height: 100%;
  overflow: hidden;
}

.main-content.sidebar-hidden {
  width: 100%;
}

/* 自定义样式 */
.v-list-item-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.new-chat-btn {
  border-radius: 8px;
  font-weight: 500;
}

.sidebar-menu-item {
  border-radius: 8px;
  margin: 4px 8px;
  transition: background-color 0.2s ease;
}

.sidebar-menu-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.1);
}

/* 适配小屏幕 */
@media (max-width: 600px) {
  .custom-sidebar {
    width: 220px;
  }
  
  .v-list-item-title {
    max-width: 160px;
  }
}</style>