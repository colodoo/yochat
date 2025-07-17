import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useConversationStore = defineStore('conversation', () => {
  // 状态
  const conversations = ref<any[]>([])
  const currentConversationId = ref<number | null>(null)
  const messages = ref<any[]>([])
  const loading = ref(false)

  // 计算属性
  const currentConversation = computed(() => {
    if (!currentConversationId.value) return null
    return conversations.value.find((conv) => conv.id === currentConversationId.value)
  })

  // 加载所有对话
  async function loadConversations() {
    try {
      loading.value = true
      const result = await window.api.conversations.getAll()
      conversations.value = result
    } catch (error) {
      console.error('加载对话失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 加载当前对话的消息
  async function loadMessages(conversationId: number) {
    try {
      loading.value = true
      currentConversationId.value = conversationId
      const result = await window.api.messages.getByConversation(conversationId)
      messages.value = result
    } catch (error) {
      console.error('加载消息失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 创建新对话
  async function createConversation(title: string, assistantId: string) {
    try {
      loading.value = true
      const id = await window.api.conversations.create(title, assistantId)
      await loadConversations()
      return id
    } catch (error) {
      console.error('创建对话失败:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  // 更新对话标题
  async function updateConversationTitle(id: number, title: string) {
    try {
      loading.value = true
      console.log('ConversationStore: updateConversationTitle called with:', { id, title })
      await window.api.conversations.update(id, { title })
      await loadConversations()
      console.log('ConversationStore: 对话标题更新完成')
    } catch (error) {
      console.error('更新对话标题失败:', error)
    } finally {
      loading.value = false
    }
  }
  
  // 更新对话设置
  async function updateConversation(id: number, data: { title?: string, temperature?: number, maxTokens?: number, mcpServices?: string[] }) {
    try {
      loading.value = true
      console.log('ConversationStore: updateConversation called with:', { id, data })
      await window.api.conversations.update(id, data)
      await loadConversations()
    } catch (error) {
      console.error('更新对话设置失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 删除对话
  async function deleteConversation(id: number) {
    try {
      loading.value = true
      await window.api.conversations.delete(id)
      if (currentConversationId.value === id) {
        currentConversationId.value = null
        messages.value = []
      }
      await loadConversations()
    } catch (error) {
      console.error('删除对话失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 添加消息
  async function addMessage(role: string, content: string, toolCalls?: any[], toolCallId?: string) {
    if (!currentConversationId.value) return null

    try {
      const id = await window.api.messages.add(currentConversationId.value, role, content, toolCalls, toolCallId)
      await loadMessages(currentConversationId.value)
      return id
    } catch (error) {
      console.error('添加消息失败:', error)
      return null
    }
  }
  
  // 更新消息内容（用于流式输出）
  function updateMessage(id: number | string, content: string) {
    const messageIndex = messages.value.findIndex(msg => msg.id === id)
    if (messageIndex !== -1) {
      messages.value[messageIndex].content = content
    }
  }

  // 清空对话消息
  async function clearMessages() {
    if (!currentConversationId.value) return

    try {
      loading.value = true
      await window.api.messages.deleteAll(currentConversationId.value)
      messages.value = []
    } catch (error) {
      console.error('清空消息失败:', error)
    } finally {
      loading.value = false
    }
  }
  
  // 删除单条消息
  async function deleteMessage(messageId: number) {
    try {
      loading.value = true
      await window.api.messages.delete(messageId)
      // 从本地状态中移除该消息
      messages.value = messages.value.filter(msg => msg.id !== messageId)
    } catch (error) {
      console.error('删除消息失败:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    conversations,
    currentConversationId,
    messages,
    loading,
    currentConversation,
    loadConversations,
    loadMessages,
    createConversation,
    updateConversationTitle,
    updateConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    clearMessages,
    deleteMessage
  }
})