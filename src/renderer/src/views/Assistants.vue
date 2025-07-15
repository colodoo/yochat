<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAssistantStore } from '../stores/assistant'
import { useModelStore } from '../stores/model'
import { useSettingStore } from '../stores/setting'

const assistantStore = useAssistantStore()
const modelStore = useModelStore()
const settingStore = useSettingStore()

// 状态变量
const dialog = ref(false)
const editMode = ref(false)
const loading = ref(false)
const formValid = ref(true)
const formRef = ref<any>(null)
const snackbar = ref(false)
const snackbarText = ref('')

// 删除确认对话框
const confirmDialog = ref(false)
const assistantToDelete = ref<string | null>(null)
const assistantNameToDelete = ref('')

// 表单数据
const form = ref({
  id: '',
  name: '',
  model_id: '',
  system_prompt: '你是一个有用的AI助手。',
  agent_type: 'direct'
})

// Agent类型选项
const agentTypeOptions = [
  {
    value: 'direct',
    title: '直接对话',
    description: '简单直接的对话模式，适合一般聊天和问答'
  },
  {
    value: 'react',
    title: '推理行动',
    description: '具备推理和行动能力，能够分析问题并使用工具解决复杂任务'
  },
  {
    value: 'reflexion',
    title: '反思改进',
    description: '能够反思和改进回答，通过自我评估提供更准确的结果'
  },
  {
    value: 'plan_solve',
    title: '规划解决',
    description: '先制定计划再执行，适合需要多步骤解决的复杂问题'
  }
]

// 计算属性：获取模型列表作为选项
const modelOptions = computed(() => {
  return modelStore.models.map(model => ({
    value: model.id,
    title: `${model.name} (${model.model_name})`
  }))
})

// 计算属性：当前选中的助手
const currentAssistant = computed(() => assistantStore.currentAssistant)

// 初始化数据
onMounted(async () => {
  await Promise.all([
    loadAssistants(),
    modelStore.loadModels(),
    settingStore.loadSettings()
  ])
})

// 加载助手列表
async function loadAssistants() {
  loading.value = true
  try {
    await assistantStore.loadAssistants()
  } catch (error) {
    console.error('加载助手失败:', error)
  } finally {
    loading.value = false
  }
}

// 打开创建助手对话框
function openCreateDialog() {
  editMode.value = false
  resetForm()
  dialog.value = true
  
  // 在下一个事件循环中聚焦到名称输入框
  setTimeout(() => {
    const nameInput = document.querySelector('input[name="assistant-name"]') as HTMLInputElement
    if (nameInput) {
      nameInput.focus()
    }
  }, 100)
}

// 打开编辑助手对话框
function openEditDialog(assistant: any) {
  editMode.value = true
  form.value = { ...assistant }
  dialog.value = true
}

// 重置表单
function resetForm() {
  // 获取默认模型ID
  const defaultModelId = settingStore.getSetting('default_model_id', '')
  // 如果有默认模型且该模型存在，则使用默认模型，否则使用第一个模型
  const modelId = defaultModelId && modelStore.models.some(m => m.id === defaultModelId)
    ? defaultModelId
    : modelStore.models.length > 0 ? modelStore.models[0].id : ''
  
  form.value = {
    id: '',
    name: '',
    model_id: modelId,
    system_prompt: '你是一个有用的AI助手。',
    agent_type: 'direct'
  }
}

