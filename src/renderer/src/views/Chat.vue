<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConversationStore } from '../stores/conversation'
import { useAssistantStore } from '../stores/assistant'
import { useModelStore } from '../stores/model'
import { useSettingStore } from '../stores/setting'
import { useMcpStore } from '../stores/mcp'
import { MdPreview, config } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { 
  Bot, Search, MoreVertical, Edit3, Settings, Trash2, MessageCircle, 
  User, AlertCircle, Wrench, Zap, CheckCircle, Copy, Download, 
  Globe, X, Send, Square, ChevronUp, ChevronDown, SearchX 
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const conversationStore = useConversationStore()
const assistantStore = useAssistantStore()
const modelStore = useModelStore()
const settingStore = useSettingStore()
const mcpStore = useMcpStore()

// 消息输入
const messageInput = ref('')
const messageContainer = ref<HTMLElement | null>(null)
const sending = ref(false)
const editTitleDialog = ref(false)
const newTitle = ref('')

// 模型参数设置
const modelSettingsDialog = ref(false)
const temperature = ref(0.7)
const maxTokens = ref(2000)

// MCP服务选择
const mcpServicesDialog = ref(false)
const selectedMcpServices = ref<string[]>([])
const mcpCallProgress = ref<any>(null)

const showMcpProgress = computed({
  get: () => mcpCallProgress.value !== null,
  set: (value) => {
    if (!value) mcpCallProgress.value = null
  }
})

// 流式响应相关
const streamingResponse = ref('')
const isStreaming = ref(false)
const currentStreamingMessageId = ref<string | null>(null)

// 工具调用tab状态管理
const toolTabStates = ref<Record<string, string>>({})

// 搜索功能相关
const searchDialog = ref(false)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const currentSearchIndex = ref(-1)
const isSearching = ref(false)


// 计算属性
const conversationId = computed(() => Number(route.params.id))

// 临时存储MCP服务选择（用于对话框中的选择状态）
const tempSelectedMcpServices = ref<string[]>([])

// md-preview相关
config({
  markdownItPlugins(plugins, { editorId }) {
    return plugins.map((item) => {
      switch (item.type) {
        case 'code': {
          return {
            ...item,
            options: {
              ...item.options,
              extraTools: ({ lang }) => {
                const downloadText = `<span class="code-tool-text download-text" data-lang="${lang}">下载</span>`;
                
                // if (lang === 'html') {
                //   const runText = `<span class="code-tool-text run-text">运行</span>`;
                //   return downloadText + ' ' + runText;
                // }
                
                return downloadText;
              },
            },
          };
        }

        default: {
          return item;
        }
      }
    });
  },
});

// 监听路由参数变化，当切换对话时重新加载消息
watch(() => route.params.id, async (newId) => {
  if (!newId) {
    router.push('/')
    return
  }
  
  const id = Number(newId)
  // 加载对话消息
  await conversationStore.loadMessages(id)
  
  // 获取对话的temperature、maxTokens和MCP服务设置
  if (conversationStore.currentConversation) {
    // 如果对话没有设置temperature和maxTokens，尝试使用默认模型的参数
    if (!conversationStore.currentConversation.temperature || !conversationStore.currentConversation.max_tokens) {
      const defaultModelId = settingStore.getSetting('default_model_id')
      if (defaultModelId) {
        const defaultModel = modelStore.models.find(model => model.id === defaultModelId)
        if (defaultModel) {
          temperature.value = conversationStore.currentConversation.temperature || defaultModel.default_temperature
          maxTokens.value = conversationStore.currentConversation.max_tokens || defaultModel.default_max_tokens
        } else {
          temperature.value = conversationStore.currentConversation.temperature || 0.7
          maxTokens.value = conversationStore.currentConversation.max_tokens || 2000
        }
      } else {
        temperature.value = conversationStore.currentConversation.temperature || 0.7
        maxTokens.value = conversationStore.currentConversation.max_tokens || 2000
      }
    } else {
      temperature.value = conversationStore.currentConversation.temperature || 0.7
      maxTokens.value = conversationStore.currentConversation.max_tokens || 2000
    }
    
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
  }
  
  // 滚动到底部
  await nextTick()
  scrollToBottom()
}, { immediate: true })

// 事件监听器移除函数的引用
let removeEventListeners: (() => void) | null = null

// 初始化数据
onMounted(async () => {
  if (!conversationId.value) {
    return
  }
  
  // 加载模型列表、设置、助手列表和MCP服务列表
  await Promise.all([
    modelStore.loadModels(),
    settingStore.loadSettings(),
    assistantStore.loadAssistants(),
    mcpStore.loadMcpServices()
  ])
  
  // 注册流式响应事件
  const removeStreamListener = window.api.ai.onStreamResponse((data) => {
    // 检查是否是当前对话的事件
    if (data.conversationId && data.conversationId !== conversationId.value) {
      return; // 不是当前对话的事件，忽略
    }
    
    const text = data.text || data; // 兼容旧格式
    
    // 更新流式响应内容
    streamingResponse.value = text
    
    // 立即更新临时消息内容以实现实时显示
    if (currentStreamingMessageId.value && isStreaming.value) {
      const tempMessageIndex = conversationStore.messages.findIndex(
        msg => msg.id.toString() === currentStreamingMessageId.value
      )
      if (tempMessageIndex !== -1) {
        conversationStore.messages[tempMessageIndex].content = text
      }
    }
    
    // 平滑滚动到底部
    nextTick(() => {
      scrollToBottom()
    })
  })
  
  // 注册流式响应完成事件
  const removeDoneListener = window.api.ai.onStreamDone(async (data) => {
    // 检查是否是当前对话的事件
    if (data && data.conversationId && data.conversationId !== conversationId.value) {
      return; // 不是当前对话的事件，忽略
    }
    
    // 流式响应完成，重新加载对话历史以显示完整的工具调用信息
    if (isStreaming.value) {
      // 移除临时消息
      if (currentStreamingMessageId.value) {
        const tempMessageIndex = conversationStore.messages.findIndex(
          msg => msg.id.toString() === currentStreamingMessageId.value
        )
        if (tempMessageIndex !== -1) {
          conversationStore.messages.splice(tempMessageIndex, 1)
        }
      }
      
      // 重新加载对话历史以获取完整的工具调用信息
      await conversationStore.loadMessages(conversationId.value)
      
      streamingResponse.value = ''
    }
    isStreaming.value = false
    sending.value = false
    currentStreamingMessageId.value = null
    await nextTick()
    scrollToBottom()
  })
  
  // 监听流式响应取消事件
  const removeCancelledListener = window.api.ai.onStreamCancelled((data) => {
    // 检查是否是当前对话的事件
    if (data && data.conversationId && data.conversationId !== conversationId.value) {
      return; // 不是当前对话的事件，忽略
    }
    
    // 流式响应被取消，清理状态
    if (isStreaming.value) {
      // 移除临时消息
      if (currentStreamingMessageId.value) {
        const tempMessageIndex = conversationStore.messages.findIndex(
          msg => msg.id.toString() === currentStreamingMessageId.value
        )
        if (tempMessageIndex !== -1) {
          conversationStore.messages.splice(tempMessageIndex, 1)
        }
      }
      
      streamingResponse.value = ''
    }
    isStreaming.value = false
    sending.value = false
    currentStreamingMessageId.value = null
    
    showSnackbar('生成已取消', 'info')
  })
  
  // 注册MCP调用事件监听器
  const removeMcpProgressListener = window.api.mcp.onCallProgress((data) => {
    mcpCallProgress.value = data
  })
  
  const removeMcpErrorListener = window.api.mcp.onCallError((error) => {
    mcpCallProgress.value = null
    console.error('MCP调用失败:', error)
    // 添加错误消息到对话中
    conversationStore.addMessage('system', `MCP服务调用失败: ${error.error}`)
  })
  
  // 添加代码工具按钮事件监听器
  document.addEventListener('click', handleCodeToolClick)
  
  // 保存移除事件监听器的函数
  removeEventListeners = () => {
    removeStreamListener()
    removeDoneListener()
    removeCancelledListener()
    removeMcpProgressListener()
    removeMcpErrorListener()
    document.removeEventListener('click', handleCodeToolClick)
  }
})

// 组件卸载时移除事件监听器
onUnmounted(() => {
  if (removeEventListeners) {
    removeEventListeners()
    removeEventListeners = null
  }
})

// 错误信息
const errorMessage = ref('')
const showError = ref(false)

// Agent状态信息
const agentStatus = ref('')
const showAgentStatus = ref(false)

// 提示信息
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// 确认对话框
const confirmDialog = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmAction = ref<(() => void) | null>(null)

// HTML预览相关的响应式变量
const showHtmlPreview = ref(false)
const htmlPreviewContent = ref('')
const htmlPreviewTitle = ref('')

// 显示提示信息
function showSnackbar(text: string, color: string = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
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

// 下载代码
function downloadCode(code: string, language: string = 'txt') {
  const blob = new Blob([code], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `code.${language}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showSnackbar('代码已下载', 'success')
}

// 运行HTML代码
function runHtmlCode(htmlCode: string, title: string = 'HTML预览') {
  // 使用新的代码运行窗口
  window.api.openCodeRunner({
    code: htmlCode,
    title: title,
    language: 'html'
  })
}

// 关闭HTML预览
function closeHtmlPreview() {
  showHtmlPreview.value = false
  htmlPreviewContent.value = ''
  htmlPreviewTitle.value = ''
}

// 处理代码工具文本点击事件
function handleCodeToolClick(event: Event) {
  const target = event.target as HTMLElement
  const toolElement = target.closest('.code-tool-text') as HTMLElement
  
  if (!toolElement) return
  
  // 防止事件冒泡和默认行为
  event.preventDefault()
  event.stopPropagation()
  
  // 防止重复点击
  if (toolElement.dataset.processing === 'true') {
    return
  }
  
  // 标记为正在处理
  toolElement.dataset.processing = 'true'
  
  // 查找代码块容器
  const codeContainer = toolElement.closest('.md-editor-code')
  if (!codeContainer) {
    toolElement.dataset.processing = 'false'
    return
  }
  
  // 获取代码内容
  const codeElement = codeContainer.querySelector('code')
  if (!codeElement) {
    toolElement.dataset.processing = 'false'
    return
  }
  
  const code = codeElement.textContent || ''
  
  try {
    if (toolElement.classList.contains('download-text')) {
      // 从代码块头部获取语言信息
      const langElement = codeContainer.querySelector('.md-editor-code-lang')
      const lang = langElement?.textContent?.trim() || toolElement.dataset.lang || 'txt'
      downloadCode(code, lang)
    } else if (toolElement.classList.contains('run-text')) {
      runHtmlCode(code, 'HTML预览')
    }
  } finally {
    // 延迟重置处理状态，防止快速重复点击
    setTimeout(() => {
      toolElement.dataset.processing = 'false'
    }, 500)
  }
}

// 根据助手ID获取助手名称
function getAssistantName(assistantId: number) {
  const assistant = assistantStore.assistants.find(a => a.id === assistantId)
  return assistant ? assistant.name : '未知助手'
}

// 发送消息
// 发送消息
async function sendMessage() {
  if (!messageInput.value.trim() || sending.value) return
  
  const userMessage = messageInput.value.trim()
  messageInput.value = ''
  sending.value = true
  errorMessage.value = ''
  showError.value = false
  agentStatus.value = ''
  showAgentStatus.value = false
  
  try {
    // 添加用户消息
    await conversationStore.addMessage('user', userMessage)
    await nextTick()
    scrollToBottom()
    
    // 检查是否是第一条用户消息，如果是且标题为默认值，则更新标题
    // 过滤掉系统消息，只计算用户和助手的消息
    const userAndAssistantMessages = conversationStore.messages.filter(msg => msg.role === 'user' || msg.role === 'assistant')
    if (userAndAssistantMessages.length === 1 && 
        conversationStore.currentConversation && 
        conversationStore.currentConversation.title === '新对话') {
      // 截取用户消息的前30个字符作为标题
      const newTitle = userMessage.length > 30 ? userMessage.substring(0, 30) + '...' : userMessage
      await conversationStore.updateConversationTitle(conversationId.value, newTitle)
    }
    
    // 获取当前对话关联的助手信息
    if (!conversationStore.currentConversation) {
      throw new Error('未找到当前对话')
    }
    
    // 从当前对话获取助手ID
    const assistantId = conversationStore.currentConversation.assistant_id
    if (!assistantId) {
      throw new Error('当前对话未关联助手')
    }
    
    try {
      // 获取对话历史记录用于上下文
      const messages = conversationStore.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      
      console.log(`调用助手API: ${assistantId}, 消息数量: ${messages.length}`)
      
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
        content: '🤔 **正在思考...**',
        created_at: new Date().toISOString()
      }
      conversationStore.messages.push(tempMessage)
      currentStreamingMessageId.value = tempMessage.id.toString()
      
      // 滚动到底部显示新消息
      await nextTick()
      scrollToBottom()
      
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
              env: service.env,
              request_url: service.request_url,
              request_headers: service.request_headers
            }))
        : []
      
      // 通过IPC调用主进程的API请求，传递temperature、maxTokens和选中的MCP服务参数
      await window.api.ai.callApi(
        assistantId, 
        apiMessages, 
        conversationId.value, 
        temperature.value, 
        maxTokens.value,
        selectedServices
      )
      
      // API调用完成，流式响应将通过事件监听器处理
      // currentStreamingMessageId将在onStreamDone事件中重置
      
      // 注意：不再清空已选择的MCP服务，让它们在对话中持续有效
    } catch (apiError) {
      console.error('API调用失败:', apiError)
      errorMessage.value = `调用AI服务失败: ${(apiError as Error).message || '未知错误'}`
      showError.value = true
      
      // 移除临时消息
      if (currentStreamingMessageId.value) {
        const tempMessageIndex = conversationStore.messages.findIndex(
          msg => msg.id.toString() === currentStreamingMessageId.value
        )
        if (tempMessageIndex !== -1) {
          conversationStore.messages.splice(tempMessageIndex, 1)
        }
      }
      
      // 添加错误提示作为系统消息
      await conversationStore.addMessage('system', `错误: ${errorMessage.value}`)
      isStreaming.value = false
      sending.value = false
      currentStreamingMessageId.value = null
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    errorMessage.value = `发送消息失败: ${(error as Error).message || '未知错误'}`
    showError.value = true
    
    // 移除临时消息
    if (currentStreamingMessageId.value) {
      const tempMessageIndex = conversationStore.messages.findIndex(
        msg => msg.id.toString() === currentStreamingMessageId.value
      )
      if (tempMessageIndex !== -1) {
        conversationStore.messages.splice(tempMessageIndex, 1)
      }
    }
    
    isStreaming.value = false
    sending.value = false
    currentStreamingMessageId.value = null
  }
}

// API调用已迁移到主进程中

// 滚动到底部
function scrollToBottom() {
  if (messageContainer.value) {
    // 使用setTimeout确保DOM更新后再滚动
    // 增加延迟时间以确保所有内容都已渲染完成
    setTimeout(() => {
      if (messageContainer.value) {
        messageContainer.value.scrollTop = messageContainer.value.scrollHeight
      }
    }, 100)
  }
}

// 编辑对话标题
async function editTitle() {
  if (!newTitle.value.trim()) return
  
  await conversationStore.updateConversationTitle(conversationId.value, newTitle.value)
  editTitleDialog.value = false
}

// 打开编辑标题对话框
function openEditTitleDialog() {
  if (conversationStore.currentConversation) {
    newTitle.value = conversationStore.currentConversation.title
    editTitleDialog.value = true
  }
}

// 打开模型参数设置对话框
function openModelSettingsDialog() {
  modelSettingsDialog.value = true
}

// 更新模型参数设置
async function updateModelSettings() {
  if (conversationId.value) {
    await conversationStore.updateConversation(conversationId.value, {
      temperature: temperature.value,
      maxTokens: maxTokens.value
    })
    modelSettingsDialog.value = false
  }
}

// 清空对话
function clearConversation() {
  showConfirmDialog(
    '清空对话',
    '确定要清空此对话的所有消息吗？',
    async () => {
      await conversationStore.clearMessages()
      // 重新聚焦输入框
      await nextTick()
      const textareaElement = document.querySelector('.input-container textarea') as HTMLTextAreaElement
      if (textareaElement) {
        textareaElement.focus()
      }
    }
  )
}

// 删除对话
function deleteConversation() {
  showConfirmDialog(
    '删除对话',
    '确定要删除此对话吗？',
    async () => {
      await conversationStore.deleteConversation(conversationId.value)
      router.push('/')
    }
  )
}

// 删除单条消息
function deleteMessage(messageId: number) {
  showConfirmDialog(
    '删除消息',
    '确定要删除这条消息吗？',
    async () => {
      await conversationStore.deleteMessage(messageId)
    }
  )
}

// 强制停止对话生成
async function stopGeneration() {
  if (isStreaming.value) {
    try {
      // 通知后端停止生成
      await window.api.ai.stopGeneration(conversationId.value)
      
      // 更新前端状态
      isStreaming.value = false
      sending.value = false
      
      // 移除临时消息
      if (currentStreamingMessageId.value) {
        const tempMessageIndex = conversationStore.messages.findIndex(
          msg => msg.id.toString() === currentStreamingMessageId.value
        )
        if (tempMessageIndex !== -1) {
          conversationStore.messages.splice(tempMessageIndex, 1)
        }
      }
      
      // 添加一个系统消息，表示对话被用户中断
      await conversationStore.addMessage('system', '⏹️ 对话生成已被用户中断')
      
      currentStreamingMessageId.value = null
      streamingResponse.value = ''
      
      showSnackbar('已停止生成', 'info')
    } catch (error) {
      console.error('停止生成失败:', error)
      showSnackbar('停止生成失败', 'error')
    }
  }
}

// 打开MCP服务选择对话框
function openMcpServicesDialog() {
  // 将当前选择的MCP服务复制到临时变量中
  tempSelectedMcpServices.value = [...selectedMcpServices.value]
  mcpServicesDialog.value = true
}

// 确认保存MCP服务选择
async function confirmMcpServicesSelection() {
  try {
    console.log('Chat.vue: 确认保存MCP服务选择:', tempSelectedMcpServices.value)
    
    if (conversationStore.currentConversation) {
      // 更新实际的选择状态
      selectedMcpServices.value = [...tempSelectedMcpServices.value]
      
      // 转换为普通数组以避免IPC序列化问题
      const mcpServicesArray = [...selectedMcpServices.value]
      
      // 保存到数据库
      console.log('Chat.vue: 更新对话', conversationStore.currentConversation.id, '的MCP服务:', mcpServicesArray)
      await conversationStore.updateConversation(conversationStore.currentConversation.id, {
        mcpServices: mcpServicesArray
      })
      
      console.log('Chat.vue: MCP服务选择保存成功')
      showSnackbar('MCP工具选择已保存', 'success')
    }
    
    mcpServicesDialog.value = false
  } catch (error) {
    console.error('保存MCP服务选择失败:', error)
    showSnackbar('保存MCP工具选择失败', 'error')
  }
}

// 取消MCP服务选择
function cancelMcpServicesSelection() {
  // 恢复临时选择状态
  tempSelectedMcpServices.value = [...selectedMcpServices.value]
  mcpServicesDialog.value = false
}







// 复制消息内容
async function copyMessage(message: any) {
  try {
    // 只复制消息内容本体
    const textToCopy = message.content || ''
    
    // 使用Clipboard API复制到剪贴板
    await navigator.clipboard.writeText(textToCopy)
    
    // 显示成功提示
    showSnackbar('消息已复制到剪贴板', 'success')
  } catch (error) {
    console.error('复制失败:', error)
    // 降级方案：使用传统的复制方法
    try {
      const textArea = document.createElement('textarea')
      textArea.value = message.content || ''
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      showSnackbar('消息已复制到剪贴板', 'success')
    } catch (fallbackError) {
      console.error('复制失败（降级方案也失败）:', fallbackError)
      showSnackbar('复制失败，请手动复制', 'error')
    }
  }
}

// 保存消息为Markdown文件
async function saveMessageAsMarkdown(message: any) {
  try {
    // 构建Markdown内容
    let markdownContent = ''
    
    const roleName = message.role === 'user' ? '我' : 
                    message.role === 'system' ? '系统' : 
                    (conversationStore.currentConversation ? getAssistantName(conversationStore.currentConversation.assistant_id) : '助手')
    
    markdownContent += `# ${roleName}\n\n`
    markdownContent += `**时间:** ${new Date(message.created_at).toLocaleString()}\n\n`
    
    // 添加工具调用信息
    if (message.tool_calls && message.tool_calls.length > 0) {
      markdownContent += '## 工具调用\n\n'
      for (const toolCall of message.tool_calls) {
        markdownContent += `### ${toolCall.function.name}\n\n`
        markdownContent += `**工具ID:** ${toolCall.id}\n\n`
        if (toolCall.function.arguments) {
          const args = typeof toolCall.function.arguments === 'string' 
            ? JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)
            : JSON.stringify(toolCall.function.arguments, null, 2)
          markdownContent += '**参数:**\n\n```json\n' + args + '\n```\n\n'
        }
      }
    }
    
    // 添加工具执行结果
    if (message.role === 'tool') {
      markdownContent += '## 工具执行结果\n\n'
      if (message.tool_call_id) {
        markdownContent += `**工具调用ID:** ${message.tool_call_id}\n\n`
      }
      markdownContent += '```\n' + message.content + '\n```\n\n'
    } else if (message.content) {
      markdownContent += '## 内容\n\n'
      markdownContent += message.content + '\n\n'
    }
    
    // 创建文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `message-${roleName}-${timestamp}.md`
    
    // 创建Blob并下载
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // 清理URL对象
    URL.revokeObjectURL(url)
    
    console.log(`消息已保存为: ${filename}`)
  } catch (error) {
    console.error('保存文件失败:', error)
  }
}

// 初始化工具tab状态
function initToolTabState(messageId: string | number) {
  const key = messageId.toString()
  if (!toolTabStates.value[key]) {
    // 默认显示调用参数tab，如果没有调用参数则显示结果tab
    const message = conversationStore.messages.find(m => m.id.toString() === key)
    if (message?.tool_calls && message.tool_calls.length > 0) {
      toolTabStates.value[key] = 'calls'
    } else if (message?.tool_results && message.tool_results.length > 0) {
      toolTabStates.value[key] = 'results'
    } else {
      toolTabStates.value[key] = 'calls'
    }
  }
}

// 搜索功能相关方法
// 打开搜索对话框
function openSearchDialog() {
  searchDialog.value = true
  searchQuery.value = ''
  searchResults.value = []
  currentSearchIndex.value = -1
}

// 执行搜索
function performSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    currentSearchIndex.value = -1
    return
  }

  isSearching.value = true
  const query = searchQuery.value.toLowerCase().trim()
  const results: any[] = []

  conversationStore.messages.forEach((message, index) => {
    if (message.content && message.content.toLowerCase().includes(query)) {
      // 找到匹配的内容片段
      const content = message.content
      const lowerContent = content.toLowerCase()
      const queryIndex = lowerContent.indexOf(query)
      
      // 获取匹配内容的上下文（前后各50个字符）
      const start = Math.max(0, queryIndex - 50)
      const end = Math.min(content.length, queryIndex + query.length + 50)
      const snippet = content.substring(start, end)
      
      results.push({
        messageId: message.id,
        messageIndex: index,
        role: message.role,
        snippet: snippet,
        matchIndex: queryIndex,
        createdAt: message.created_at
      })
    }
  })

  searchResults.value = results
  currentSearchIndex.value = results.length > 0 ? 0 : -1
  isSearching.value = false

  if (results.length === 0) {
    showSnackbar('未找到匹配的消息', 'info')
  } else {
    showSnackbar(`找到 ${results.length} 条匹配消息`, 'success')
  }
}

