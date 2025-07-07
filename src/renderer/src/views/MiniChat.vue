<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConversationStore } from '../stores/conversation'
import { useAssistantStore } from '../stores/assistant'
import { useModelStore } from '../stores/model'
import { useMcpStore } from '../stores/mcp'

const router = useRouter()
const conversationStore = useConversationStore()
const assistantStore = useAssistantStore()
const modelStore = useModelStore()
const mcpStore = useMcpStore()

// 消息输入
const messageInput = ref('')
const sending = ref(false)

// 模型参数设置
const modelSettingsDialog = ref(false)
const temperature = ref(0.7)
const maxTokens = ref(2000)

// MCP服务相关
const mcpServicesDialog = ref(false)
const selectedMcpServices = ref<string[]>([])
const mcpCallProgress = ref<any>(null)
const mcpCallResult = ref<any>(null)
const showMcpResult = ref(false)
const showMcpProgress = computed({
  get: () => mcpCallProgress.value !== null,
  set: (value) => {
    if (!value) mcpCallProgress.value = null
  }
})

// 临时存储MCP服务选择（用于对话框中的选择状态）
const tempSelectedMcpServices = ref<string[]>([])

// 监听当前对话变化，加载对话的MCP服务选择
watch(() => conversationStore.currentConversationId, async (newConversationId) => {
  if (newConversationId && conversationStore.currentConversation) {
    // 加载对话的temperature、maxTokens和MCP服务设置
    temperature.value = conversationStore.currentConversation.temperature || 0.7
    maxTokens.value = conversationStore.currentConversation.max_tokens || 2000
    
    // 加载对话的MCP服务选择
    const mcpServices = conversationStore.currentConversation.mcp_services
  if (typeof mcpServices === 'string') {
    try {
      selectedMcpServices.value = JSON.parse(mcpServices)
    } catch (e) {
      console.warn('解析MCP服务失败:', e)
      selectedMcpServices.value = []
    }
  } else {
    selectedMcpServices.value = mcpServices || []
  }
  } else {
    // 如果没有当前对话，清空MCP服务选择
    selectedMcpServices.value = []
  }
}, { immediate: true })

// 初始化数据
onMounted(async () => {
  // 加载助手和对话
  await assistantStore.loadAssistants()
  await conversationStore.loadConversations()
  
  // 加载模型列表
  await modelStore.loadModels()
  
  // 加载MCP服务列表
  await mcpStore.loadMcpServices()
  
  // 如果有当前对话，获取对话的temperature、maxTokens和MCP服务设置
  if (conversationStore.currentConversation) {
    temperature.value = conversationStore.currentConversation.temperature || 0.7
    maxTokens.value = conversationStore.currentConversation.max_tokens || 2000
    const mcpServices = conversationStore.currentConversation.mcp_services
    if (typeof mcpServices === 'string') {
      try {
        selectedMcpServices.value = JSON.parse(mcpServices)
      } catch (e) {
        console.warn('解析MCP服务失败:', e)
        selectedMcpServices.value = []
      }
    } else {
      selectedMcpServices.value = mcpServices || []
    }
  }
})

// 计算属性：获取当前选中的助手
const currentAssistant = computed(() => assistantStore.currentAssistant)

// 流式响应内容
const streamingResponse = ref('')
const isStreaming = ref(false)
const currentStreamingMessageId = ref<string | null>(null)



