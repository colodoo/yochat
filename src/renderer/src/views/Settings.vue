<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useSettingStore } from '../stores/setting'
import { useMcpStore } from '../stores/mcp'

const settingStore = useSettingStore()
const mcpStore = useMcpStore()
const loading = ref(false)
const settings = ref<Record<string, string>>({})
const shortcutToggle = ref('')
const themeMode = ref('')
const fontSize = ref('')
const autoStart = ref(false)
const autoUpdate = ref(true)
const snackbar = ref(false)
const snackbarText = ref('')
const activeTab = ref(0)



// MCP服务相关状态
const mcpDialog = ref(false)
const mcpEditMode = ref(false)
const mcpFormValid = ref(true)
const mcpFormRef = ref<any>(null)
const mcpConfirmDialog = ref(false)
const mcpServiceToDelete = ref<string | null>(null)
const mcpServiceNameToDelete = ref('')
const importDialog = ref(false)
const importJsonConfig = ref('')
const importError = ref('')


// MCP服务表单数据
const mcpForm = ref({
  id: '',
  name: '',
  type: 'stdio',
  command: '',
  args: '',
  request_url: '',
  request_headers: '',
  config: ''
})

// MCP服务类型选项
const mcpTypes = [
  { value: 'stdio', title: 'Standard IO' },
  { value: 'http', title: 'HTTP API' }
]

// 初始化数据
onMounted(async () => {
  await loadSettings()
  await loadMcpServices()
})

// 加载设置
async function loadSettings() {
  loading.value = true
  try {
    await settingStore.loadSettings()
    settings.value = settingStore.settings
    shortcutToggle.value = settingStore.getSetting('shortcut_toggle') || 'CommandOrControl+Shift+Space'
    themeMode.value = settingStore.getSetting('theme') || 'light'
    fontSize.value = settingStore.getSetting('font_size') || 'medium'
    autoStart.value = settingStore.getSetting('auto_start') === 'true'
    autoUpdate.value = settingStore.getSetting('auto_update') !== 'false'

  } catch (error) {
    console.error('加载设置失败:', error)
    showSnackbar('加载设置失败，请重试')
  } finally {
    loading.value = false
  }
}



// 加载MCP服务列表
async function loadMcpServices() {
  try {
    await mcpStore.loadMcpServices()
  } catch (error) {
    console.error('加载MCP服务失败:', error)
    showSnackbar('加载MCP服务失败，请重试')
  }
}

// 更新快捷键设置
async function updateShortcut() {
  if (!shortcutToggle.value) return
  
  loading.value = true
  try {
    await settingStore.updateSetting('shortcut_toggle', shortcutToggle.value)
    showSnackbar('快捷键设置已更新，重启应用后生效')
  } catch (error) {
    console.error('更新快捷键失败:', error)
    showSnackbar('更新快捷键失败，请重试')
  } finally {
    loading.value = false
  }
}