// 定位到搜索结果
function goToSearchResult(index: number) {
  if (index < 0 || index >= searchResults.value.length) return
  
  currentSearchIndex.value = index
  const result = searchResults.value[index]
  
  // 找到对应的消息元素并滚动到该位置
  nextTick(() => {
    const messageElement = document.querySelector(`[data-message-id="${result.messageId}"]`)
    if (messageElement) {
      messageElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      })
      
      // 高亮显示该消息
      messageElement.classList.add('search-highlight')
      setTimeout(() => {
        messageElement.classList.remove('search-highlight')
      }, 3000)
    }
    // 关闭搜索对话框
    closeSearchDialog()
  })
}

// 上一个搜索结果
function previousSearchResult() {
  if (searchResults.value.length === 0) return
  const newIndex = currentSearchIndex.value > 0 ? currentSearchIndex.value - 1 : searchResults.value.length - 1
  goToSearchResult(newIndex)
}

// 下一个搜索结果
function nextSearchResult() {
  if (searchResults.value.length === 0) return
  const newIndex = currentSearchIndex.value < searchResults.value.length - 1 ? currentSearchIndex.value + 1 : 0
  goToSearchResult(newIndex)
}

// 关闭搜索对话框
function closeSearchDialog() {
  searchDialog.value = false
  searchQuery.value = ''
  searchResults.value = []
  currentSearchIndex.value = -1
  
  // 移除所有高亮
  document.querySelectorAll('.search-highlight').forEach(el => {
    el.classList.remove('search-highlight')
  })
}