// 注册流式响应事件监听器
onMounted(() => {
  // 注册流式响应事件
  const removeStreamListener = window.api.ai.onStreamResponse((data) => {
    // 检查是否是当前对话的事件
    if (data.conversationId && data.conversationId !== conversationStore.currentConversationId) {
      return; // 不是当前对话的事件，忽略
    }
    
    const text = data.text || data; // 兼容旧格式
    streamingResponse.value = text
    
    // Agent状态信息现在直接显示在对话中，不需要特殊处理
  })
  
  // 注册流式响应完成事件
  const removeDoneListener = window.api.ai.onStreamDone(async (data) => {
    // 检查是否是当前对话的事件
    if (data && data.conversationId && data.conversationId !== conversationStore.currentConversationId) {
      return; // 不是当前对话的事件，忽略
    }
    
    // 流式响应完成，将最终内容添加到对话中
    // 注意：主进程已经将最终内容添加到数据库，这里不需要再次添加
    // 只需要更新UI状态
    streamingResponse.value = ''
    isStreaming.value = false
    sending.value = false
    
    // 隐藏迷你窗口
    window.electron.ipcRenderer.send('hide-mini-window')
  })
  
  // 监听MCP服务调用事件
  window.api.mcp.onCallProgress((progress) => {
    mcpCallProgress.value = progress
  })
  
  window.api.mcp.onCallDone((result) => {
    mcpCallProgress.value = null
    mcpCallResult.value = result
    showMcpResult.value = true
  })
  
  window.api.mcp.onCallError((error) => {
    mcpCallProgress.value = null
    console.error('MCP服务调用失败:', error)
    // 可以添加错误提示
  })
  
  // 组件卸载时移除事件监听器
  return () => {
    removeStreamListener()
    removeDoneListener()
    // MCP事件监听器会在组件卸载时自动清理
  }
})

