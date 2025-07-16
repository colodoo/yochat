import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../platform'

export const useAssistantStore = defineStore('assistant', () => {
  // 状态
  const assistants = ref<any[]>([])
  const currentAssistantId = ref<string | null>(null)
  const loading = ref(false)

  // 计算属性
  const currentAssistant = computed(() => {
    if (!currentAssistantId.value) return null
    return assistants.value.find((assistant) => assistant.id === currentAssistantId.value)
  })

  // 加载所有助手
  async function loadAssistants() {
    try {
      loading.value = true
      const result = await api.assistants.getAll()
      assistants.value = result
      
      // 从设置中获取默认助手ID
      const savedAssistantId = await api.settings.get('current_assistant_id')
      
      if (savedAssistantId) {
        // 检查保存的助手ID是否存在于当前助手列表中
        const assistantExists = result.some(assistant => assistant.id === savedAssistantId)
        if (assistantExists) {
          currentAssistantId.value = savedAssistantId
        } else if (result.length > 0) {
          // 如果保存的助手不存在但有其他助手，则选择第一个
          currentAssistantId.value = result[0].id
          // 更新设置中的默认助手ID
          await api.settings.update('current_assistant_id', result[0].id)
        }
      } else if (result.length > 0) {
        // 如果没有保存的助手ID但有助手列表，则选择第一个
        currentAssistantId.value = result[0].id
        // 更新设置中的默认助手ID
        await api.settings.update('current_assistant_id', result[0].id)
      }
    } catch (error) {
      console.error('加载助手失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 设置当前助手
  async function setCurrentAssistant(id: string) {
    try {
      loading.value = true
      currentAssistantId.value = id
      // 持久化存储当前助手ID到设置中
      await api.settings.update('current_assistant_id', id)
      return id
    } catch (error) {
      console.error('设置当前助手失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 创建新助手
  async function createAssistant(assistant: {
    name: string
    model_id?: string // 添加model_id字段
    model_type?: string
    api_url?: string
    api_key?: string
    temperature?: number
    max_tokens?: number
    system_prompt?: string
    agent_type?: string // 添加agent_type字段
  }) {
    try {
      loading.value = true
      const id = await api.assistants.create(assistant)
      await loadAssistants()
      return id
    } catch (error) {
      console.error('创建助手失败:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  // 更新助手
  async function updateAssistant(id: string, assistant: {
    name?: string
    model_id?: string // 添加model_id字段
    model_type?: string
    api_url?: string
    api_key?: string
    temperature?: number
    max_tokens?: number
    system_prompt?: string
    agent_type?: string // 添加agent_type字段
  }) {
    try {
      loading.value = true
      await api.assistants.update(id, assistant)
      await loadAssistants()
    } catch (error) {
      console.error('更新助手失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 删除助手
  async function deleteAssistant(id: string) {
    try {
      loading.value = true
      await api.assistants.delete(id)
      if (currentAssistantId.value === id) {
        const remainingAssistants = assistants.value.filter(a => a.id !== id)
        if (remainingAssistants.length > 0) {
          // 设置新的默认助手并更新到设置中
          currentAssistantId.value = remainingAssistants[0].id
          await api.settings.update('current_assistant_id', remainingAssistants[0].id)
        } else {
          // 如果没有剩余助手，清除默认助手ID
          currentAssistantId.value = null
          await api.settings.update('current_assistant_id', '')
        }
      }
      await loadAssistants()
    } catch (error) {
      console.error('删除助手失败:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    assistants,
    currentAssistantId,
    currentAssistant,
    loading,
    loadAssistants,
    setCurrentAssistant,
    createAssistant,
    updateAssistant,
    deleteAssistant
  }
})