// 格式化搜索结果片段，高亮匹配的文本
function formatSearchSnippet(snippet: string, query: string) {
  if (!query.trim()) return snippet
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return snippet.replace(regex, '<mark>$1</mark>')
}
</script>

<template>
  <div class="chat-container">
    <!-- 主要内容区域 -->
    <div class="main-content" :class="{ 'with-preview': showHtmlPreview }">
      <!-- 聊天区域 -->
      <div class="chat-area">
        <div class="chat-header">
          <v-card flat>
        <v-card-title class="d-flex align-center py-3">
          <span v-if="conversationStore.currentConversation" class="text-body-1 text-truncate conversation-title">
            {{ conversationStore.currentConversation.title }}
          </span>
          
          <v-spacer></v-spacer>
          
          <div class="d-flex align-center">
            <v-chip
              v-if="conversationStore.currentConversation && conversationStore.currentConversation.assistant_id"
              color="secondary"
              size="small"
              variant="tonal"
              class="mr-2"
            >
              <Bot :size="16" class="mr-1" />
              {{ getAssistantName(conversationStore.currentConversation.assistant_id) }}
            </v-chip>
            
            <!-- 搜索按钮 -->
            <v-btn 
              icon 
              size="small" 
              class="mr-1"
              @click="openSearchDialog"
              :disabled="conversationStore.messages.length === 0"
            >
              <Search :size="20" />
              <v-tooltip activator="parent" location="bottom">
                搜索聊天记录
              </v-tooltip>
            </v-btn>
            
            <v-menu>
              <template v-slot:activator="{ props }">
                <v-btn icon size="small" v-bind="props">
                  <MoreVertical :size="20" />
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item @click="openEditTitleDialog" density="compact">
                  <template v-slot:prepend>
                    <Edit3 :size="16" />
                  </template>
                  <v-list-item-title class="text-body-2">重命名</v-list-item-title>
                </v-list-item>
                <v-list-item @click="openModelSettingsDialog" density="compact">
                  <template v-slot:prepend>
                    <Settings :size="16" />
                  </template>
                  <v-list-item-title class="text-body-2">调整参数</v-list-item-title>
                </v-list-item>
                <v-list-item @click="clearConversation" density="compact">
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
          </div>
        </v-card-title>
      </v-card>
        </div>
    
    <!-- 消息列表 -->
    <div class="message-container" ref="messageContainer">
      <template v-if="conversationStore.messages.length === 0">
        <div class="empty-state">
          <MessageCircle :size="64" color="rgb(var(--v-theme-on-surface-variant))" />
          <p>没有消息，开始对话吧</p>
        </div>
      </template>
      
      <template v-else>
        <div 
          v-for="message in conversationStore.messages" 
          :key="message.id"
          :data-message-id="message.id"
          :class="['message', 
            message.role === 'user' ? 'message-user' : 
            message.role === 'system' ? 'message-system' : 'message-assistant']"
        >
          <div class="message-avatar">
            <v-avatar 
              :color="message.role === 'user' ? 'primary' : 
                     message.role === 'system' ? 'error' : 'secondary'" 
              size="36"
            >
              <component :is="message.role === 'user' ? User : 
                             message.role === 'system' ? AlertCircle : Bot" 
                         :size="20" />
            </v-avatar>
          </div>
          <div class="message-content" :class="{'system-message': message.role === 'system'}">
            <div class="message-header">
              <span class="message-name">
                {{ message.role === 'user' ? '我' : 
                   message.role === 'system' ? '系统' : 
                   (conversationStore.currentConversation ? getAssistantName(conversationStore.currentConversation.assistant_id) : '助手') }}
              </span>
              <div class="message-actions">
                <span class="message-time">{{ new Date(message.created_at).toLocaleString() }}</span>
              </div>
            </div>
            <!-- 工具调用和结果展示 -->
            <div v-if="(message.tool_calls && message.tool_calls.length > 0) || (message.tool_results && message.tool_results.length > 0)" class="tool-calls-container mt-3">
              <v-expansion-panels variant="accordion" class="tool-expansion-panels">
                <v-expansion-panel>
                  <v-expansion-panel-title class="text-subtitle-2 py-2">
                    <Wrench :size="16" class="mr-2" />
                    工具调用信息
                    <v-chip v-if="message.tool_calls" size="x-small" color="primary" variant="tonal" class="ml-2">
                      {{ message.tool_calls.length }} 个调用
                    </v-chip>
                    <v-chip v-if="message.tool_results" size="x-small" color="success" variant="tonal" class="ml-2">
                      {{ message.tool_results.length }} 个结果
                    </v-chip>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <v-tabs v-model="toolTabStates[message.id.toString()]" class="tool-tabs">
                      <v-tab v-if="message.tool_calls && message.tool_calls.length > 0" value="calls">
                        <Zap :size="16" class="mr-1" />
                        调用参数
                      </v-tab>
                      <v-tab v-if="message.tool_results && message.tool_results.length > 0" value="results">
                        <CheckCircle :size="16" class="mr-1" />
                        执行结果
                      </v-tab>
                    </v-tabs>
                    
                    <v-tabs-window v-model="toolTabStates[message.id.toString()]" class="mt-3">
                      <!-- 工具调用参数 -->
                      <v-tabs-window-item v-if="message.tool_calls && message.tool_calls.length > 0" value="calls">
                        <div v-for="(toolCall, index) in message.tool_calls" :key="index" class="tool-call-item mb-3">
                          <div class="d-flex align-center mb-2">
                            <v-chip size="small" color="primary" variant="tonal" class="mr-2">
                              {{ toolCall.function.name }}
                            </v-chip>
                            <v-chip size="x-small" color="secondary" variant="outlined">
                              {{ toolCall.id }}
                            </v-chip>
                          </div>
                          <div v-if="toolCall.function.arguments" class="tool-arguments">
                            <div class="text-caption text-medium-emphasis mb-1">参数:</div>
                            <v-card variant="outlined" class="pa-2">
                              <pre class="text-caption">{{ 
                                typeof toolCall.function.arguments === 'string' 
                                  ? JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)
                                  : JSON.stringify(toolCall.function.arguments, null, 2)
                              }}</pre>
                            </v-card>
                          </div>
                        </div>
                      </v-tabs-window-item>
                      
                      <!-- 工具执行结果 -->
                      <v-tabs-window-item v-if="message.tool_results && message.tool_results.length > 0" value="results">
                        <div v-for="(toolResult, index) in message.tool_results" :key="index" class="tool-result-item mb-3">
                          <div class="d-flex align-center mb-2">
                            <v-chip size="small" color="success" variant="tonal" class="mr-2">
                              结果 {{ index + 1 }}
                            </v-chip>
                            <v-chip v-if="toolResult.tool_call_id" size="x-small" color="secondary" variant="outlined">
                              {{ toolResult.tool_call_id }}
                            </v-chip>
                          </div>
                          <div class="tool-result-content">
                            <div class="text-caption text-medium-emphasis mb-1">输出:</div>
                            <v-card variant="outlined" class="pa-2">
                              <pre class="text-caption">{{ toolResult.content }}</pre>
                            </v-card>
                          </div>
                        </div>
                      </v-tabs-window-item>
                    </v-tabs-window>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>
            
            <!-- 工具调用结果展示（兼容旧格式） -->
            <div v-if="message.role === 'tool'" class="tool-result-container mt-3">
              <v-expansion-panels variant="accordion" class="tool-expansion-panels">
                <v-expansion-panel>
                  <v-expansion-panel-title class="text-subtitle-2 py-2">
                    <CheckCircle :size="16" class="mr-2" color="rgb(var(--v-theme-success))" />
                    工具执行结果
                    <v-chip v-if="message.tool_call_id" size="x-small" color="secondary" variant="outlined" class="ml-2">
                      {{ message.tool_call_id }}
                    </v-chip>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <v-card variant="outlined" class="pa-2">
                      <pre class="text-caption">{{ message.content }}</pre>
                    </v-card>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>
            
            <!-- 普通消息内容 -->
            <div v-if="message.content && message.role !== 'tool'" class="message-text">
                <MdPreview 
                  :id="`preview-${message.id}`" 
                  :modelValue="message.content" 
                  :theme="settingStore.getSetting('theme', 'light')"
                  previewTheme="github"
                />
            </div>
            
            <!-- 消息操作按钮 -->
            <div class="message-actions-bottom">
              <div class="action-buttons">
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  density="compact"
                  @click="copyMessage(message)"
                  class="action-btn"
                >
                  <Copy :size="16" />
                  <v-tooltip activator="parent" location="top">复制</v-tooltip>
                </v-btn>
                
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  density="compact"
                  @click="deleteMessage(message.id)"
                  class="action-btn"
                >
                  <Trash2 :size="16" />
                  <v-tooltip activator="parent" location="top">删除</v-tooltip>
                </v-btn>
                
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  density="compact"
                  @click="saveMessageAsMarkdown(message)"
                  class="action-btn"
                >
                  <Download :size="16" />
                  <v-tooltip activator="parent" location="top">保存为Markdown</v-tooltip>
                </v-btn>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
      </div>
      
      <!-- HTML预览面板 -->
      <div v-if="showHtmlPreview" class="html-preview-panel">
        <div class="preview-header">
          <div class="preview-title">
            <Globe :size="16" class="mr-2" />
            {{ htmlPreviewTitle }}
          </div>
          <v-btn
            icon
            size="small"
            variant="text"
            @click="closeHtmlPreview"
          >
            <X :size="20" />
          </v-btn>
        </div>
        <div class="preview-content">
          <iframe
            :srcdoc="htmlPreviewContent"
            class="preview-iframe"
            sandbox="allow-scripts allow-same-origin allow-unsafe-inline"
          ></iframe>
        </div>
      </div>
    </div>
    
    <!-- 错误提示 -->
    <v-alert
      v-if="showError"
      type="error"
      variant="tonal"
      density="compact"
      closable
      class="error-alert mx-4 mt-2"
      @click:close="showError = false"
    >
      {{ errorMessage }}
    </v-alert>
    
    <!-- 悬浮输入区域 -->
    <div class="floating-input-container">
      <div class="input-wrapper">
        <!-- 工具选择提示 -->
        <div v-if="selectedMcpServices.length > 0" class="selected-tools-chip">
          <v-chip
            size="small"
            color="secondary"
            variant="tonal"
            closable
            @click:close="selectedMcpServices = []"
          >
            <Wrench :size="16" class="mr-1" />
            {{ selectedMcpServices.length }} 个工具
          </v-chip>
        </div>
        
        <!-- 输入框容器 -->
        <div class="input-field-container">
          <!-- 左侧工具按钮 -->
          <v-btn
            icon
            size="small"
            variant="text"
            class="tool-button-left"
            @click="openMcpServicesDialog"
            :disabled="sending || isStreaming"
          >
            <Wrench :size="20" />
            <v-tooltip activator="parent" location="top">选择工具</v-tooltip>
          </v-btn>
          
          <!-- 输入框 -->
          <v-textarea
            v-model="messageInput"
            placeholder="输入消息..."
            rows="1"
            auto-grow
            max-rows="6"
            hide-details
            density="compact"
            variant="outlined"
            class="message-input"
            @keydown.enter.exact.prevent="sendMessage"
          ></v-textarea>
          
          <!-- 右侧发送按钮 -->
          <v-btn
            v-if="!isStreaming"
            color="primary"
            icon
            size="small"
            class="send-button-right"
            @click="sendMessage"
            :disabled="!messageInput.trim() || sending"
          >
            <Send :size="20" />
          </v-btn>
          <v-btn
            v-else
            color="error"
            icon
            size="small"
            class="send-button-right"
            @click="stopGeneration"
          >
            <Square :size="20" />
          </v-btn>
        </div>
      </div>
    </div>
    
    <!-- 编辑标题对话框 -->
    <v-dialog v-model="editTitleDialog" max-width="450px">
      <v-card>
        <v-card-title class="text-subtitle-1">编辑对话标题</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newTitle"
            label="对话标题"
            required
            density="compact"
            variant="outlined"
            class="mb-3"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="text" size="small" @click="editTitleDialog = false">取消</v-btn>
          <v-btn color="primary" size="small" @click="editTitle">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    
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
    
    <!-- 提示信息 -->
    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      timeout="3000"
      location="top"
    >
      {{ snackbarText }}
    </v-snackbar>

    <!-- 确认对话框 -->
    <v-dialog v-model="confirmDialog" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6">
          <AlertCircle :size="24" color="rgb(var(--v-theme-warning))" class="mr-2" />
          {{ confirmTitle }}
        </v-card-title>
        <v-card-text class="text-body-1 py-4">
          {{ confirmMessage }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn 
            color="grey" 
            variant="text" 
            @click="cancelConfirmAction"
          >
            取消
          </v-btn>
          <v-btn 
            color="error" 
            variant="elevated"
            @click="executeConfirmAction"
          >
            确认
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 搜索对话框 -->
    <v-dialog v-model="searchDialog" max-width="600px" persistent>
      <v-card>
        <v-card-title class="text-h6 d-flex align-center">
          <Search :size="24" class="mr-2" />
          搜索聊天记录
          <v-spacer></v-spacer>
          <v-btn icon size="small" @click="closeSearchDialog">
            <X :size="20" />
          </v-btn>
        </v-card-title>
        
        <v-card-text>
          <!-- 搜索输入框 -->
          <v-text-field
            v-model="searchQuery"
            label="输入搜索关键词"
            variant="outlined"
            density="compact"
            class="mb-4"
            @keyup.enter="performSearch"
            @input="performSearch"
            clearable
            autofocus
          >
            <template v-slot:prepend-inner>
              <Search :size="16" />
            </template>
          </v-text-field>
          
          <!-- 搜索结果导航 -->
          <div v-if="searchResults.length > 0" class="d-flex align-center mb-4">
            <v-chip size="small" color="primary" variant="tonal" class="mr-3">
              {{ currentSearchIndex + 1 }} / {{ searchResults.length }}
            </v-chip>
            
            <v-btn-group density="compact" size="small">
              <v-btn 
                @click="previousSearchResult"
                :disabled="searchResults.length === 0"
              >
                <ChevronUp :size="16" />
              </v-btn>
              <v-btn 
                @click="nextSearchResult"
                :disabled="searchResults.length === 0"
              >
                <ChevronDown :size="16" />
              </v-btn>
            </v-btn-group>
            
            <v-spacer></v-spacer>
            
            <v-btn 
              size="small" 
              color="primary" 
              variant="text"
              @click="closeSearchDialog"
            >
              关闭搜索
            </v-btn>
          </div>
          
          <!-- 搜索结果列表 -->
          <div v-if="searchResults.length > 0" class="search-results">
            <v-list density="compact">
              <v-list-item
                v-for="(result, index) in searchResults"
                :key="result.messageId"
                :class="{ 'bg-primary-lighten-5': index === currentSearchIndex }"
                @click="goToSearchResult(index)"
                class="search-result-item"
              >
                <template v-slot:prepend>
                  <v-avatar 
                    size="24" 
                    :color="result.role === 'user' ? 'primary' : 
                           result.role === 'system' ? 'error' : 'secondary'"
                  >
                    <component :is="result.role === 'user' ? User : 
                                   result.role === 'system' ? AlertCircle : Bot" 
                               :size="14" />
                  </v-avatar>
                </template>
                
                <v-list-item-title class="text-body-2">
                  <span v-html="formatSearchSnippet(result.snippet, searchQuery)"></span>
                </v-list-item-title>
                
                <v-list-item-subtitle class="text-caption">
                  {{ new Date(result.createdAt).toLocaleString() }}
                </v-list-item-subtitle>
                
                <template v-slot:append>
                  <v-chip 
                    size="x-small" 
                    :color="result.role === 'user' ? 'primary' : 
                           result.role === 'system' ? 'error' : 'secondary'"
                    variant="tonal"
                  >
                    {{ result.role === 'user' ? '我' : 
                       result.role === 'system' ? '系统' : '助手' }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
          </div>
          
          <!-- 无搜索结果 -->
          <div v-else-if="searchQuery && !isSearching" class="text-center py-8">
            <SearchX :size="48" color="rgb(var(--v-theme-on-surface-variant))" />
            <p class="text-body-2 text-medium-emphasis mt-2">未找到匹配的消息</p>
          </div>
          
          <!-- 搜索提示 -->
          <div v-else-if="!searchQuery" class="text-center py-8">
            <Search :size="48" color="rgb(var(--v-theme-on-surface-variant))" />
            <p class="text-body-2 text-medium-emphasis mt-2">输入关键词搜索聊天记录</p>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
/* 搜索高亮样式 */
.search-highlight {
  background-color: rgba(255, 235, 59, 0.3) !important;
  border: 2px solid #ffeb3b !important;
  border-radius: 8px !important;
  transition: all 0.3s ease !important;
}

/* 搜索结果项样式 */
.search-result-item {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.search-result-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

/* 搜索结果中的高亮文本 */
.search-result-item mark {
  background-color: #ffeb3b;
  color: #000;
  padding: 1px 2px;
  border-radius: 2px;
  font-weight: 500;
}

/* 搜索结果列表样式 */
.search-results {
  max-height: 400px;
  overflow-y: auto;
}

/* 当前选中的搜索结果 */
.bg-primary-lighten-5 {
  background-color: rgba(33, 150, 243, 0.1) !important;
}
.chat-container {
  overflow-x: hidden;
  max-width: 100%;
}
/* 工具调用展开面板样式 */
.tool-expansion-panels {
  box-shadow: none;
}

.tool-expansion-panels .v-expansion-panel {
  border-radius: 8px;
}

.tool-expansion-panels .v-expansion-panel-title {
  font-size: 0.875rem;
  min-height: 40px;
  padding: 8px 16px;
}

.tool-expansion-panels .v-expansion-panel-text {
  padding: 12px 16px;
}

.tool-call-item:last-child {
  margin-bottom: 0 !important;
}
/* 消息操作按钮样式 */
.message-actions-bottom {
  margin-top: 8px;
  display: flex;
  justify-content: flex-start;
}

.action-buttons {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.message:hover .action-buttons {
  opacity: 1;
}

.action-btn {
  min-width: 28px !important;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  transition: all 0.2s ease-in-out;
}

.action-btn .v-icon {
  font-size: 16px;
}

/* 确保按钮在消息内容下方有适当间距 */
.message-text {
  margin-bottom: 4px;
}

.tool-calls-container,
.tool-result-container {
  margin-bottom: 4px;
}

/* 代码块工具栏样式优化 */
:deep(.md-editor-code-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-bottom: 1px solid rgba(var(--v-theme-outline), 0.2);
}

:deep(.md-editor-code-head .md-editor-code-lang) {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  user-select: text;
  position: relative; /* 为悬浮输入框提供定位上下文 */
}

.main-content {
  display: flex;
  flex: 1;
  height: 100%;
  transition: all 0.3s ease;
}

.main-content.with-preview {
  /* 当显示预览时的样式 */
}

.main-content.with-preview .chat-area {
  flex: 1;
  min-width: 400px;
  border-right: 1px solid rgba(var(--v-theme-outline), 0.2);
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}

.html-preview-panel {
  flex: 0 0 50%;
  min-width: 400px;
  max-width: 60%;
  border-left: 1px solid rgba(var(--v-theme-outline), 0.2);
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  height: 100%;
  overflow: hidden;
}

.preview-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(var(--v-theme-outline), 0.2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(var(--v-theme-surface-variant), 0.3);
  flex-shrink: 0;
}

.preview-title {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface));
}

.preview-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: white;
  display: block;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .html-preview-panel {
    flex: 0 0 45%;
    min-width: 350px;
  }
  
  .main-content.with-preview .chat-area {
    min-width: 350px;
  }
}

@media (max-width: 900px) {
  .html-preview-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    height: 100vh;
    z-index: 1000;
    flex: none;
    max-width: none;
  }
  
  .main-content.with-preview .chat-area {
    border-right: none;
  }
}

