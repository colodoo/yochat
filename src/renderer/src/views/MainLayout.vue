<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useConversationStore } from '../stores/conversation'
import { useAssistantStore } from '../stores/assistant'
import { useSettingStore } from '../stores/setting'
import { useModelStore } from '../stores/model'
import logoIcon from '../assets/icon.png'
import { Menu, PanelLeftClose, Plus, Trash2, MessageCircle, Brain, Bot, Settings, Edit3, AlertTriangle } from 'lucide-vue-next'

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

// 右键菜单相关
const contextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const selectedConversation = ref<any>(null)

// 重命名对话框
const renameDialog = ref(false)
const renameTitle = ref('')

// 确认对话框
const confirmDialog = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmAction = ref<(() => void) | null>(null)

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

// 显示右键菜单
function showContextMenu(e: MouseEvent, conversation: any) {
  e.preventDefault()
  selectedConversation.value = conversation
  contextMenuX.value = e.clientX
  contextMenuY.value = e.clientY
  contextMenu.value = true
}

// 重命名对话
function openRenameDialog() {
  if (selectedConversation.value) {
    renameTitle.value = selectedConversation.value.title
    renameDialog.value = true
  }
  contextMenu.value = false
}

async function confirmRename() {
  if (selectedConversation.value && renameTitle.value.trim()) {
    try {
      await conversationStore.updateConversationTitle(selectedConversation.value.id, renameTitle.value.trim())
      renameDialog.value = false
      renameTitle.value = ''
    } catch (error) {
      console.error('重命名失败:', error)
      alert('重命名失败，请重试')
    }
  }
}

// 清空对话消息
function clearConversationMessages() {
  if (selectedConversation.value) {
    showConfirmDialog(
      '清空消息',
      `确定要清空对话"${selectedConversation.value.title}"的所有消息吗？`,
      async () => {
        try {
          await window.api.invoke('clear-conversation-messages', selectedConversation.value.id)
          // 如果当前在该对话页面，重新加载消息
          if (router.currentRoute.value.path === `/chat/${selectedConversation.value.id}`) {
            await conversationStore.loadMessages(selectedConversation.value.id)
          }
        } catch (error) {
          console.error('清空消息失败:', error)
          alert('清空消息失败，请重试')
        }
      }
    )
  }
  contextMenu.value = false
}

// 删除对话
function deleteConversation() {
  if (selectedConversation.value) {
    showConfirmDialog(
      '删除对话',
      `确定要删除对话"${selectedConversation.value.title}"吗？此操作不可撤销。`,
      async () => {
        try {
          await conversationStore.deleteConversation(selectedConversation.value.id)
          // 如果当前在该对话页面，跳转到首页
          if (router.currentRoute.value.path === `/chat/${selectedConversation.value.id}`) {
            router.push('/')
          }
        } catch (error) {
          console.error('删除对话失败:', error)
          alert('删除对话失败，请重试')
        }
      }
    )
  }
  contextMenu.value = false
}

// 显示确认对话框
function showConfirmDialog(title: string, message: string, action: () => void) {
  confirmTitle.value = title
  confirmMessage.value = message
  confirmAction.value = action
  confirmDialog.value = true
}

// 执行确认操作
function executeConfirmAction() {
  if (confirmAction.value) {
    confirmAction.value()
  }
  confirmDialog.value = false
  confirmAction.value = null
}