// 切换主题
async function updateTheme() {
  loading.value = true
  try {
    await settingStore.toggleTheme(themeMode.value)
    showSnackbar(`已切换到${themeMode.value === 'light' ? '浅色' : '深色'}主题`)
  } catch (error) {
    console.error('切换主题失败:', error)
    showSnackbar('切换主题失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新字体大小
async function updateFontSize() {
  loading.value = true
  try {
    await settingStore.updateSetting('font_size', fontSize.value)
    document.documentElement.setAttribute('data-font-size', fontSize.value)
    showSnackbar('字体大小设置已更新')
  } catch (error) {
    console.error('更新字体大小失败:', error)
    showSnackbar('更新字体大小失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新自动启动设置
async function updateAutoStart() {
  loading.value = true
  try {
    await settingStore.updateSetting('auto_start', autoStart.value.toString())
    showSnackbar(`已${autoStart.value ? '开启' : '关闭'}开机自启动`)
  } catch (error) {
    console.error('更新自动启动设置失败:', error)
    showSnackbar('更新自动启动设置失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新自动更新设置
async function updateAutoUpdate() {
  loading.value = true
  try {
    await settingStore.updateSetting('auto_update', autoUpdate.value.toString())
    showSnackbar(`已${autoUpdate.value ? '开启' : '关闭'}自动更新`)
  } catch (error) {
    console.error('更新自动更新设置失败:', error)
    showSnackbar('更新自动更新设置失败，请重试')
  } finally {
    loading.value = false
  }
}

// 显示提示信息
function showSnackbar(text: string) {
  snackbarText.value = text
  snackbar.value = true
}

// 打开GitHub链接
function openGitHubLink() {
  (window as any).electron.ipcRenderer.send('open-external-link', 'https://github.com/yourusername/yochat')
}



// 打开创建MCP服务对话框
function openCreateMcpDialog() {
  mcpEditMode.value = false
  resetMcpForm()
  mcpDialog.value = true
  
  // 在下一个事件循环中聚焦到名称输入框
  setTimeout(() => {
    const nameInput = document.querySelector('input[name="mcp-name"]') as HTMLInputElement
    if (nameInput) {
      nameInput.focus()
    }
  }, 100)
}

// 打开编辑MCP服务对话框
function openEditMcpDialog(service: any) {
  mcpEditMode.value = true
  mcpForm.value = { ...service }
  mcpDialog.value = true
}

// 重置MCP服务表单
function resetMcpForm() {
  mcpForm.value = {
    id: '',
    name: '',
    type: 'stdio',
    command: '',
    args: '',
    request_url: '',
    request_headers: '',
    config: ''
  }
}

// 保存MCP服务
async function saveMcpService() {
  // 使用表单ref进行验证
  if (!mcpFormRef.value) return
  const { valid } = await mcpFormRef.value.validate()
  if (!valid) return
  
  loading.value = true
  try {
    // 移除验证步骤，直接保存
    // await mcpStore.validateMcpService(mcpForm.value)
    
    if (mcpEditMode.value) {
      // 更新现有MCP服务
      const { id, ...serviceData } = mcpForm.value
      await mcpStore.updateMcpService(id, serviceData)
      snackbarText.value = `MCP服务 "${mcpForm.value.name}" 已更新`
    } else {
      // 创建新MCP服务
      const newServiceData = {
        name: mcpForm.value.name,
        type: mcpForm.value.type,
        command: mcpForm.value.command || '',
        args: mcpForm.value.args || '',
        request_url: mcpForm.value.request_url || '',
        request_headers: mcpForm.value.request_headers || '',
        config: mcpForm.value.config || ''
      }
      await mcpStore.createMcpService(newServiceData)
      snackbarText.value = `MCP服务 "${mcpForm.value.name}" 已创建`
      // 重置表单
      resetMcpForm()
    }
    mcpDialog.value = false
    // 显示成功提示
    snackbar.value = true
    // 重新加载MCP服务列表以确保显示最新数据
    await loadMcpServices()
  } catch (error) {
    console.error('保存MCP服务失败:', error)
    snackbarText.value = '保存MCP服务失败，请检查输入并重试。'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

// 打开删除MCP服务确认对话框
function openDeleteMcpDialog(id: string) {
  const service = mcpStore.mcpServices.find(s => s.id === id)
  if (service) {
    mcpServiceToDelete.value = id
    mcpServiceNameToDelete.value = service.name
    mcpConfirmDialog.value = true
  }
}

// 删除MCP服务
async function deleteMcpService() {
  if (!mcpServiceToDelete.value) return
  
  loading.value = true
  try {
    const id = mcpServiceToDelete.value
    const serviceName = mcpServiceNameToDelete.value
    
    await mcpStore.deleteMcpService(id)
    
    // 显示成功提示
    snackbarText.value = `MCP服务 "${serviceName}" 已删除`
    snackbar.value = true
    
    // 关闭确认对话框
    mcpConfirmDialog.value = false
    mcpServiceToDelete.value = null
  } catch (error) {
    console.error('删除MCP服务失败:', error)
    snackbarText.value = '删除MCP服务失败，请重试。'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

// 打开导入MCP服务对话框
function openImportDialog() {
  importJsonConfig.value = ''
  importError.value = ''
  importDialog.value = true
}

// 导入MCP服务
async function importMcpService() {
  if (!importJsonConfig.value) {
    importError.value = '请输入有效的JSON配置'
    return
  }
  
  loading.value = true
  try {
    // 尝试解析JSON以验证格式
    const jsonData = JSON.parse(importJsonConfig.value)
    
    // 处理Model Context Protocol格式
    // 例如: { "mcpServers": { "filesystem": { "command": "npx", "args": [ "-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Desktop", "/Users/username/Downloads" ] } } }
    let processedConfig = importJsonConfig.value
    
    if (jsonData.mcpServers) {
      // 转换MCP服务格式
      const mcpServers = jsonData.mcpServers
      const serverName = Object.keys(mcpServers)[0] // 获取第一个服务名称
      
      if (serverName && mcpServers[serverName]) {
        const serverConfig = mcpServers[serverName]
        // 将args数组转换为换行分隔的字符串格式，便于手动维护
        let argsString = '';
        if (serverConfig.args && Array.isArray(serverConfig.args)) {
          argsString = serverConfig.args.join('\n');
        }
        
        const processedData = {
          name: serverName,
          type: 'stdio', // 默认为stdio类型
          command: serverConfig.command || '',
          args: argsString
        }
        
        processedConfig = JSON.stringify(processedData)
      }
    }
    
    await mcpStore.importMcpService(processedConfig)
    importDialog.value = false
    snackbarText.value = 'MCP服务导入成功'
    snackbar.value = true
    await loadMcpServices()
  } catch (error) {
    console.error('导入MCP服务失败:', error)
    importError.value = '导入失败，请检查JSON格式是否正确'
  } finally {
    loading.value = false
  }
}

// 计算标签页标题
const tabTitles = computed(() => [
  { title: '常规设置', icon: 'mdi-cog-outline' },
  { title: 'MCP配置', icon: 'mdi-puzzle' },
  { title: '快捷键', icon: 'mdi-keyboard' },
  { title: '关于', icon: 'mdi-information' }
])
</script>

<template>
  <div class="settings-container">
    <div class="d-flex settings-layout">
      <!-- 左侧标签页 -->
      <div class="settings-tabs">
        <v-list density="compact" nav>
          <v-list-item
            v-for="(tab, index) in tabTitles"
            :key="index"
            :value="index"
            :active="activeTab === index"
            @click="activeTab = index"
            class="text-body-2"
          >
            <template v-slot:prepend>
              <v-icon size="small">{{ tab.icon }}</v-icon>
            </template>
            <v-list-item-title>{{ tab.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </div>
      
      <!-- 右侧内容区 -->
      <div class="settings-content">
        <v-card flat class="h-100 w-100">
          <v-card-title class="text-h6 mb-2">{{ tabTitles[activeTab].title }}</v-card-title>
          
          <v-card-text>
            <v-window v-model="activeTab">
          <!-- 常规设置 -->
          <v-window-item :value="0">
            <v-list>
              <!-- 主题设置 -->
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-theme-light-dark</v-icon>
                </template>
                <v-list-item-title class="text-body-2">主题模式</v-list-item-title>
                <template v-slot:append>
                  <v-switch
                    v-model="themeMode"
                    :label="themeMode === 'dark' ? '深色' : '浅色'"
                    true-value="dark"
                    false-value="light"
                    hide-details
                    density="compact"
                    @update:model-value="updateTheme"
                    :loading="loading"
                  ></v-switch>
                </template>
              </v-list-item>
              
              <!-- 字体大小设置 -->
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-format-size</v-icon>
                </template>
                <v-list-item-title class="text-body-2">字体大小</v-list-item-title>
                <template v-slot:append>
                  <v-select
                    v-model="fontSize"
                    :items="[{title: '小', value: 'small'}, {title: '中', value: 'medium'}, {title: '大', value: 'large'}, {title: '特大', value: 'x-large'}]"
                    item-title="title"
                    item-value="value"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="font-size-select"
                    @update:model-value="updateFontSize"
                    :loading="loading"
                  ></v-select>
                </template>
              </v-list-item>
              
              <!-- 自动启动设置 -->
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-power</v-icon>
                </template>
                <v-list-item-title class="text-body-2">开机自启动</v-list-item-title>
                <template v-slot:append>
                  <v-switch
                    v-model="autoStart"
                    hide-details
                    density="compact"
                    @update:model-value="updateAutoStart"
                    :loading="loading"
                  ></v-switch>
                </template>
              </v-list-item>
              
              <!-- 自动更新设置 -->
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-update</v-icon>
                </template>
                <v-list-item-title class="text-body-2">自动更新</v-list-item-title>
                <template v-slot:append>
                  <v-switch
                    v-model="autoUpdate"
                    hide-details
                    density="compact"
                    @update:model-value="updateAutoUpdate"
                    :loading="loading"
                  ></v-switch>
                </template>
              </v-list-item>
            </v-list>
          </v-window-item>
          

          
          <!-- MCP配置 -->
          <v-window-item :value="1">
            <v-alert
              type="info"
              variant="tonal"
              density="compact"
              class="mb-4 text-body-2"
            >
              MCP（模型控制协议）配置允许您连接外部工具和数据源，通过标准IO或HTTP API与大语言模型交互
            </v-alert>
            
            <v-card flat>
              <v-card-title class="d-flex align-center">
                <span class="text-h6">MCP服务管理</span>
                <v-spacer></v-spacer>
                <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateMcpDialog" class="mr-2">
                  新建服务
                </v-btn>
                <v-btn color="secondary" prepend-icon="mdi-import" @click="openImportDialog">
                  导入配置
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
                  <!-- MCP服务列表 -->
                  <v-row v-if="mcpStore.mcpServices.length > 0">
                    <v-col 
                      v-for="service in mcpStore.mcpServices" 
                      :key="service.id"
                      cols="12" sm="6" md="4"
                    >
                      <v-card
                        variant="outlined"
                        height="100%"
                      >
                        <v-card-title class="d-flex align-center">
                          <v-avatar color="primary" class="mr-2">
                            <v-icon>{{ service.type === 'stdio' ? 'mdi-console' : 'mdi-api' }}</v-icon>
                          </v-avatar>
                          {{ service.name }}
                          <v-chip
                            :color="service.type === 'stdio' ? 'info' : 'success'"
                            size="small"
                            class="ml-2"
                          >
                            {{ service.type === 'stdio' ? 'Standard IO' : 'HTTP API' }}
                          </v-chip>
                        </v-card-title>
                        
                        <v-card-text>
                          <div class="text-caption text-grey">
                            <div v-if="service.type === 'stdio'">
                              <div><strong>命令:</strong> {{ service.command || '未指定' }}</div>
                              <div v-if="service.args"><strong>参数:</strong> {{ service.args }}</div>
                            </div>
                            <div v-else>
                              <div><strong>请求URL:</strong> {{ service.request_url || '未指定' }}</div>
                            </div>
                          </div>
                        </v-card-text>
                        
                        <v-card-actions>
                          <v-spacer></v-spacer>
                          <v-btn icon @click="openEditMcpDialog(service)">
                            <v-icon>mdi-pencil</v-icon>
                          </v-btn>
                          <v-btn icon @click="openDeleteMcpDialog(service.id)">
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
                        <v-icon size="64" color="grey-lighten-1">mdi-puzzle-outline</v-icon>
                        <p class="text-h6 mt-4">没有MCP服务</p>
                        <p class="text-body-1 text-grey">创建一个MCP服务以连接外部工具和数据源</p>
                        <div class="d-flex justify-center gap-2 mt-4">
                          <v-btn color="primary" @click="openCreateMcpDialog">
                            创建服务
                          </v-btn>
                          <v-btn color="secondary" @click="openImportDialog">
                            导入配置
                          </v-btn>
                        </div>
                      </div>
                    </v-col>
                  </v-row>
                </v-container>
              </v-card-text>
            </v-card>
          </v-window-item>
          
          <!-- 快捷键 -->
          <v-window-item :value="2">
            <v-list>
              <!-- 迷你窗口快捷键 -->
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-keyboard</v-icon>
                </template>
                <v-list-item-title class="text-body-2">迷你窗口快捷键</v-list-item-title>
                <template v-slot:append>
                  <v-text-field
                    v-model="shortcutToggle"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="shortcut-input"
                    @blur="updateShortcut"
                    :loading="loading"
                  ></v-text-field>
                </template>
              </v-list-item>
            </v-list>
          </v-window-item>
          
          <!-- 关于 -->
          <v-window-item :value="3">
            <v-list>
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-information</v-icon>
                </template>
                <v-list-item-title class="text-body-2">YoChat</v-list-item-title>
                <v-list-item-subtitle class="text-caption">版本 0.1.0</v-list-item-subtitle>
              </v-list-item>
              
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-github</v-icon>
                </template>
                <v-list-item-title class="text-body-2">
                  <a href="#" @click.prevent="openGitHubLink">
                    GitHub 仓库
                  </a>
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-window-item>
            </v-window>
          </v-card-text>
        </v-card>
      </div>
    </div>
    
    <!-- 提示消息 -->
  <v-snackbar v-model="snackbar" :timeout="3000">
    {{ snackbarText }}
    <template v-slot:actions>
      <v-btn color="primary" variant="text" @click="snackbar = false">关闭</v-btn>
    </template>
  </v-snackbar>
  

  
  <!-- 创建/编辑MCP服务对话框 -->
  <v-dialog v-model="mcpDialog" max-width="600px">
    <v-card>
      <v-card-title>
        {{ mcpEditMode ? '编辑MCP服务' : '创建新MCP服务' }}
      </v-card-title>
      
      <v-card-text>
        <v-form v-model="mcpFormValid" ref="mcpFormRef" @submit.prevent="saveMcpService">
          <v-container>
            <v-row>
              <!-- 基本信息 -->
              <v-col cols="12">
                <v-text-field
                  v-model="mcpForm.name"
                  label="服务名称"
                  required
                  :rules="[v => !!v || '名称不能为空']"
                  autofocus
                  name="mcp-name"
                ></v-text-field>
              </v-col>
              
              <v-col cols="12">
                <v-select
                  v-model="mcpForm.type"
                  :items="mcpTypes"
                  item-title="title"
                  item-value="value"
                  label="服务类型"
                  required
                  :rules="[v => !!v || '请选择服务类型']"
                ></v-select>
              </v-col>
              
              <!-- Standard IO 设置 -->
              <template v-if="mcpForm.type === 'stdio'">
                <v-col cols="12">
                  <v-text-field
                    v-model="mcpForm.command"
                    label="命令"
                    hint="执行的命令路径"
                    persistent-hint
                    :rules="[v => !!v || '命令不能为空']"
                  ></v-text-field>
                </v-col>
                
                <v-col cols="12">
                  <v-text-field
                    v-model="mcpForm.args"
                    label="参数"
                    hint="命令参数，多个参数用空格分隔"
                    persistent-hint
                  ></v-text-field>
                </v-col>
              </template>
              
              <!-- HTTP API 设置 -->
              <template v-else>
                <v-col cols="12">
                  <v-text-field
                    v-model="mcpForm.request_url"
                    label="请求URL"
                    hint="HTTP API的URL地址"
                    persistent-hint
                    :rules="[v => !!v || '请求URL不能为空']"
                  ></v-text-field>
                </v-col>
                
                <v-col cols="12">
                  <v-textarea
                    v-model="mcpForm.request_headers"
                    label="请求头"
                    hint="HTTP请求头，JSON格式"
                    persistent-hint
                    rows="3"
                    auto-grow
                  ></v-textarea>
                </v-col>
              </template>
              
              <!-- 通用配置 -->
              <v-col cols="12">
                <v-textarea
                  v-model="mcpForm.config"
                  label="配置"
                  hint="MCP服务配置，JSON格式"
                  persistent-hint
                  rows="5"
                  auto-grow
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
        <v-btn color="grey" variant="text" @click="mcpDialog = false">取消</v-btn>
        <v-btn 
          color="primary" 
          @click="saveMcpService"
          :disabled="!mcpFormValid || loading"
          :loading="loading"
        >
          保存
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  
  <!-- 导入MCP服务对话框 -->
  <v-dialog v-model="importDialog" max-width="600px">
    <v-card>
      <v-card-title>导入MCP服务配置</v-card-title>
      
      <v-card-text>
        <v-textarea
          v-model="importJsonConfig"
          label="JSON配置"
          hint="支持标准MCP服务配置或Model Context Protocol格式"
          persistent-hint
          rows="10"
          auto-grow
          :error-messages="importError"
        ></v-textarea>
        <div class="text-caption mt-2">
          <p>支持两种格式:</p>
          <p>1. 标准格式: <code>{ "name": "服务名", "type": "stdio", "command": "命令", ... }</code></p>
          <p>2. MCP格式: <code>{ "mcpServers": { "服务名": { "command": "命令", "args": [...] } } }</code></p>
        </div>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="importDialog = false">取消</v-btn>
        <v-btn 
          color="primary" 
          @click="importMcpService"
          :disabled="!importJsonConfig || loading"
          :loading="loading"
        >
          导入
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  
  <!-- 删除MCP服务确认对话框 -->
  <v-dialog v-model="mcpConfirmDialog" max-width="400px">
    <v-card>
      <v-card-title class="text-h5">
        确认删除
      </v-card-title>
      <v-card-text>
        您确定要删除MCP服务 "{{ mcpServiceNameToDelete }}" 吗？此操作无法撤销。
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="mcpConfirmDialog = false">取消</v-btn>
        <v-btn 
          color="error" 
          @click="deleteMcpService"
          :loading="loading"
        >
          删除
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  </div>
</template>

<style scoped>
.settings-container {
  height: 100%;
  padding: 16px;
  overflow: hidden;
}

.settings-layout {
  height: 100%;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.settings-tabs {
  width: 200px;
  border-right: 1px solid rgba(0, 0, 0, 0.12);
  background-color: rgba(var(--v-theme-surface-variant), 0.1);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
}

.shortcut-input {
  max-width: 200px;
}

/* 适配小屏幕 */
@media (max-width: 600px) {
  .settings-layout {
    flex-direction: column;
  }
  
  .settings-tabs {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  }
  
  .settings-content {
    max-height: calc(100vh - 150px);
  }
}
</style>