.chat-header {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.conversation-title {
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-container {
  flex-grow: 1;
  overflow-y: auto;
  overflow-x: hidden; /* 禁止横向滚动 */
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 0; /* 确保flex布局下正确计算高度 */
  min-height: 0; /* 确保在Firefox中也能正确滚动 */
  width: 100%; /* 确保容器宽度不超出 */
  box-sizing: border-box; /* 包含padding在宽度计算中 */
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(0, 0, 0, 0.38);
}

.message {
  display: flex;
  margin-bottom: 16px;
  max-width: 85%;
  width: 100%; /* 确保消息容器不超出父容器 */
  box-sizing: border-box;
}

.message-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-assistant {
  align-self: flex-start;
}

.message-system {
  align-self: center;
  max-width: 95%;
}

.message-avatar {
  margin: 0 8px;
}

.message-content {
  border-radius: 8px;
  padding: 12px;
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  min-width: 0; /* 允许flex子元素收缩 */
  flex: 1; /* 占用剩余空间 */
  box-sizing: border-box;
}

.message-user .message-content {
  background-color: rgba(0, 0, 0, 0.03);
}

.system-message {
  background-color: rgba(var(--v-theme-error), 0.1);
  border: 1px solid rgba(var(--v-theme-error), 0.3);
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.85rem;
}

.message-name {
  font-weight: bold;
}

.message-actions {
  display: flex;
  align-items: center;
}

.message-time {
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.75rem;
  margin-left: 4px;
}

.message-text {
}

/* 悬浮输入容器 */
.floating-input-container {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 800px;
  z-index: 10;
}

.input-wrapper {
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(var(--v-theme-outline), 0.2);
  padding: 12px;
}

.selected-tools-chip {
  margin-bottom: 8px;
  display: flex;
  justify-content: center;
}

.input-field-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  position: relative;
}

.tool-button-left {
  flex-shrink: 0;
  margin-bottom: 4px;
}

.message-input {
  flex: 1;
  min-width: 0;
}

.message-input :deep(.v-field) {
  border-radius: 20px;
}

.message-input :deep(.v-field__input) {
  padding: 8px 16px;
  min-height: 40px;
}

.send-button-right {
  flex-shrink: 0;
  margin-bottom: 4px;
}

/* 为聊天容器添加底部padding，避免被悬浮输入框遮挡 */
.message-container {
  padding-bottom: 120px; /* 为悬浮输入框留出空间 */
}

/* 暗色主题适配 */
.v-theme--dark .input-wrapper {
  background: rgba(var(--v-theme-surface), 0.9);
  border: 1px solid rgba(var(--v-theme-outline), 0.3);
}

.error-alert {
  margin-bottom: 8px;
}

/* md-editor-v3 预览样式调整 */
:deep(.md-editor-preview) {
  font-family: inherit;
  font-size: 0.9em;
  line-height: 1.6;
  padding: 0;
  background: transparent !important;
  max-width: 100%;
  overflow-x: hidden;
  word-wrap: break-word;
  word-break: break-word;
}

:deep(.md-editor-preview-wrapper) {
  padding: 0;
  background: transparent !important;
  max-width: 100%;
  overflow-x: hidden;
}

:deep(.md-editor) {
  color: inherit;
  background: transparent !important;
  max-width: 100%;
  overflow-x: hidden;
}

/* 通用内容宽度控制 */
:deep(.md-editor-preview *) {
  max-width: 100%;
}

/* 代码块样式优化 */
:deep(.md-editor-preview pre) {
  overflow-x: auto;
  max-width: 100%;
  white-space: pre-wrap;
  word-wrap: break-word;
  box-sizing: border-box;
}

:deep(.md-editor-preview code) {
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
}

/* 图片样式优化 */
:deep(.md-editor-preview img) {
  max-width: 100%;
  height: auto;
  box-sizing: border-box;
}

/* 链接样式优化 */
:deep(.md-editor-preview a) {
  word-wrap: break-word;
  word-break: break-all;
  overflow-wrap: break-word;
}

/* 明亮主题下的md-editor样式 */
:deep(.md-editor) {
  --md-color: inherit;
  --md-hover-color: inherit;
  --md-bk-color: transparent;
  --md-bk-color-outstand: rgba(0, 0, 0, 0.05);
  --md-bk-hover-color: rgba(0, 0, 0, 0.1);
  --md-border-color: rgba(0, 0, 0, 0.15);
  --md-border-hover-color: rgba(0, 0, 0, 0.2);
  --md-border-active-color: rgba(0, 0, 0, 0.3);
}

/* 暗黑主题下的md-editor样式 */
.v-theme--dark :deep(.md-editor),
[data-theme="dark"] :deep(.md-editor) {
  --md-color: rgba(255, 255, 255, 0.87);
  --md-hover-color: rgba(255, 255, 255, 0.95);
  --md-bk-color: transparent;
  --md-bk-color-outstand: rgba(255, 255, 255, 0.05);
  --md-bk-hover-color: rgba(255, 255, 255, 0.1);
  --md-border-color: rgba(255, 255, 255, 0.15);
  --md-border-hover-color: rgba(255, 255, 255, 0.2);
  --md-border-active-color: rgba(255, 255, 255, 0.3);
}

:deep(.md-editor-preview .md-editor-code .md-editor-code-head) {
  z-index: 0;
}

/* 表格样式优化 */
:deep(.md-editor-preview table) {
  border-collapse: collapse;
  background: transparent !important;
  max-width: 100%;
  width: 100%;
  table-layout: fixed; /* 固定表格布局，防止超出容器 */
  word-wrap: break-word;
}

:deep(.md-editor-preview table th),
:deep(.md-editor-preview table td) {
  border: 1px solid var(--md-border-color) !important;
  background: transparent !important;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 0; /* 配合table-layout: fixed使用 */
}

:deep(.md-editor-preview table th) {
  background: var(--md-bk-color-outstand) !important;
}

/* 引用块样式优化 */
:deep(.md-editor-preview blockquote) {
  background: var(--md-bk-color-outstand) !important;
  border-left: 4px solid var(--md-border-active-color) !important;
  margin: 16px 0;
  padding: 12px 16px;
  border-radius: 0 6px 6px 0;
}

/* 工具调用样式 */
.tool-calls-container {
  margin-top: 8px;
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.tool-call-card {
  border: 1px solid rgba(var(--v-theme-primary), 0.3);
  background-color: rgba(var(--v-theme-primary), 0.05);
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.tool-call-item {
  margin-bottom: 12px;
}

.tool-call-item:last-child {
  margin-bottom: 0;
}

.tool-arguments {
  margin-top: 8px;
}

.tool-arguments pre {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: auto;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-result-container {
  margin-top: 8px;
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.tool-result-card {
  border: 1px solid rgba(var(--v-theme-success), 0.3);
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.tool-result-card pre {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  overflow-x: auto;
  max-width: 100%;
  box-sizing: border-box;
}

/* 新的工具调用tab样式 */
.tool-tabs-container {
  margin-top: 8px;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 8px;
  overflow: hidden;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-tabs-header {
  background-color: rgba(var(--v-theme-primary), 0.05);
  padding: 8px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.2);
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-tabs-content {
  padding: 12px;
}

.tool-call-detail {
  margin-bottom: 16px;
}

.tool-call-detail:last-child {
  margin-bottom: 0;
}

.tool-call-name {
  font-weight: 600;
  color: rgba(var(--v-theme-primary));
  margin-bottom: 8px;
}

.tool-call-id {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 8px;
}

.tool-call-args {
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 4px;
  padding: 8px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  max-width: 100%;
  overflow-x: auto;
  word-wrap: break-word;
  word-break: break-word;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.tool-result-detail {
  margin-bottom: 16px;
}

.tool-result-detail:last-child {
  margin-bottom: 0;
}

.tool-result-id {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 8px;
}

.tool-result-content {
  background-color: rgba(var(--v-theme-success), 0.1);
  border: 1px solid rgba(var(--v-theme-success), 0.3);
  border-radius: 4px;
  padding: 8px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}



/* 适配小屏幕 */
@media (max-width: 600px) {
  .message {
    max-width: 95%;
  }
  
  .message-container {
    padding: 8px;
  }
  
  .input-container {
    padding: 8px;
  }
  
  .tool-arguments pre,
  .tool-result-card pre {
    font-size: 0.7rem;
  }
}
</style>