// 发送消息
async function sendMessage() {
  if (!messageInput.value.trim() || sending.value) return
  
  const userMessage = messageInput.value.trim()
  messageInput.value = ''
  sending.value = true

  
  try {
    // 如果没有当前对话或当前助手，则创建一个新对话
    if (!conversationStore.currentConversationId || !currentAssistant.value) {
      if (!currentAssistant.value) {
        // 如果没有助手，跳转到主窗口的助手页面
        window.electron.ipcRenderer.send('show-main-window')
        router.push('/assistants')
        return
      }
      
      // 创建新对话，使用消息前20个字符作为标题
      const title = userMessage.length > 20 
        ? userMessage.substring(0, 20) + '...' 
        : userMessage
      
      const id = await conversationStore.createConversation(title, currentAssistant.value.id)
      if (id) {
        await conversationStore.loadMessages(id)
      } else {
        sending.value = false
        return
      }
    }
    
    // 添加用户消息
    await conversationStore.addMessage('user', userMessage)
    
    // 获取当前助手信息
    const assistant = currentAssistant.value
    if (!assistant) {
      throw new Error('未选择助手')
    }
    
    try {
      // 获取对话历史记录用于上下文
      const messages = conversationStore.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      
      console.log(`调用助手API: ${assistant.id}, 消息数量: ${messages.length}`)
      
      // 重置流式响应状态
      streamingResponse.value = ''
      isStreaming.value = true
      
      // 创建临时消息用于显示流式响应
      // 注意：这里创建的临时消息会在主进程完成流式响应后被替换
      // 不要使用conversationStore.addMessage，因为它会在数据库中添加一条记录
      // 而是直接在前端添加一个临时消息对象
      const tempMessage = {
        id: 'temp-' + Date.now(),
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString()
      }
      conversationStore.messages.push(tempMessage)
      currentStreamingMessageId.value = tempMessage.id.toString()
      
      // 设置流式响应监听器更新临时消息
      const updateInterval = setInterval(() => {
        if (streamingResponse.value && isStreaming.value) {
          conversationStore.updateMessage(tempMessage.id, streamingResponse.value)
        } else if (!isStreaming.value) {
          clearInterval(updateInterval)
        }
      }, 100) // 每100ms更新一次UI
      
      // 获取不包含临时消息的历史记录用于API调用
      // 临时消息不应该被发送到API
      const apiMessages = conversationStore.messages
        .filter(msg => !msg.id.toString().startsWith('temp-'))
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      
      // 准备选中的MCP服务信息
      const selectedServices = selectedMcpServices.value.length > 0 
        ? mcpStore.mcpServices
            .filter(service => selectedMcpServices.value.includes(service.id))
            .map(service => ({
              id: service.id,
              name: service.name,
              type: service.type,
              command: service.command,
              args: service.args,
              request_url: service.request_url,
              request_headers: service.request_headers
            }))
        : []
      
      // 通过IPC调用主进程的API请求，传递temperature、maxTokens和选中的MCP服务参数
      await window.api.ai.callApi(
        assistant.id, 
        apiMessages, 
        conversationStore.currentConversationId || undefined, 
        temperature.value, 
        maxTokens.value,
        selectedServices
      )
      
      // 清除更新间隔
      clearInterval(updateInterval)
      currentStreamingMessageId.value = null
      
      // 注意：不再清空已选择的MCP服务，让它们在对话中持续有效
    } catch (apiError) {
      console.error('API调用失败:', apiError)
      // 添加错误提示作为系统消息
      await conversationStore.addMessage('system', `错误: 调用AI服务失败: ${(apiError as Error).message || '未知错误'}`)
      isStreaming.value = false
      sending.value = false
      currentStreamingMessageId.value = null
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    isStreaming.value = false
    sending.value = false
    currentStreamingMessageId.value = null
  }
}

// 打开主窗口
function openMainWindow() {
  window.electron.ipcRenderer.send('show-main-window')
  if (conversationStore.currentConversationId) {
    router.push(`/chat/${conversationStore.currentConversationId}`)
  } else {
    router.push('/')
  }
}

// 关闭迷你窗口
function closeMiniWindow() {
  window.electron.ipcRenderer.send('hide-mini-window')
}

// MCP服务相关函数
const openMcpServicesDialog = () => {
  // 将当前选择的MCP服务复制到临时变量中
  tempSelectedMcpServices.value = [...selectedMcpServices.value]
  mcpServicesDialog.value = true
}

// 确认保存MCP服务选择
async function confirmMcpServicesSelection() {
  try {
    console.log('MiniChat.vue: 确认保存MCP服务选择:', tempSelectedMcpServices.value)
    
    if (conversationStore.currentConversationId) {
      // 更新实际的选择状态
      selectedMcpServices.value = [...tempSelectedMcpServices.value]
      
      // 转换为普通数组以避免IPC序列化问题
      const mcpServicesArray = [...selectedMcpServices.value]
      
      // 保存到数据库
      console.log('MiniChat.vue: 更新对话', conversationStore.currentConversationId, '的MCP服务:', mcpServicesArray)
      await conversationStore.updateConversation(conversationStore.currentConversationId, {
        mcpServices: mcpServicesArray
      })
      
      console.log('MiniChat.vue: MCP服务选择保存成功')
    }
    
    mcpServicesDialog.value = false
  } catch (error) {
    console.error('保存MCP服务选择失败:', error)
  }
}

// 取消MCP服务选择
function cancelMcpServicesSelection() {
  // 恢复临时选择状态
  tempSelectedMcpServices.value = [...selectedMcpServices.value]
  mcpServicesDialog.value = false
}

const callSelectedMcpServices = async () => {
  if (selectedMcpServices.value.length === 0) return
  
  for (const serviceId of selectedMcpServices.value) {
    try {
      await mcpStore.callMcpService(serviceId, 'test', {})
    } catch (error) {
      console.error('调用MCP服务失败:', error)
    }
  }
}

const closeMcpResult = () => {
  showMcpResult.value = false
  mcpCallResult.value = null
}

const insertMcpResult = () => {
  if (mcpCallResult.value) {
    const resultText = typeof mcpCallResult.value.result === 'string' 
      ? mcpCallResult.value.result 
      : JSON.stringify(mcpCallResult.value.result, null, 2)
    
    messageInput.value += `\n\n工具调用结果:\n${resultText}`
  }
  closeMcpResult()
}

// 打开模型参数设置对话框
function openModelSettingsDialog() {
  modelSettingsDialog.value = true
}

// 更新模型参数设置
async function updateModelSettings() {
  if (conversationStore.currentConversationId) {
    await conversationStore.updateConversation(conversationStore.currentConversationId, {
      temperature: temperature.value,
      maxTokens: maxTokens.value
    })
    modelSettingsDialog.value = false
  }
}

// 强制停止对话生成
function stopGeneration() {
  if (isStreaming.value && currentStreamingMessageId.value) {
    isStreaming.value = false
    sending.value = false
    // 添加一个系统消息，表示对话被用户中断
    conversationStore.addMessage('system', '对话生成已被用户中断')
  }
}

// API调用已迁移到主进程中
</script>

<template>
  <div class="mini-chat-container">
    <div class="mini-chat-header">
      <div class="assistant-info" v-if="currentAssistant">
        <v-avatar color="secondary" size="24">
          <v-icon size="small">mdi-robot</v-icon>
        </v-avatar>
        <span class="assistant-name">{{ currentAssistant.name }}</span>
      </div>
      <div class="mini-actions">
        <v-btn icon size="small" @click="openModelSettingsDialog" title="调整参数">
          <v-icon>mdi-tune</v-icon>
        </v-btn>
        <v-btn icon size="small" @click="openMainWindow" title="打开主窗口">
          <v-icon>mdi-open-in-new</v-icon>
        </v-btn>
        <v-btn icon size="small" @click="closeMiniWindow" title="关闭">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
    </div>
    

    
    <div class="mini-chat-input">
      <!-- 工具选择区域 -->
      <div class="input-actions">
        <v-btn
          color="primary"
          variant="outlined"
          size="small"
          prepend-icon="mdi-tools"
          @click="openMcpServicesDialog"
        >
          选择工具
        </v-btn>
        
        <v-chip
          v-if="selectedMcpServices.length > 0"
          size="small"
          color="primary"
          variant="tonal"
        >
          已选 {{ selectedMcpServices.length }} 个工具
        </v-chip>
        
        <v-btn
          v-if="selectedMcpServices.length > 0"
          color="secondary"
          variant="outlined"
          size="small"
          prepend-icon="mdi-play"
          @click="callSelectedMcpServices"
          class="tool-button"
        >
          运行工具
        </v-btn>
      </div>
      
      <v-text-field
        v-model="messageInput"
        placeholder="输入快速消息..."
        variant="outlined"
        density="compact"
        hide-details
        @keydown.enter.prevent="sendMessage"
        :disabled="sending"
        autofocus
      >
        <template v-slot:append>
          <v-btn 
            v-if="!isStreaming"
            icon 
            size="small" 
            color="primary" 
            @click="sendMessage"
            :disabled="!messageInput.trim() || sending"
            :loading="sending"
          >
            <v-icon>mdi-send</v-icon>
          </v-btn>
          <v-btn
            v-else
            icon
            size="small"
            color="error"
            @click="stopGeneration"
          >
            <v-icon>mdi-stop</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </div>
  </div>
  
  <!-- 模型参数设置对话框 -->
  <v-dialog v-model="modelSettingsDialog" max-width="450px">
    <v-card>
      <v-card-title class="text-subtitle-1">调整模型参数</v-card-title>
      <v-card-text>
        <v-container>
          <v-row>
            <v-col cols="12">
              <v-slider
                v-model="temperature"
                label="温度"
                min="0"
                max="2"
                step="0.1"
                thumb-label
                hint="控制输出的随机性 (0-2)，较高的值会使输出更加随机和创造性"
                persistent-hint
              ></v-slider>
            </v-col>
            
            <v-col cols="12">
              <v-text-field
                v-model.number="maxTokens"
                label="最大令牌数"
                type="number"
                hint="生成文本的最大长度，较大的值允许生成更长的回复"
                persistent-hint
                :rules="[
                  v => !!v || '最大令牌数不能为空',
                  v => v > 0 || '最大令牌数必须大于0'
                ]"
              ></v-text-field>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="text" size="small" @click="modelSettingsDialog = false">取消</v-btn>
        <v-btn color="primary" size="small" @click="updateModelSettings">应用</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  
  <!-- MCP服务选择对话框 -->
  <v-dialog v-model="mcpServicesDialog" max-width="600px">
    <v-card>
      <v-card-title class="text-subtitle-1">选择工具服务</v-card-title>
      <v-card-text>
        <v-container>
          <template v-if="mcpStore.mcpServices.length === 0">
            <v-alert type="info" variant="tonal" density="compact">
              暂无可用的MCP服务，请先在设置中添加服务。
            </v-alert>
          </template>
          <template v-else>
            <v-row>
              <v-col cols="12">
                <v-list density="compact">
                  <v-list-item
                    v-for="service in mcpStore.mcpServices"
                    :key="service.id"
                    density="compact"
                  >
                    <template v-slot:prepend>
                        <v-checkbox
                          v-model="tempSelectedMcpServices"
                          :value="service.id"
                          density="compact"
                        ></v-checkbox>
                      </template>
                    
                    <v-list-item-title class="text-body-2">{{ service.name }}</v-list-item-title>
                    <v-list-item-subtitle class="text-caption">
                      {{ service.type === 'stdio' ? '命令行服务' : 'HTTP服务' }}
                    </v-list-item-subtitle>
                    
                    <template v-slot:append>
                      <v-chip
                        size="x-small"
                        :color="service.type === 'stdio' ? 'primary' : 'secondary'"
                        variant="tonal"
                      >
                        {{ service.type }}
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-col>
            </v-row>
          </template>
        </v-container>
      </v-card-text>
      <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="text" size="small" @click="cancelMcpServicesSelection">取消</v-btn>
          <v-btn 
            color="primary" 
            size="small" 
            @click="confirmMcpServicesSelection"
          >
            确定 ({{ tempSelectedMcpServices.length }})
          </v-btn>
        </v-card-actions>
    </v-card>
  </v-dialog>
  
  <!-- MCP调用进度显示 -->
  <v-dialog v-model="showMcpProgress" max-width="400px" persistent>
    <v-card>
      <v-card-title class="text-subtitle-1">工具调用中</v-card-title>
      <v-card-text>
        <div class="d-flex align-center">
          <v-progress-circular indeterminate color="primary" class="mr-3"></v-progress-circular>
          <div>
            <div class="text-body-2">{{ mcpCallProgress?.service || '未知服务' }}</div>
            <div class="text-caption text-medium-emphasis">{{ mcpCallProgress?.message || '正在处理...' }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
  
  <!-- MCP调用结果对话框 -->
  <v-dialog v-model="showMcpResult" max-width="600px">
    <v-card>
      <v-card-title class="text-subtitle-1">工具调用结果</v-card-title>
      <v-card-text>
        <v-container>
          <v-row>
            <v-col cols="12">
              <div class="text-body-2 mb-2">服务: {{ mcpCallResult?.serviceId }}</div>
              <div class="text-body-2 mb-2">方法: {{ mcpCallResult?.method }}</div>
              <div class="text-body-2 mb-2">耗时: {{ mcpCallResult?.duration }}ms</div>
              
              <v-divider class="my-3"></v-divider>
              
              <div class="text-body-2 mb-2">结果:</div>
              <v-card variant="outlined" class="pa-3">
                <pre class="text-caption">{{ 
                  typeof mcpCallResult?.result === 'string' 
                    ? mcpCallResult.result 
                    : JSON.stringify(mcpCallResult?.result, null, 2) 
                }}</pre>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="text" size="small" @click="closeMcpResult">关闭</v-btn>
        <v-btn color="primary" size="small" @click="insertMcpResult">插入到对话</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.mini-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  -webkit-app-region: drag; /* 允许拖动窗口 */
}

.mini-chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: rgba(var(--v-theme-primary), 0.05);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.assistant-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.assistant-name {
  font-size: 0.875rem;
  font-weight: 500;
}

.mini-actions {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag; /* 按钮区域不可拖动 */
}

.mini-chat-input {
  padding: 8px 12px;
  -webkit-app-region: no-drag; /* 输入区域不可拖动 */
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tool-button {
  flex-shrink: 0;
}


</style>