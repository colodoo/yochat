import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface McpService {
  id: string
  name: string
  type: string
  command?: string
  args?: string
  env?: string
  request_url?: string
  request_headers?: string
  config?: string
  status?: string
}

export const useMcpStore = defineStore('mcp', () => {
  // 状态
  const mcpServices = ref<McpService[]>([])
  const loading = ref(false)
  
  // 加载所有MCP服务
  async function loadMcpServices() {
    loading.value = true
    try {
      const result = await window.api.mcp.getAll()
      mcpServices.value = result
    } catch (error) {
      console.error('加载MCP服务失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }
  
  // 获取单个MCP服务
  async function getMcpService(id: string) {
    try {
      return await window.api.mcp.get(id)
    } catch (error) {
      console.error(`获取MCP服务 ${id} 失败:`, error)
      throw error
    }
  }
  
  // 创建新MCP服务
  async function createMcpService(serviceData: Omit<McpService, 'id'>) {
    try {
      const id = await window.api.mcp.create(serviceData)
      return id
    } catch (error) {
      console.error('创建MCP服务失败:', error)
      throw error
    }
  }
  
  // 更新MCP服务
  async function updateMcpService(id: string, serviceData: Partial<Omit<McpService, 'id'>>) {
    try {
      await window.api.mcp.update(id, serviceData)
    } catch (error) {
      console.error(`更新MCP服务 ${id} 失败:`, error)
      throw error
    }
  }
  
  // 删除MCP服务
  async function deleteMcpService(id: string) {
    try {
      await window.api.mcp.delete(id)
      // 从本地状态中移除
      mcpServices.value = mcpServices.value.filter(service => service.id !== id)
    } catch (error) {
      console.error(`删除MCP服务 ${id} 失败:`, error)
      throw error
    }
  }
  
  // 导入MCP服务
  async function importMcpService(jsonConfig: string) {
    try {
      const id = await window.api.mcp.import(jsonConfig)
      return id
    } catch (error) {
      console.error('导入MCP服务失败:', error)
      throw error
    }
  }
  
  // 测试MCP服务连接
  async function testMcpServiceConnection(serviceId: string) {
    try {
      return await window.api.invoke('mcp-test-connection', serviceId)
    } catch (error) {
      console.error('测试MCP服务连接失败:', error)
      throw error
    }
  }
  
  // 更新MCP服务状态
  async function updateMcpServiceStatus(serviceId: string, status: string) {
    try {
      return await window.api.invoke('mcp-update-status', serviceId, status)
    } catch (error) {
      console.error('更新MCP服务状态失败:', error)
      throw error
    }
  }
  
  // MCP服务健康检查
  async function checkMcpServiceHealth(serviceId?: string) {
    try {
      return await window.api.invoke('mcp-health-check', serviceId)
    } catch (error) {
      console.error('MCP服务健康检查失败:', error)
      throw error
    }
  }
  
  // 清理不健康的MCP客户端
  async function cleanupUnhealthyMcpClients() {
    try {
      return await window.api.invoke('mcp-cleanup-unhealthy')
    } catch (error) {
      console.error('清理不健康MCP客户端失败:', error)
      throw error
    }
  }
  
  // 重置MCP客户端池
  async function resetMcpClientPool() {
    try {
      return await window.api.invoke('mcp-reset-pool')
    } catch (error) {
      console.error('重置MCP客户端池失败:', error)
      throw error
    }
  }
  
  // 获取MCP连接状态
  async function getMcpConnectionStatus() {
    try {
      return await window.api.invoke('mcp-get-connection-status')
    } catch (error) {
      console.error('获取MCP连接状态失败:', error)
      throw error
    }
  }
  
  return {
    mcpServices,
    loading,
    loadMcpServices,
    getMcpService,
    createMcpService,
    updateMcpService,
    deleteMcpService,
    importMcpService,
    testMcpServiceConnection,
    updateMcpServiceStatus,
    checkMcpServiceHealth,
    cleanupUnhealthyMcpClients,
    resetMcpClientPool,
    getMcpConnectionStatus
  }
})