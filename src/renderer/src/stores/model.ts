import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Model {
  id: string
  name: string
  model_type: string
  api_url: string
  api_key: string
  model_name: string
  default_temperature: number
  default_max_tokens: number
}

export const useModelStore = defineStore('model', () => {
  // 状态
  const models = ref<Model[]>([])
  const loading = ref(false)
  
  // 加载所有模型
  async function loadModels() {
    loading.value = true
    try {
      const result = await window.api.models.getAll()
      models.value = result
    } catch (error) {
      console.error('加载模型失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }
  
  // 获取单个模型
  async function getModel(id: string) {
    try {
      return await window.api.models.get(id)
    } catch (error) {
      console.error(`获取模型 ${id} 失败:`, error)
      throw error
    }
  }
  
  // 创建新模型
  async function createModel(modelData: Omit<Model, 'id'>) {
    try {
      const id = await window.api.models.create(modelData)
      return id
    } catch (error) {
      console.error('创建模型失败:', error)
      throw error
    }
  }
  
  // 更新模型
  async function updateModel(id: string, modelData: Partial<Omit<Model, 'id'>>) {
    try {
      await window.api.models.update(id, modelData)
    } catch (error) {
      console.error(`更新模型 ${id} 失败:`, error)
      throw error
    }
  }
  
  // 删除模型
  async function deleteModel(id: string) {
    try {
      await window.api.models.delete(id)
      // 从本地状态中移除
      models.value = models.value.filter(model => model.id !== id)
    } catch (error) {
      console.error(`删除模型 ${id} 失败:`, error)
      throw error
    }
  }
  
  return {
    models,
    loading,
    loadModels,
    getModel,
    createModel,
    updateModel,
    deleteModel
  }
})