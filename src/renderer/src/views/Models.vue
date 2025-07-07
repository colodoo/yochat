<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useModelStore } from '../stores/model'
import { useSettingStore } from '../stores/setting'

const modelStore = useModelStore()
const settingStore = useSettingStore()

// 默认模型ID
const defaultModelId = ref('')

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
const modelToDelete = ref<string | null>(null)
const modelNameToDelete = ref('')

// 表单数据
const form = ref({
  id: '',
  name: '',
  model_type: 'openai',
  api_url: 'https://api.openai.com',
  api_key: '',
  model_name: 'gpt-3.5-turbo',
  default_temperature: 0.7,
  default_max_tokens: 2000
})

// 模型类型默认配置
const modelTypeDefaults = {
  openai: {
    api_url: 'https://api.openai.com',
    model_name: 'gpt-3.5-turbo'
  },
  azure: {
    api_url: 'https://your-resource-name.openai.azure.com',
    model_name: 'gpt-35-turbo'
  },
  anthropic: {
    api_url: 'https://api.anthropic.com',
    model_name: 'claude-3-opus-20240229'
  },
  gemini: {
    api_url: 'https://generativelanguage.googleapis.com',
    model_name: 'gemini-pro'
  },
  ollama: {
    api_url: 'http://localhost:11434',
    model_name: 'llama2'
  },
  custom: {
    api_url: '',
    model_name: ''
  }
}

// 监听模型类型变化，自动更新 API URL 和模型名称
watch(() => form.value.model_type, (newType) => {
  // 只有在创建新模型时才自动更新字段
  if (!editMode.value) {
    const defaults = modelTypeDefaults[newType]
    if (defaults) {
      form.value.api_url = defaults.api_url
      form.value.model_name = defaults.model_name
    }
  }
})

// 模型类型选项
const modelTypes = [
  { value: 'openai', title: 'OpenAI' },
  { value: 'azure', title: 'Azure OpenAI' },
  { value: 'anthropic', title: 'Anthropic Claude' },
  { value: 'gemini', title: 'Google Gemini' },
  { value: 'ollama', title: 'Ollama' },
  { value: 'custom', title: '自定义' }
]

// 初始化数据
onMounted(async () => {
  // 加载设置
  await settingStore.loadSettings()
  defaultModelId.value = settingStore.getSetting('default_model_id', '')
  
  // 加载模型
  await loadModels()
})

// 加载模型列表
async function loadModels() {
  loading.value = true
  try {
    await modelStore.loadModels()
  } catch (error) {
    console.error('加载模型失败:', error)
  } finally {
    loading.value = false
  }
}

// 打开创建模型对话框
function openCreateDialog() {
  editMode.value = false
  resetForm()
  dialog.value = true
  
  // 在下一个事件循环中聚焦到名称输入框
  setTimeout(() => {
    const nameInput = document.querySelector('input[name="model-name"]') as HTMLInputElement
    if (nameInput) {
      nameInput.focus()
    }
  }, 100)
}

// 打开编辑模型对话框
function openEditDialog(model: any) {
  editMode.value = true
  form.value = { ...model }
  dialog.value = true
}

// 重置表单
function resetForm() {
  form.value = {
    id: '',
    name: '',
    model_type: 'openai',
    api_url: 'https://api.openai.com',
    api_key: '',
    model_name: 'gpt-3.5-turbo',
    default_temperature: 0.7,
    default_max_tokens: 2000
  }
}