// 取消确认操作
function cancelConfirmAction() {
  confirmDialog.value = false
  confirmAction.value = null
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

// 按日期分组对话
const groupedConversations = computed(() => {
  const groups: { [key: string]: any[] } = {}
  
  conversationStore.conversations.forEach(conversation => {
    const date = new Date(conversation.created_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    let groupKey: string
    
    if (date.toDateString() === today.toDateString()) {
      groupKey = '今天'
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = '昨天'
    } else {
      const diffTime = today.getTime() - date.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      
      if (diffDays <= 7) {
        groupKey = '本周'
      } else if (diffDays <= 30) {
        groupKey = '本月'
      } else {
        groupKey = date.getFullYear() + '年' + (date.getMonth() + 1) + '月'
      }
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(conversation)
  })
  
  // 按时间排序分组
  const sortedGroups = Object.keys(groups).sort((a, b) => {
    const order = ['今天', '昨天', '本周', '本月']
    const aIndex = order.indexOf(a)
    const bIndex = order.indexOf(b)
    
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex
    } else if (aIndex !== -1) {
      return -1
    } else if (bIndex !== -1) {
      return 1
    } else {
      return b.localeCompare(a)
    }
  })
  
  return sortedGroups.map(key => ({
    title: key,
    conversations: groups[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }))
})
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
          <component :is="sidebarVisible ? PanelLeftClose : Menu" :size="20" />
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
        <v-btn icon variant="text" @click="minimizeWindow" class="window-control-btn">
          <v-icon>mdi-minus</v-icon>
        </v-btn>
        <v-btn icon variant="text" @click="toggleMaximize" class="window-control-btn">
          <v-icon>{{ isMaximized ? 'mdi-window-restore' : 'mdi-window-maximize' }}</v-icon>
        </v-btn>
        <v-btn icon variant="text" @click="closeWindow" class="window-control-btn close-btn">
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
            :prepend-icon="false" 
            class="new-chat-btn"
          >
            <Plus class="mr-2" :size="20" />
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
            <Trash2 :size="16" />
          </v-btn>
        </div>

        <!-- 对话列表 -->
        <div class="conversation-list-container">
          <div class="conversation-list">
            <template v-for="group in groupedConversations" :key="group.title">
              <!-- 日期分组标题 -->
              <div class="date-group-header">
                <span class="date-group-title">{{ group.title }}</span>
              </div>
              
              <!-- 该分组下的对话列表 -->
              <v-list density="compact" nav class="group-conversation-list">
                <v-list-item
                  v-for="conversation in group.conversations"
                  :key="conversation.id"
                  :title="conversation.title"
                  :value="conversation.id"
                  :active="conversationStore.currentConversationId === conversation.id"
                  @click="selectConversation(conversation.id)"
                  @contextmenu="showContextMenu($event, conversation)"
                  :prepend-icon="false"
                  class="text-body-2 conversation-item"
                >
                  <template v-slot:prepend>
                    <MessageCircle class="mr-3" :size="16" />
                  </template
                  lines="one"
                ></v-list-item>
              </v-list>
            </template>
          </div>
        </div>

        <!-- 底部菜单 -->
        <div class="sidebar-footer">
          <v-divider></v-divider>
          <v-list>
              <v-list-item
                :prepend-icon="false"
                title="模型管理"
                @click="router.push('/models')"
                class="sidebar-menu-item"
              >
                <template v-slot:prepend>
                  <Brain class="mr-3" :size="16" />
                </template>
              </v-list-item>
              <v-list-item
                :prepend-icon="false"
                title="助手管理"
                @click="router.push('/assistants')"
                class="sidebar-menu-item"
              >
                <template v-slot:prepend>
                  <Bot class="mr-3" :size="16" />
                </template>
              </v-list-item>
              <v-list-item
                :prepend-icon="false"
                title="设置"
                @click="router.push('/settings')"
                class="sidebar-menu-item"
              >
                <template v-slot:prepend>
                  <Settings class="mr-3" :size="16" />
                </template>
              </v-list-item>
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
          <AlertTriangle color="rgb(var(--v-theme-warning))" class="mr-2" :size="20" />
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

    <!-- 右键菜单 -->
    <v-menu
      v-model="contextMenu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      absolute
      offset-y
    >
      <v-list density="compact">
        <v-list-item @click="openRenameDialog" density="compact">
          <template v-slot:prepend>
            <Edit3 :size="16" />
          </template>
          <v-list-item-title class="text-body-2">重命名</v-list-item-title>
        </v-list-item>
        <v-list-item @click="clearConversationMessages" density="compact">
          <template v-slot:prepend>
            <Trash2 :size="16" />
          </template>
          <v-list-item-title class="text-body-2">清空消息</v-list-item-title>
        </v-list-item>
        <v-list-item @click="deleteConversation" density="compact">
          <template v-slot:prepend>
            <Trash2 :size="16" color="rgb(var(--v-theme-error))" />
          </template>
          <v-list-item-title class="text-body-2 text-error">删除对话</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- 重命名对话框 -->
    <v-dialog v-model="renameDialog" max-width="450px">
      <v-card>
        <v-card-title class="text-subtitle-1">重命名对话</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="renameTitle"
            label="对话标题"
            required
            density="compact"
            variant="outlined"
            class="mb-3"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="text" size="small" @click="renameDialog = false">取消</v-btn>
          <v-btn color="primary" size="small" @click="confirmRename">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 确认对话框 -->
    <v-dialog v-model="confirmDialog" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center">
          <AlertTriangle color="rgb(var(--v-theme-warning))" class="mr-2" :size="20" />
          {{ confirmTitle }}
        </v-card-title>
        <v-card-text>
          <p class="mb-0">{{ confirmMessage }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" variant="text" size="small" @click="cancelConfirmAction">取消</v-btn>
          <v-btn color="error" size="small" @click="executeConfirmAction">确认</v-btn>
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
  right: 135px;
  height: 100%;
  -webkit-app-region: drag;
}

.window-controls {
  display: flex;
  align-items: center;
}

.window-controls .v-btn {
  border-radius: 0;
  height: 45px;
  width: 45px;
  min-width: 45px;
}

.window-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.window-control-btn:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.close-btn:hover {
  background-color: #e81123 !important;
  color: white !important;
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

/* 日期分组样式 */
.date-group-header {
  padding: 8px 16px 4px 16px;
  background-color: rgba(var(--v-theme-on-surface), 0.02);
}

.date-group-title {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.group-conversation-list {
  margin-bottom: 8px;
}

.conversation-item {
  transition: background-color 0.2s ease;
}

.conversation-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.08);
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