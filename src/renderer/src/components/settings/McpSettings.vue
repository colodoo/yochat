<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMcpStore } from '../../stores/mcp'
import { Puzzle, Plus, Import, Terminal, Globe, Link, Edit3, Trash2 } from 'lucide-vue-next'

const mcpStore = useMcpStore()
const loading = ref(false)

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
  env: '',
  request_url: '',
  request_headers: '',
  config: '',
  status: 'unknown'
})

// MCP服务类型选项
const mcpTypes = [
  { value: 'stdio', title: 'Standard IO' },
  { value: 'http', title: 'HTTP API' }
]

// 定义事件
const emit = defineEmits<{
  showSnackbar: [text: string]
}>()

// 初始化数据
onMounted(async () => {
  await loadMcpServices()
})

// 加载MCP服务列表
async function loadMcpServices() {
  try {
    await mcpStore.loadMcpServices()
  } catch (error) {
    console.error('加载MCP服务失败:', error)
    emit('showSnackbar', '加载MCP服务失败，请重试')
  }
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
    env: '',
    request_url: '',
    request_headers: '',
    config: '',
    status: 'unknown'
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
    if (mcpEditMode.value) {
      // 更新现有MCP服务
      const { id, ...serviceData } = mcpForm.value
      await mcpStore.updateMcpService(id, serviceData)
      emit('showSnackbar', `MCP服务 "${mcpForm.value.name}" 已更新`)
    } else {
      // 创建新MCP服务
      const newServiceData = {
        name: mcpForm.value.name,
        type: mcpForm.value.type,
        command: mcpForm.value.command || '',
        args: mcpForm.value.args || '',
        env: mcpForm.value.env || '',
        request_url: mcpForm.value.request_url || '',
        request_headers: mcpForm.value.request_headers || '',
        config: mcpForm.value.config || '',
        status: mcpForm.value.status || 'unknown'
      }
      await mcpStore.createMcpService(newServiceData)
      emit('showSnackbar', `MCP服务 "${mcpForm.value.name}" 已创建`)
      // 重置表单
      resetMcpForm()
    }
    mcpDialog.value = false
    // 重新加载MCP服务列表以确保显示最新数据
    await loadMcpServices()
  } catch (error) {
    console.error('保存MCP服务失败:', error)
    emit('showSnackbar', '保存MCP服务失败，请检查输入并重试。')
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
    emit('showSnackbar', `MCP服务 "${serviceName}" 已删除`)
    
    // 关闭确认对话框
    mcpConfirmDialog.value = false
    mcpServiceToDelete.value = null
  } catch (error) {
    console.error('删除MCP服务失败:', error)
    emit('showSnackbar', '删除MCP服务失败，请重试。')
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
    console.info('jsonData', jsonData)
    
    // 处理Model Context Protocol格式
    // 例如: { "mcpServers": { "filesystem": { "command": "npx", "args": [ "-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Desktop", "/Users/username/Downloads" ], "env": { "PATH": "/usr/bin" } } } }
    let processedConfig = importJsonConfig.value
    
    if (jsonData.mcpServers) {
      // 转换MCP服务格式
      const mcpServers = jsonData.mcpServers
      console.log('mcpServers', mcpServers)
      const serverName = Object.keys(mcpServers)[0] // 获取第一个服务名称
      
      if (serverName && mcpServers[serverName]) {
        const serverConfig = mcpServers[serverName]
        // 将args数组转换为换行分隔的字符串格式，便于手动维护
        let argsString = '';
        if (serverConfig.args && Array.isArray(serverConfig.args)) {
          argsString = serverConfig.args.join('\n');
        }
        
        // 处理env字段
        let envString = '';
        if (serverConfig.env) {
          if (typeof serverConfig.env === 'object') {
            envString = Object.entries(serverConfig.env)
              .map(([key, value]) => `${key}=${value}`)
              .join('\n');
          } else if (typeof serverConfig.env === 'string') {
            envString = serverConfig.env;
          }
        }
        
        const processedData = {
          name: serverName,
          type: 'stdio', // 默认为stdio类型
          command: serverConfig.command || '',
          args: argsString,
          env: envString
        }
        
        processedConfig = JSON.stringify(processedData)
      }
    }
    console.info('processedConfig', processedConfig)
    await mcpStore.importMcpService(processedConfig)
    importDialog.value = false
    emit('showSnackbar', 'MCP服务导入成功')
    await loadMcpServices()
  } catch (error) {
    console.error('导入MCP服务失败:', error)
    importError.value = '导入失败，请检查JSON格式是否正确'
  } finally {
    loading.value = false
  }
}