// 保存模型
async function saveModel() {
  // 使用表单ref进行验证
  if (!formRef.value) return
  const { valid } = await formRef.value.validate()
  if (!valid) return
  
  loading.value = true
  try {
    if (editMode.value) {
      // 更新现有模型
      const { id, ...modelData } = form.value
      await modelStore.updateModel(id, modelData)
      snackbarText.value = `模型 "${form.value.name}" 已更新`
    } else {
      // 创建新模型
      const newModelData = {
        name: form.value.name,
        model_type: form.value.model_type,
        api_url: form.value.api_url || '',
        api_key: form.value.api_key || '',
        model_name: form.value.model_name || 'gpt-3.5-turbo',
        default_temperature: form.value.default_temperature || 0.7,
        default_max_tokens: form.value.default_max_tokens || 2000
      }
      await modelStore.createModel(newModelData)
      snackbarText.value = `模型 "${form.value.name}" 已创建`
      // 重置表单
      resetForm()
    }
    dialog.value = false
    // 显示成功提示
    snackbar.value = true
    // 重新加载模型列表以确保显示最新数据
    await loadModels()
  } catch (error) {
    console.error('保存模型失败:', error)
    snackbarText.value = '保存模型失败，请检查输入并重试。'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

// 打开删除确认对话框
function openDeleteDialog(id: string) {
  const model = modelStore.models.find(m => m.id === id)
  if (model) {
    modelToDelete.value = id
    modelNameToDelete.value = model.name
    confirmDialog.value = true
  }
}

// 设置默认模型
async function setDefaultModel(id: string) {
  loading.value = true
  try {
    // 更新设置
    await settingStore.updateSetting('default_model_id', id)
    defaultModelId.value = id
    
    // 获取模型名称
    const model = modelStore.models.find(m => m.id === id)
    if (model) {
      snackbarText.value = `已将 "${model.name}" 设为默认模型`
    } else {
      snackbarText.value = '已更新默认模型'
    }
    snackbar.value = true
  } catch (error) {
    console.error('设置默认模型失败:', error)
    snackbarText.value = '设置默认模型失败，请重试。'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

// 删除模型
async function deleteModel() {
  if (!modelToDelete.value) return
  
  loading.value = true
  try {
    const id = modelToDelete.value
    const modelName = modelNameToDelete.value
    
    await modelStore.deleteModel(id)
    
    // 如果删除的是默认模型，清除默认模型设置
    if (id === defaultModelId.value) {
      await settingStore.updateSetting('default_model_id', '')
      defaultModelId.value = ''
    }
    
    // 显示成功提示
    snackbarText.value = `模型 "${modelName}" 已删除`
    snackbar.value = true
    
    // 关闭确认对话框
    confirmDialog.value = false
    modelToDelete.value = null
  } catch (error) {
    console.error('删除模型失败:', error)
    snackbarText.value = '删除模型失败，请重试。'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="models-container">
    <v-card flat>
      <v-card-title class="d-flex align-center">
        <span class="text-h5">模型管理</span>
        <v-tooltip text="默认模型将在创建新对话时自动选择">
          <template v-slot:activator="{ props }">
            <v-chip
              v-if="defaultModelId"
              class="ml-3"
              color="success"
              v-bind="props"
            >
              <v-icon start>mdi-check-circle</v-icon>
              已设置默认模型
            </v-chip>
            <v-chip
              v-else
              class="ml-3"
              color="warning"
              v-bind="props"
            >
              <v-icon start>mdi-alert-circle</v-icon>
              未设置默认模型
            </v-chip>
          </template>
        </v-tooltip>
        <v-spacer></v-spacer>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">
          新建模型
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
          <!-- 模型列表 -->
          <v-row v-if="modelStore.models.length > 0">
            <v-col 
              v-for="model in modelStore.models" 
              :key="model.id"
              cols="12" sm="6" md="4"
            >
              <v-card
                variant="outlined"
                height="100%"
                :class="{ 'default-model': model.id === defaultModelId }"
              >
                <v-card-title class="d-flex align-center">
                  <v-avatar :color="model.id === defaultModelId ? 'success' : 'primary'" class="mr-2">
                    <v-icon>{{ model.id === defaultModelId ? 'mdi-check-circle' : 'mdi-cube-outline' }}</v-icon>
                  </v-avatar>
                  {{ model.name }}
                  <v-chip
                    v-if="model.id === defaultModelId"
                    color="success"
                    size="small"
                    class="ml-2"
                  >
                    默认
                  </v-chip>
                </v-card-title>
                
                <v-card-text>
                  <div class="text-caption text-grey">
                    <div><strong>模型类型:</strong> {{ model.model_type }}</div>
                    <div><strong>模型名称:</strong> {{ model.model_name || '未指定' }}</div>
                    <div><strong>默认温度:</strong> {{ model.default_temperature }}</div>
                    <div><strong>默认最大令牌:</strong> {{ model.default_max_tokens }}</div>
                  </div>
                </v-card-text>
                
                <v-card-actions>
                  <v-btn
                    v-if="model.id !== defaultModelId"
                    size="small"
                    color="success"
                    variant="text"
                    prepend-icon="mdi-check-circle"
                    @click="setDefaultModel(model.id)"
                  >
                    设为默认
                  </v-btn>
                  <v-spacer></v-spacer>
                  <v-btn icon @click="openEditDialog(model)">
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn icon @click="openDeleteDialog(model.id)">
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
                <v-icon size="64" color="grey-lighten-1">mdi-cube-outline</v-icon>
                <p class="text-h6 mt-4">没有模型</p>
                <p class="text-body-1 text-grey">创建一个模型以便在助手中使用</p>
                <v-btn color="primary" class="mt-4" @click="openCreateDialog">
                  创建模型
                </v-btn>
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
    </v-card>
    
    <!-- 创建/编辑模型对话框 -->
    <v-dialog v-model="dialog" max-width="600px">
      <v-card>
        <v-card-title>
          {{ editMode ? '编辑模型' : '创建新模型' }}
        </v-card-title>
        
        <v-card-text>
          <v-form v-model="formValid" ref="formRef" @submit.prevent="saveModel">
            <v-container>
              <v-row>
                <!-- 基本信息 -->
                <v-col cols="12">
                  <v-text-field
                    v-model="form.name"
                    label="模型名称"
                    required
                    :rules="[v => !!v || '名称不能为空']"
                    autofocus
                    name="model-name"
                  ></v-text-field>
                </v-col>
                
                <v-col cols="12">
                  <v-select
                    v-model="form.model_type"
                    :items="modelTypes"
                    item-title="title"
                    item-value="value"
                    label="模型类型"
                    required
                    :rules="[v => !!v || '请选择模型类型']"
                  ></v-select>
                </v-col>
                
                <!-- API设置 -->
                <v-col cols="12">
                  <v-text-field
                    v-model="form.api_url"
                    label="API URL"
                    hint="API端点地址"
                    persistent-hint
                    :rules="[v => (form.model_type === 'openai' || form.model_type === 'azure' || form.model_type === 'ollama') ? !!v || '此模型类型需要API URL' : true]"
                  ></v-text-field>
                </v-col>
                
                <v-col cols="12">
                  <v-text-field
                    v-model="form.api_key"
                    label="API Key"
                    type="password"
                    hint="您的API密钥"
                    persistent-hint
                    :rules="[v => (form.model_type === 'openai' || form.model_type === 'azure' || form.model_type === 'anthropic' || form.model_type === 'gemini') ? !!v || '需要API密钥' : true]"
                  ></v-text-field>
                </v-col>
                
                <!-- 模型名称 -->
                <v-col cols="12">
                  <v-text-field
                    v-model="form.model_name"
                    label="模型名称"
                    hint="例如：gpt-3.5-turbo, gpt-4, claude-2, gemini-pro, llama2 等"
                    persistent-hint
                    :rules="[v => !!v || '模型名称不能为空']"
                  ></v-text-field>
                </v-col>
                
                <!-- 模型参数 -->
                <v-col cols="12" sm="6">
                  <v-slider
                    v-model="form.default_temperature"
                    label="默认温度"
                    min="0"
                    max="2"
                    step="0.1"
                    thumb-label
                    hint="控制输出的随机性 (0-2)"
                    persistent-hint
                  ></v-slider>
                </v-col>
                
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="form.default_max_tokens"
                    label="默认最大令牌数"
                    type="number"
                    hint="生成文本的最大长度"
                    persistent-hint
                    :rules="[
                      v => !!v || '最大令牌数不能为空',
                      v => v > 0 || '最大令牌数必须大于0'
                    ]"
                  ></v-text-field>
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
            @click="saveModel"
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
        您确定要删除模型 "{{ modelNameToDelete }}" 吗？此操作无法撤销。
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="confirmDialog = false">取消</v-btn>
        <v-btn 
          color="error" 
          @click="deleteModel"
          :loading="loading"
        >
          删除
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.models-container {
  padding: 16px;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.models-container .v-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.models-container .v-card-text {
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

.default-model {
  border: 2px solid rgb(var(--v-theme-success)) !important;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
</style>