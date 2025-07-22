<script setup lang="ts">
import { useAssistantStore } from '../stores/assistant'
import { useConversationStore } from '../stores/conversation'
import { useModelStore } from '../stores/model'
import { useSettingStore } from '../stores/setting'
import { useRouter } from 'vue-router'
import { ref, computed, onMounted } from 'vue'
import { AlertCircle, Brain, Settings, Bot, Plus } from 'lucide-vue-next'

const assistantStore = useAssistantStore()
const conversationStore = useConversationStore()
const modelStore = useModelStore()
const settingStore = useSettingStore()
const router = useRouter()

// 新建对话对话框
const newChatDialog = ref(false)
const newChatTitle = ref('新对话')

// 计算属性：检查是否有模型配置
const hasModels = computed(() => modelStore.models.length > 0)

// 计算属性：检查是否有默认模型
const hasDefaultModel = computed(() => {
  const defaultModelId = settingStore.getSetting('default_model_id')
  return defaultModelId && modelStore.models.some(model => model.id === defaultModelId)
})

// 组件挂载时加载数据
onMounted(async () => {
  await Promise.all([
    modelStore.loadModels(),
    settingStore.loadSettings(),
    assistantStore.loadAssistants()
  ])
})

// 创建新对话
  async function createNewChat() {
    if (!assistantStore.currentAssistantId) {
      // 尝试使用默认模型关联的助手
      const defaultModelId = settingStore.getSetting('default_model_id')
      if (defaultModelId) {
        // 查找使用默认模型的助手
        const assistantWithDefaultModel = assistantStore.assistants.find(a => a.model_id === defaultModelId)
        if (assistantWithDefaultModel) {
          // 设置为当前助手
          await assistantStore.setCurrentAssistant(assistantWithDefaultModel.id)
        } else {
          // 如果没有使用默认模型的助手，提示用户
          alert('请先选择或创建一个助手')
          return
        }
      } else {
        // 如果没有默认模型，提示用户
        alert('请先选择或创建一个助手')
        return
      }
    }
    
    // 确保currentAssistantId不为null
    if (!assistantStore.currentAssistantId) {
      alert('无法创建对话：未选择助手')
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
</script>

<template>
  <div class="home-container">
    <!-- 主要内容区域 -->
    <div class="main-content">
      <!-- 欢迎标题 -->
      <div class="welcome-section">
        <h1 class="welcome-title">欢迎使用 YoChat</h1>
      </div>

      <!-- 状态检查和操作区域 -->
      <div class="action-section">
        <!-- 检查模型配置 -->
        <div v-if="!hasModels" class="status-card warning">
          <div class="status-icon">
            <AlertCircle :size="32" color="rgb(var(--v-theme-warning))" />
          </div>
          <div class="status-content">
            <h3>需要配置模型</h3>
            <p>您还没有配置任何AI模型，请先添加一个模型以开始使用。</p>
            <v-btn
              color="primary"
              variant="elevated"
              to="/models"
              class="action-btn"
            >
              <Brain class="mr-2" :size="20" />
              配置模型
            </v-btn>
          </div>
        </div>
        
        <!-- 检查默认模型 -->
        <div v-else-if="!hasDefaultModel" class="status-card info">
          <div class="status-icon">
            <AlertCircle :size="32" color="rgb(var(--v-theme-info))" />
          </div>
          <div class="status-content">
            <h3>建议设置默认模型</h3>
            <p>设置一个默认模型可以让您更快速地开始对话。</p>
            <v-btn
              color="primary"
              variant="elevated"
              to="/models"
              class="action-btn"
            >
              <Settings class="mr-2" :size="20" />
              设置默认模型
            </v-btn>
          </div>
        </div>
        
        <!-- 检查助手配置 -->
        <div v-else-if="assistantStore.assistants.length === 0" class="status-card info">
          <div class="status-icon">
            <Bot :size="32" color="rgb(var(--v-theme-info))" />
          </div>
          <div class="status-content">
            <h3>需要创建助手</h3>
            <p>创建一个AI助手来个性化您的聊天体验。</p>
            <v-btn
              color="primary"
              variant="elevated"
              to="/assistants"
              class="action-btn"
            >
              <Bot class="mr-2" :size="20" />
              创建助手
            </v-btn>
          </div>
        </div>
        
        <!-- 一切就绪，可以开始对话 -->
        <div v-else class="ready-section">
          <div class="ready-content">
            <h3>一切就绪！</h3>
            <p>现在您可以开始与AI助手进行对话了。</p>
            <v-btn
              color="primary"
              size="x-large"
              variant="elevated"
              @click="newChatDialog = true"
              class="start-chat-btn"
            >
              <Plus class="mr-2" :size="24" />
              开始新对话
            </v-btn>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 新建对话对话框 -->
    <v-dialog v-model="newChatDialog" max-width="500px">
      <v-card>
        <v-card-title class="text-subtitle-1 pb-2">新建对话</v-card-title>
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
  </div>
</template>

<style scoped>
/* 主容器 */
.home-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  padding: 2rem;
}

.main-content {
  max-width: 600px;
  width: 100%;
  text-align: center;
}

/* 欢迎区域 */
.welcome-section {
  margin-bottom: 4rem;
}

.welcome-icon {
  margin-bottom: 2rem;
}

.welcome-title {
  font-size: 2.5rem;
  font-weight: 400;
  color: #2c3e50;
  margin-bottom: 0;
  letter-spacing: -0.01em;
}

/* 操作区域 */
.action-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* 状态卡片 */
.status-card {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 2rem;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #e9ecef;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.status-card:hover {
  border-color: #dee2e6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.status-card.warning {
  border-left: 3px solid #f39c12;
}

.status-card.info {
  border-left: 3px solid #3498db;
}

.status-icon {
  flex-shrink: 0;
  margin-top: 0.25rem;
}

.status-content {
  flex: 1;
  text-align: left;
}

.status-content h3 {
  font-size: 1.2rem;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.status-content p {
  color: #6c757d;
  margin-bottom: 1.5rem;
  line-height: 1.5;
  font-size: 0.95rem;
}

.action-btn {
  border-radius: 6px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  box-shadow: none;
  height: 40px;
}

.action-btn:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 就绪区域 */
.ready-section {
  padding: 3rem 2rem;
  border-radius: 8px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
}

.ready-content h3 {
  font-size: 1.4rem;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 1rem;
}

.ready-content p {
  color: #6c757d;
  margin-bottom: 2rem;
  font-size: 1rem;
  line-height: 1.5;
}

.start-chat-btn {
  border-radius: 6px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  height: 48px;
  font-size: 1rem;
  padding: 0 2rem;
  box-shadow: none;
  transition: all 0.2s ease;
}

.start-chat-btn:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .home-container {
    padding: 1rem;
  }
  
  .welcome-title {
    font-size: 2rem;
  }
  
  .status-card {
    flex-direction: column;
    text-align: center;
    gap: 1rem;
    padding: 1.5rem;
  }
  
  .status-content {
    text-align: center;
  }
  
  .ready-section {
    padding: 2rem 1.5rem;
  }
  
  .start-chat-btn {
    width: 100%;
    height: 44px;
    font-size: 0.95rem;
  }
}

@media (max-width: 480px) {
  .welcome-title {
    font-size: 1.8rem;
  }
  
  .status-card {
    padding: 1rem;
  }
  
  .ready-section {
    padding: 1.5rem 1rem;
  }
}
</style>