// 获取状态颜色
function getStatusColor(status: string) {
  switch (status) {
    case 'connected':
      return 'success'
    case 'disconnected':
      return 'error'
    case 'connecting':
      return 'warning'
    default:
      return 'grey'
  }
}

// 获取状态文本
function getStatusText(status: string) {
  switch (status) {
    case 'connected':
      return '已连接'
    case 'disconnected':
      return '已断开'
    case 'connecting':
      return '连接中'
    default:
      return '未知'
  }
}

// 测试MCP连接
async function testMcpConnection(serviceId: string) {
  loading.value = true
  try {
    const result = await mcpStore.testMcpServiceConnection(serviceId)
    if (result.success) {
      await mcpStore.updateMcpServiceStatus(serviceId, 'connected')
      emit('showSnackbar', 'MCP服务连接测试成功')
    } else {
      await mcpStore.updateMcpServiceStatus(serviceId, 'disconnected')
      emit('showSnackbar', `MCP服务连接测试失败: ${result.error || '未知错误'}`)
    }
    await loadMcpServices()
  } catch (error) {
    console.error('测试MCP连接失败:', error)
    emit('showSnackbar', '测试MCP连接失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
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
        <v-btn color="primary" @click="openCreateMcpDialog" class="mr-2">
          <template v-slot:prepend>
            <Plus :size="16" />
          </template>
          创建服务
        </v-btn>
        <v-btn color="secondary" @click="openImportDialog">
          <template v-slot:prepend>
            <Import :size="16" />
          </template>
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
                    <Terminal v-if="service.type === 'stdio'" :size="20" />
                    <Globe v-else :size="20" />
                  </v-avatar>
                  {{ service.name }}
                  <v-chip
                    :color="service.type === 'stdio' ? 'info' : 'success'"
                    size="small"
                    class="ml-2"
                  >
                    {{ service.type === 'stdio' ? 'Standard IO' : 'HTTP API' }}
                  </v-chip>
                  <v-spacer></v-spacer>
                  <v-chip
                    :color="getStatusColor(service.status)"
                    size="small"
                    variant="outlined"
                  >
                    {{ getStatusText(service.status) }}
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
                  <v-btn icon @click="testMcpConnection(service.id)" :loading="loading">
                    <Link :size="20" />
                  </v-btn>
                  <v-btn icon @click="openEditMcpDialog(service)">
                    <Edit3 :size="20" />
                  </v-btn>
                  <v-btn icon @click="openDeleteMcpDialog(service.id)">
                    <Trash2 :size="20" />
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>
          
          <!-- 空状态 -->
          <v-row v-else>
            <v-col cols="12" class="text-center">
              <div class="empty-state">
                <Puzzle :size="64" color="rgb(var(--v-theme-on-surface-variant))" />
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
                    <v-textarea
                      v-model="mcpForm.args"
                      label="参数"
                      hint="命令参数，每行一个参数"
                      persistent-hint
                      rows="3"
                      auto-grow
                    ></v-textarea>
                  </v-col>
                  
                  <v-col cols="12">
                    <v-textarea
                      v-model="mcpForm.env"
                      label="环境变量"
                      hint="环境变量，格式：KEY=VALUE，每行一个"
                      persistent-hint
                      rows="3"
                      auto-grow
                    ></v-textarea>
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