// 保存助手
async function saveAssistant() {
  // 使用表单ref进行验证
  if (!formRef.value) return
  const { valid } = await formRef.value.validate()
  if (!valid) return
  
  loading.value = true
  try {
    if (editMode.value) {
      // 更新现有助手
      const { id, ...assistantData } = form.value
      await assistantStore.updateAssistant(id, assistantData)
      snackbarText.value = `助手 "${form.value.name}" 已更新`
    } else {
      // 创建新助手
      const newAssistantData = {
        name: form.value.name,
        model_id: form.value.model_id, // 添加model_id字段
        system_prompt: form.value.system_prompt || '你是一个有用的AI助手。',
        agent_type: form.value.agent_type || 'direct'
      }
      await assistantStore.createAssistant(newAssistantData)
      snackbarText.value = `助手 "${form.value.name}" 已创建`
      // 重置表单
      resetForm()
    }
    dialog.value = false
    // 显示成功提示
    snackbar.value = true
    // 重新加载助手列表以确保显示最新数据
    await loadAssistants()
  } catch (error) {
    console.error('保存助手失败:', error)
    snackbarText.value = '保存助手失败，请检查输入并重试。'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

// 打开删除确认对话框
function openDeleteDialog(id: string) {
  const assistant = assistantStore.assistants.find(a => a.id === id)
  if (assistant) {
    assistantToDelete.value = id
    assistantNameToDelete.value = assistant.name
    confirmDialog.value = true
  }
}

// 删除助手
async function deleteAssistant() {
  if (!assistantToDelete.value) return
  
  loading.value = true
  try {
    const id = assistantToDelete.value
    const assistantName = assistantNameToDelete.value
    
    await assistantStore.deleteAssistant(id)
    
    // 显示成功提示
    snackbarText.value = `助手 "${assistantName}" 已删除`
    snackbar.value = true
    
    // 关闭确认对话框
    confirmDialog.value = false
    assistantToDelete.value = null
  } catch (error) {
    console.error('删除助手失败:', error)
    snackbarText.value = '删除助手失败，请重试。'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

// 设置当前助手
async function setCurrentAssistant(id: string) {
  try {
    await assistantStore.setCurrentAssistant(id)
    
    // 获取助手名称用于提示
    const assistant = assistantStore.assistants.find(a => a.id === id)
    const assistantName = assistant ? assistant.name : ''
    
    // 显示成功提示
    snackbarText.value = `已将 "${assistantName}" 设为默认助手`
    snackbar.value = true
  } catch (error) {
    console.error('设置默认助手失败:', error)
    snackbarText.value = '设置默认助手失败，请重试。'
    snackbar.value = true
  }
}

// 导出配置
function exportConfig() {
  try {
    const config = {
      assistants: assistantStore.assistants.map(assistant => ({
        name: assistant.name,
        model_id: assistant.model_id,
        system_prompt: assistant.system_prompt,
        agent_type: assistant.agent_type
      })),
      exportTime: new Date().toISOString(),
      version: '1.0'
    }
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `assistants-config-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    snackbarText.value = '助手配置已导出'
    snackbar.value = true
  } catch (error) {
    console.error('导出配置失败:', error)
    snackbarText.value = '导出配置失败，请重试。'
    snackbar.value = true
  }
}

// 导入配置
function importConfig() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const config = JSON.parse(text)
      
      // 验证配置格式
      if (!config.assistants || !Array.isArray(config.assistants)) {
        throw new Error('无效的配置文件格式')
      }
      
      // 导入助手
      let importedCount = 0
      for (const assistantData of config.assistants) {
        if (assistantData.name && assistantData.model_id && assistantData.system_prompt) {
          try {
            await assistantStore.createAssistant({
              name: assistantData.name,
              model_id: assistantData.model_id,
              system_prompt: assistantData.system_prompt,
              agent_type: assistantData.agent_type || 'direct'
            })
            importedCount++
          } catch (error) {
            console.warn(`导入助手 "${assistantData.name}" 失败:`, error)
          }
        }
      }
      
      // 重新加载助手列表
      await loadAssistants()
      
      snackbarText.value = `成功导入 ${importedCount} 个助手配置`
      snackbar.value = true
    } catch (error) {
      console.error('导入配置失败:', error)
      snackbarText.value = '导入配置失败，请检查文件格式。'
      snackbar.value = true
    }
  }
  input.click()
}
</script>

<template>
  <div class="assistants-container">
    <v-card flat>
      <v-card-title class="d-flex align-center">
        <span class="text-h5">AI助手</span>
        <v-spacer></v-spacer>
        <v-btn color="secondary" variant="outlined" prepend-icon="mdi-upload" @click="importConfig" class="mr-2">
          导入配置
        </v-btn>
        <v-btn color="secondary" variant="outlined" prepend-icon="mdi-download" @click="exportConfig" class="mr-2">
          导出配置
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">
          新建助手
        </v-btn>
      </v-card-title>
      
      <v-card-text>
        <!-- 加载状态 -->
        <v-overlay
          :model-value="loading"
          class="align-center justify-center"
          persistent
        >
          <v-progress-circular
            indeterminate
            color="primary"
          ></v-progress-circular>
        </v-overlay>
        
        <v-container>
          <!-- 助手列表 -->
          <v-row v-if="assistantStore.assistants.length > 0">
            <v-col 
              v-for="assistant in assistantStore.assistants" 
              :key="assistant.id"
              cols="12" sm="6" md="4"
            >
              <v-card
                :class="{'border-primary': assistant.id === currentAssistant?.id}"
                variant="outlined"
                height="100%"
              >
                <v-card-title class="d-flex align-center">
                  <v-avatar color="secondary" class="mr-2">
                    <v-icon>mdi-robot</v-icon>
                  </v-avatar>
                  {{ assistant.name }}
                </v-card-title>
                
                <v-card-text>
                  <div class="text-caption text-grey">
                    <div v-if="modelStore.models.find(m => m.id === assistant.model_id)">
                      <strong>模型:</strong> {{ modelStore.models.find(m => m.id === assistant.model_id)?.name || '未知模型' }}
                    </div>
                    <div class="mt-1">
                      <strong>智能模式:</strong> {{ agentTypeOptions.find(opt => opt.value === assistant.agent_type)?.title || '直接对话' }}
                    </div>
                  </div>
                  
                  <div class="mt-2 text-caption text-grey">
                    <strong>系统提示:</strong>
                    <div class="system-prompt">{{ assistant.system_prompt }}</div>
                  </div>
                </v-card-text>
                
                <v-card-actions>
                  <v-btn
                    variant="text"
                    color="primary"
                    @click="setCurrentAssistant(assistant.id)"
                    :disabled="assistant.id === currentAssistant?.id"
                  >
                    设为默认
                  </v-btn>
                  <v-spacer></v-spacer>
                  <v-btn icon @click="openEditDialog(assistant)">
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn icon @click="openDeleteDialog(assistant.id)">
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>
          
          <!-- 空状态 -->
          <v-row v-else>
            <v-col cols="12" class="text-center">
              <div class="empty-state">
                <v-icon size="64" color="grey-lighten-1">mdi-robot</v-icon>
                <p class="text-h6 mt-4">没有助手</p>
                <p class="text-body-1 text-grey">创建一个AI助手开始聊天</p>
                <v-btn color="primary" class="mt-4" @click="openCreateDialog">
                  创建助手
                </v-btn>
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
    </v-card>
    
    <!-- 创建/编辑助手对话框 -->
    <v-dialog v-model="dialog" max-width="600px">
      <v-card>
        <v-card-title>
          {{ editMode ? '编辑助手' : '创建新助手' }}
        </v-card-title>
        
        <v-card-text>
          <v-form v-model="formValid" ref="formRef" @submit.prevent="saveAssistant">
            <v-container>
              <v-row>
                <!-- 基本信息 -->
                <v-col cols="12">
                  <v-text-field
                    v-model="form.name"
                    label="助手名称"
                    required
                    :rules="[v => !!v || '名称不能为空']"
                    autofocus
                    name="assistant-name"
                  ></v-text-field>
                </v-col>
                
                <v-col cols="12">
                  <v-select
                    v-model="form.model_id"
                    :items="modelOptions"
                    item-title="title"
                    item-value="value"
                    label="选择模型"
                    required
                    :rules="[v => !!v || '请选择模型']"
                    hint="在「模型管理」中可以添加和配置模型"
                    persistent-hint
                  ></v-select>
                </v-col>
                
                <!-- Agent类型选择 -->
                <v-col cols="12">
                  <v-select
                    v-model="form.agent_type"
                    :items="agentTypeOptions"
                    item-title="title"
                    item-value="value"
                    label="智能模式"
                    required
                    :rules="[v => !!v || '请选择智能模式']"
                    hint="选择助手的工作模式，不同模式适用于不同类型的任务"
                    persistent-hint
                  >
                    <template v-slot:item="{ props, item }">
                      <v-list-item v-bind="props">
                        <v-list-item-title>{{ item.raw.title }}</v-list-item-title>
                        <v-list-item-subtitle class="text-caption">{{ item.raw.description }}</v-list-item-subtitle>
                      </v-list-item>
                    </template>
                  </v-select>
                </v-col>
                
                <!-- 系统提示 -->
                <v-col cols="12">
                  <v-textarea
                    v-model="form.system_prompt"
                    label="系统提示"
                    hint="定义助手的行为和能力"
                    persistent-hint
                    rows="4"
                    :rules="[v => !!v || '系统提示不能为空']"
                  ></v-textarea>
                </v-col>
              </v-row>
              <!-- 隐藏的提交按钮，用于支持按Enter键提交表单 -->
              <v-row>
                <v-col cols="12">
                  <v-btn type="submit" style="display: none;"></v-btn>
                </v-col>
              </v-row>
            </v-container>
          </v-form>
        </v-card-text>
        
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" variant="text" @click="dialog = false">取消</v-btn>
          <v-btn 
            color="primary" 
            @click="saveAssistant"
            :disabled="!formValid || loading"
            :loading="loading"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
  
  <!-- 提示消息 -->
  <v-snackbar
    v-model="snackbar"
    :timeout="3000"
    color="success"
    location="top"
  >
    {{ snackbarText }}
    <template v-slot:actions>
      <v-btn
        color="white"
        variant="text"
        @click="snackbar = false"
      >
        关闭
      </v-btn>
    </template>
  </v-snackbar>
  
  <!-- 删除确认对话框 -->
  <v-dialog v-model="confirmDialog" max-width="400px">
    <v-card>
      <v-card-title class="text-h5">
        确认删除
      </v-card-title>
      <v-card-text>
        您确定要删除助手 "{{ assistantNameToDelete }}" 吗？此操作无法撤销。
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="confirmDialog = false">取消</v-btn>
        <v-btn 
          color="error" 
          @click="deleteAssistant"
          :loading="loading"
        >
          删除
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.assistants-container {
  padding: 16px;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.assistants-container .v-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.assistants-container .v-card-text {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

.border-primary {
  border: 2px solid rgb(var(--v-theme-primary));
}

.system-prompt {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>