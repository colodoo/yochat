import { ipcMain } from 'electron';
import { net } from 'electron';
import { conversationService, messageService, assistantService, settingService, modelService, mcpService } from './database/services';
import { createLogger } from './utils/logger';
import OpenAI from 'openai';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AgentFactory, AgentType } from './agents/AgentFactory';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// 创建日志记录器
const apiLogger = createLogger('API');
const openaiLogger = createLogger('OpenAI');
const ollamaLogger = createLogger('Ollama');
const claudeLogger = createLogger('Claude');
const geminiLogger = createLogger('Gemini');
const mcpLogger = createLogger('MCP');
const ipcLogger = createLogger('IPC');

// MCP客户端连接池 - 改进版本，基于Cherry Studio最佳实践
class McpClientPool {
  private clients: Map<string, any> = new Map();
  private processes: Map<string, any> = new Map();
  private connectionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly CONNECTION_TIMEOUT = 30000; // 30秒连接超时
  private readonly IDLE_TIMEOUT = 300000; // 5分钟空闲超时
  private readonly MAX_RETRIES = 3; // 最大重试次数
  
  async getClient(service: any): Promise<any> {
    const clientKey = `${service.type}_${service.id}`;
    
    if (this.clients.has(clientKey)) {
      const clientInfo = this.clients.get(clientKey);
      // 检查连接是否仍然有效
      if (await this.isClientValid(clientInfo)) {
        // 重置空闲超时
        this.resetIdleTimeout(clientKey, service);
        return clientInfo.client;
      } else {
        mcpLogger.warn(`客户端连接已失效，重新创建: ${clientKey}`);
        await this.removeClient(clientKey);
      }
    }
    
    // 创建新的客户端连接
    const clientInfo = await this.createClientWithRetry(service);
    this.clients.set(clientKey, clientInfo);
    
    // 设置空闲超时
    this.resetIdleTimeout(clientKey, service);
    
    return clientInfo.client;
  }
  
  private async isClientValid(clientInfo: any): Promise<boolean> {
    try {
      if (!clientInfo || !clientInfo.client) return false;
      
      // 对于stdio类型，检查子进程是否还在运行
      if (clientInfo.process) {
        return !clientInfo.process.killed && clientInfo.process.exitCode === null;
      }
      
      // 对于http类型，尝试简单的连接检查
      return true; // HTTP连接通常是无状态的
    } catch (error) {
      mcpLogger.warn('检查客户端有效性失败:', error);
      return false;
    }
  }
  
  private resetIdleTimeout(clientKey: string, service: any): void {
    // 清除现有的超时
    if (this.connectionTimeouts.has(clientKey)) {
      clearTimeout(this.connectionTimeouts.get(clientKey)!);
    }
    
    // 设置新的空闲超时
    const timeout = setTimeout(() => {
      mcpLogger.info(`MCP客户端空闲超时，自动关闭: ${service.name}`);
      this.removeClient(clientKey);
    }, this.IDLE_TIMEOUT);
    
    this.connectionTimeouts.set(clientKey, timeout);
  }
  
  private async createClientWithRetry(service: any): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        mcpLogger.info(`尝试创建MCP客户端 (${attempt}/${this.MAX_RETRIES}): ${service.name}`);
        return await this.createClient(service);
      } catch (error) {
        lastError = error as Error;
        mcpLogger.warn(`创建MCP客户端失败 (${attempt}/${this.MAX_RETRIES}): ${lastError.message}`);
        
        if (attempt < this.MAX_RETRIES) {
          // 指数退避重试
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          mcpLogger.info(`等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`创建MCP客户端失败，已重试 ${this.MAX_RETRIES} 次: ${lastError?.message}`);
  }
  
  private async createClient(service: any): Promise<any> {
    if (service.type === 'stdio') {
      return await this.createStdioClient(service);
    } else if (service.type === 'http') {
      return await this.createHttpClient(service);
    } else {
      throw new Error(`不支持的MCP服务类型: ${service.type}`);
    }
  }
  
  private async createStdioClient(service: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      // 设置连接超时
      const connectionTimeout = setTimeout(() => {
        reject(new Error(`MCP服务连接超时: ${service.name}`));
      }, this.CONNECTION_TIMEOUT);
      
      try {
        // 将换行分隔的args字符串转换为数组
        const args = service.args ? service.args.split('\n').filter(arg => arg.trim() !== '') : [];
        
        mcpLogger.info(`创建MCP客户端连接: ${service.command} ${args.join(' ')}`);
        
        // 使用StdioClientTransport直接创建传输层，不使用child_process
        const transport = new StdioClientTransport({
          command: service.command,
          args: args
        });
        
        const client = new Client({
          name: 'yochat-client',
          version: '1.0.0'
        }, {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        });
        
        // 连接到MCP服务器
        await client.connect(transport);
        
        clearTimeout(connectionTimeout);
        
        const clientInfo = {
          client,
          transport,
          service
        };
        
        mcpLogger.info(`MCP客户端已连接: ${service.name}`);
        resolve(clientInfo);
        
      } catch (error) {
        clearTimeout(connectionTimeout);
        mcpLogger.error(`MCP客户端连接失败:`, error);
        
        // 提供更详细的错误信息和解决建议
        if ((error as Error).message.includes('ENOENT') || (error as Error).message.includes('找不到')) {
          mcpLogger.error('错误原因: 找不到指定的命令');
          mcpLogger.error('解决建议:');
          mcpLogger.error('1. 确保命令已正确安装');
          mcpLogger.error('2. 检查PATH环境变量是否包含命令所在目录');
          mcpLogger.error('3. 如果使用npx，确保Node.js和npm已正确安装');
          mcpLogger.error('4. 尝试在终端中手动运行命令以验证其可用性');
        }
        
        reject(new Error(`MCP客户端连接失败: ${(error as Error).message}`));
      }
    });
  }
  
  private async createHttpClient(service: any): Promise<any> {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
    
    return new Promise((resolve, reject) => {
      // 设置连接超时
      const connectionTimeout = setTimeout(() => {
        reject(new Error(`HTTP MCP服务连接超时: ${service.name}`));
      }, this.CONNECTION_TIMEOUT);
      
      try {
        const headers = service.request_headers ? JSON.parse(service.request_headers) : {};
        
        const transport = new SSEClientTransport(new URL(service.request_url), {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'YoChat/1.0.0',
            ...headers
          }
        });
        
        const client = new Client({
          name: 'yochat-client',
          version: '1.0.0'
        }, {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        });
        
        // 连接到MCP服务器
        client.connect(transport).then(() => {
          clearTimeout(connectionTimeout);
          
          const clientInfo = {
            client,
            transport,
            service
          };
          
          mcpLogger.info(`HTTP MCP客户端已连接: ${service.name}`);
          resolve(clientInfo);
        }).catch(error => {
          clearTimeout(connectionTimeout);
          mcpLogger.error(`HTTP MCP客户端连接失败:`, error);
          reject(new Error(`HTTP MCP客户端连接失败: ${error.message}`));
        });
        
      } catch (error) {
        clearTimeout(connectionTimeout);
        reject(error);
      }
    });
  }
  
  async removeClient(clientKey: string): Promise<void> {
    // 清除超时
    if (this.connectionTimeouts.has(clientKey)) {
      clearTimeout(this.connectionTimeouts.get(clientKey)!);
      this.connectionTimeouts.delete(clientKey);
    }
    
    const clientInfo = this.clients.get(clientKey);
    if (clientInfo) {
      try {
        // 断开客户端连接
        if (clientInfo.client) {
          await clientInfo.client.close().catch(error => {
            mcpLogger.warn('断开MCP客户端连接时出错:', error);
          });
        }
        
        // 关闭传输层连接
        if (clientInfo.transport) {
          try {
            await clientInfo.transport.close?.();
          } catch (error) {
            mcpLogger.warn('关闭传输层连接时出错:', error);
          }
        }
      } catch (error) {
        mcpLogger.error(`关闭MCP客户端失败:`, error);
      }
      
      this.clients.delete(clientKey);
      mcpLogger.info(`MCP客户端已移除: ${clientInfo.service?.name || clientKey}`);
    }
    
    // 清理进程引用（保留以兼容旧版本）
    if (this.processes.has(clientKey)) {
      this.processes.delete(clientKey);
    }
  }
  
  async closeAll(): Promise<void> {
    // 清除所有超时
    for (const timeout of this.connectionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.connectionTimeouts.clear();
    
    const closePromises: Promise<void>[] = [];
    
    for (const [clientKey, clientInfo] of this.clients.entries()) {
      const closePromise = (async () => {
        try {
          // 断开客户端连接
          if (clientInfo.client) {
            await clientInfo.client.close();
          }
          
          // 关闭传输层连接
          if (clientInfo.transport) {
            try {
              await clientInfo.transport.close?.();
            } catch (error) {
              mcpLogger.warn(`关闭传输层连接时出错 (${clientKey}):`, error);
            }
          }
        } catch (error) {
          mcpLogger.error(`关闭MCP客户端失败 (${clientKey}):`, error);
        }
      })();
      
      closePromises.push(closePromise);
    }
    
    await Promise.all(closePromises);
    this.clients.clear();
    this.processes.clear(); // 保留以兼容旧版本
    mcpLogger.info('所有MCP客户端已关闭');
  }
}

// 全局MCP客户端池实例
const mcpClientPool = new McpClientPool();

// 进程退出时清理所有连接
process.on('exit', () => {
  mcpClientPool.closeAll();
});

process.on('SIGINT', () => {
  mcpClientPool.closeAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  mcpClientPool.closeAll();
  process.exit(0);
});

// 将MCP服务转换为OpenAI工具格式
async function convertMcpServicesToOpenAITools(mcpServices: any[]): Promise<any[]> {
  const tools: any[] = [];
  
  for (const service of mcpServices) {
    try {
      mcpLogger.info(`正在获取MCP服务 ${service.name} 的工具列表`);
      
      // 根据服务类型获取工具列表
      let serviceTools: any[] = [];
      
      if (service.type === 'stdio') {
        serviceTools = await getMcpStdioServiceTools(service);
      } else if (service.type === 'http') {
        serviceTools = await getMcpHttpServiceTools(service);
      }
      
      // 将MCP工具转换为OpenAI Function Calling格式
      for (const tool of serviceTools) {
        const openaiTool = {
          type: 'function',
          function: {
            name: `${service.id}_${tool.name}`,
            description: tool.description || `${service.name} - ${tool.name}`,
            parameters: convertMcpSchemaToOpenAI(tool.inputSchema || {})
          }
        };
        
        tools.push(openaiTool);
        mcpLogger.info(`已转换工具: ${openaiTool.function.name}`);
      }
    } catch (error) {
      mcpLogger.error(`获取MCP服务 ${service.name} 工具列表失败:`, error as Error);
      // 如果获取工具列表失败，创建一个通用工具
      const fallbackTool = {
        type: 'function',
        function: {
          name: `${service.id}_call`,
          description: `调用 ${service.name} 服务`,
          parameters: {
            type: 'object',
            properties: {
              method: {
                type: 'string',
                description: '要调用的方法名'
              },
              params: {
                type: 'object',
                description: '方法参数'
              }
            },
            required: ['method']
          }
        }
      };
      tools.push(fallbackTool);
    }
  }
  
  return tools;
}

// 获取stdio类型MCP服务的工具列表
async function getMcpStdioServiceTools(service: any): Promise<any[]> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      mcpLogger.info(`获取MCP服务 ${service.name} 的工具列表 (尝试 ${attempt}/${maxRetries})`);
      
      const clientInfo = await mcpClientPool.getClient(service);
      const client = clientInfo.client || clientInfo; // 兼容旧版本返回格式
      
      mcpLogger.info('获取工具列表...');
      
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('获取工具列表超时')), 10000);
      });
      
      const toolsResponse = await Promise.race([
        client.listTools(),
        timeoutPromise
      ]) as any;
      
      const tools = toolsResponse?.tools || [];
      
      mcpLogger.info(`获取到 ${tools.length} 个工具`);
      
      // 验证工具格式
      const validTools = tools.filter((tool: any) => {
        if (!tool.name || typeof tool.name !== 'string') {
          mcpLogger.warn(`跳过无效工具（缺少名称）:`, tool);
          return false;
        }
        return true;
      });
      
      if (validTools.length !== tools.length) {
        mcpLogger.warn(`过滤了 ${tools.length - validTools.length} 个无效工具`);
      }
      
      return validTools;
    } catch (error) {
      lastError = error as Error;
      mcpLogger.warn(`获取MCP工具列表失败 (尝试 ${attempt}/${maxRetries}): ${lastError.message}`);
      
      if (attempt < maxRetries) {
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        mcpLogger.info(`等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  mcpLogger.error(`获取MCP工具列表最终失败: ${lastError?.message}`);
  throw new Error(`获取MCP工具列表失败，已重试 ${maxRetries} 次: ${lastError?.message}`);
}

// 获取http类型MCP服务的工具列表
async function getMcpHttpServiceTools(service: any): Promise<any[]> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      mcpLogger.info(`获取HTTP MCP服务 ${service.name} 的工具列表 (尝试 ${attempt}/${maxRetries})`);
      
      const clientInfo = await mcpClientPool.getClient(service);
      const client = clientInfo.client || clientInfo; // 兼容旧版本返回格式
      
      mcpLogger.info('获取工具列表...');
      
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('获取工具列表超时')), 15000); // HTTP可能需要更长时间
      });
      
      const toolsResponse = await Promise.race([
        client.listTools(),
        timeoutPromise
      ]) as any;
      
      const tools = toolsResponse?.tools || [];
      
      mcpLogger.info(`获取到 ${tools.length} 个工具`);
      
      // 验证工具格式
      const validTools = tools.filter((tool: any) => {
        if (!tool.name || typeof tool.name !== 'string') {
          mcpLogger.warn(`跳过无效工具（缺少名称）:`, tool);
          return false;
        }
        return true;
      });
      
      if (validTools.length !== tools.length) {
        mcpLogger.warn(`过滤了 ${tools.length - validTools.length} 个无效工具`);
      }
      
      return validTools;
    } catch (error) {
      lastError = error as Error;
      mcpLogger.warn(`获取HTTP MCP工具列表失败 (尝试 ${attempt}/${maxRetries}): ${lastError.message}`);
      
      if (attempt < maxRetries) {
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        mcpLogger.info(`等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  mcpLogger.error(`获取HTTP MCP工具列表最终失败: ${lastError?.message}`);
  throw new Error(`获取HTTP MCP工具列表失败，已重试 ${maxRetries} 次: ${lastError?.message}`);
}

// 执行MCP工具调用
async function executeMcpTool(toolCall: any): Promise<any> {
  try {
    const functionName = toolCall.function.name;
    let args: any = {};
    
    // 安全解析参数
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch (parseError) {
      mcpLogger.warn(`解析工具参数失败，使用空对象: ${parseError}`);
      args = {};
    }
    
    mcpLogger.info(`执行MCP工具: ${functionName}`, args);
    
    // 解析工具名称，格式为 serviceId_toolName
    const [serviceId, ...toolNameParts] = functionName.split('_');
    const toolName = toolNameParts.join('_');
    
    if (!serviceId || !toolName) {
      throw new Error(`无效的工具名称格式: ${functionName}，期望格式: serviceId_toolName`);
    }
    
    mcpLogger.info(`解析工具: 服务ID=${serviceId}, 工具名=${toolName}`);
    
    // 获取MCP服务
    const service = mcpService.getMcpService(serviceId);
    if (!service) {
      throw new Error(`未找到MCP服务: ${serviceId}`);
    }
    
    mcpLogger.info(`找到MCP服务: ${service.name} (类型: ${service.type})`);
    
    // 根据服务类型执行工具
    let result: any;
    if (service.type === 'stdio') {
      result = await executeStdioMcpTool(service, toolName, args);
    } else if (service.type === 'http') {
      result = await executeHttpMcpTool(service, toolName, args);
    } else {
      throw new Error(`不支持的MCP服务类型: ${service.type}`);
    }
    
    mcpLogger.info(`工具执行完成: ${functionName}`);
    return result;
    
  } catch (error) {
    mcpLogger.error(`执行MCP工具失败: ${error}`);
    throw error;
  }
}

// 执行stdio类型MCP工具
async function executeStdioMcpTool(service: any, toolName: string, args: any): Promise<any> {
  const maxRetries = 2;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      mcpLogger.info(`执行MCP工具: ${toolName} (尝试 ${attempt}/${maxRetries})，参数:`, args);
      
      const clientInfo = await mcpClientPool.getClient(service);
      const client = clientInfo.client || clientInfo; // 兼容旧版本返回格式
      
      mcpLogger.info(`调用工具: ${toolName}`);
      
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('工具调用超时')), 30000); // 30秒超时
      });
      
      const result = await Promise.race([
        client.callTool({
          name: toolName,
          arguments: args
        }),
        timeoutPromise
      ]) as any;
      
      mcpLogger.info('工具调用成功');
      
      // 处理和验证结果
       return processToolResult(result, toolName);
      
    } catch (error) {
      lastError = error as Error;
      mcpLogger.warn(`执行MCP工具失败 (尝试 ${attempt}/${maxRetries}): ${lastError.message}`);
      
      // 如果是连接错误，尝试重新连接
       if (isConnectionError(lastError) && attempt < maxRetries) {
        mcpLogger.info('检测到连接错误，尝试重新连接...');
        const clientKey = `${service.type}_${service.id}`;
        await mcpClientPool.removeClient(clientKey);
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else if (attempt < maxRetries) {
        // 其他错误，短暂等待后重试
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  mcpLogger.error(`执行MCP工具最终失败: ${lastError?.message}`);
  throw new Error(`执行MCP工具失败，已重试 ${maxRetries} 次: ${lastError?.message}`);
}

// 执行http类型MCP工具
async function executeHttpMcpTool(service: any, toolName: string, args: any): Promise<any> {
  const maxRetries = 2;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      mcpLogger.info(`执行HTTP MCP工具: ${toolName} (尝试 ${attempt}/${maxRetries})，参数:`, args);
      
      const clientInfo = await mcpClientPool.getClient(service);
      const client = clientInfo.client || clientInfo; // 兼容旧版本返回格式
      
      mcpLogger.info(`调用工具: ${toolName}`);
      
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('工具调用超时')), 45000); // HTTP可能需要更长时间
      });
      
      const result = await Promise.race([
        client.callTool({
          name: toolName,
          arguments: args
        }),
        timeoutPromise
      ]) as any;
      
      mcpLogger.info('HTTP工具调用成功');
      
      // 处理和验证结果
       return processToolResult(result, toolName);
      
    } catch (error) {
      lastError = error as Error;
      mcpLogger.warn(`执行HTTP MCP工具失败 (尝试 ${attempt}/${maxRetries}): ${lastError.message}`);
      
      // 如果是连接错误，尝试重新连接
       if (isConnectionError(lastError) && attempt < maxRetries) {
        mcpLogger.info('检测到连接错误，尝试重新连接...');
        const clientKey = `${service.type}_${service.id}`;
        await mcpClientPool.removeClient(clientKey);
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (attempt < maxRetries) {
        // 其他错误，短暂等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  mcpLogger.error(`执行HTTP MCP工具最终失败: ${lastError?.message}`);
  throw new Error(`执行HTTP MCP工具失败，已重试 ${maxRetries} 次: ${lastError?.message}`);
}

// 处理工具结果
function processToolResult(result: any, toolName: string): any {
  try {
    // 如果结果是字符串，尝试解析为JSON
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result);
      } catch {
        // 如果解析失败，保持原字符串
      }
    }
    
    // 检查是否有错误
    if (result && result.isError) {
      throw new Error(`工具执行错误: ${result.content || '未知错误'}`);
    }
    
    // 提取内容
    if (result && result.content) {
      return result.content;
    }
    
    // 如果结果是数组，提取第一个内容项
    if (Array.isArray(result) && result.length > 0) {
      const firstItem = result[0];
      if (firstItem && firstItem.content) {
        return firstItem.content;
      }
    }
    
    return result;
  } catch (error) {
    mcpLogger.error(`处理工具结果失败 (${toolName}):`, error);
    throw error;
  }
}

// 检查是否为连接错误
function isConnectionError(error: Error): boolean {
  const connectionErrorMessages = [
    'connection',
    'connect',
    'timeout',
    'network',
    'socket',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'disconnected',
    'closed'
  ];
  
  const errorMessage = error.message.toLowerCase();
  return connectionErrorMessages.some(msg => errorMessage.includes(msg));
}

// MCP 服务健康检查
async function checkMcpServiceHealth(service: any): Promise<boolean> {
  try {
    mcpLogger.info(`检查MCP服务健康状态: ${service.name}`);
    
    const clientInfo = await mcpClientPool.getClient(service);
    const client = clientInfo.client || clientInfo;
    
    // 尝试获取服务器信息来验证连接
    const serverInfo = await Promise.race([
      client.getServerInfo(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('健康检查超时')), 5000);
      })
    ]);
    
    mcpLogger.info(`MCP服务 ${service.name} 健康检查通过:`, serverInfo);
    return true;
  } catch (error) {
    mcpLogger.warn(`MCP服务 ${service.name} 健康检查失败:`, error);
    return false;
  }
}

// 批量检查所有MCP服务健康状态
async function checkAllMcpServicesHealth(): Promise<Map<string, boolean>> {
  const healthStatus = new Map<string, boolean>();
  const services = mcpService.getAllMcpServices();
  
  mcpLogger.info(`开始检查 ${services.length} 个MCP服务的健康状态`);
  
  const healthChecks = services.map(async (service) => {
    const isHealthy = await checkMcpServiceHealth(service);
    healthStatus.set(service.id, isHealthy);
    return { serviceId: service.id, isHealthy };
  });
  
  await Promise.allSettled(healthChecks);
  
  const healthyCount = Array.from(healthStatus.values()).filter(Boolean).length;
  mcpLogger.info(`健康检查完成: ${healthyCount}/${services.length} 个服务正常`);
  
  return healthStatus;
}

// 清理不健康的MCP客户端连接
async function cleanupUnhealthyMcpClients(): Promise<void> {
  try {
    mcpLogger.info('开始清理不健康的MCP客户端连接');
    
    const healthStatus = await checkAllMcpServicesHealth();
    const unhealthyServices: string[] = [];
    
    for (const [serviceId, isHealthy] of healthStatus) {
      if (!isHealthy) {
        unhealthyServices.push(serviceId);
        const clientKey = `stdio_${serviceId}`; // 尝试stdio格式
        await mcpClientPool.removeClient(clientKey);
        
        const httpClientKey = `http_${serviceId}`; // 尝试http格式
        await mcpClientPool.removeClient(httpClientKey);
      }
    }
    
    if (unhealthyServices.length > 0) {
      mcpLogger.info(`清理了 ${unhealthyServices.length} 个不健康的客户端连接:`, unhealthyServices);
    } else {
      mcpLogger.info('所有MCP客户端连接都是健康的');
    }
  } catch (error) {
    mcpLogger.error('清理不健康客户端连接时出错:', error);
  }
}

// 将MCP工具的输入schema转换为OpenAI Function Calling格式
function convertMcpSchemaToOpenAI(mcpSchema: any): any {
  if (!mcpSchema || typeof mcpSchema !== 'object') {
    return {
      type: 'object',
      properties: {},
      required: []
    };
  }
  
  // 如果已经是OpenAI格式，直接返回
  if (mcpSchema.type === 'object' && mcpSchema.properties) {
    return mcpSchema;
  }
  
  // 转换MCP schema到OpenAI格式
  const openaiSchema = {
    type: 'object',
    properties: {},
    required: []
  };
  
  // 处理properties
  if (mcpSchema.properties) {
    openaiSchema.properties = mcpSchema.properties;
  }
  
  // 处理required字段
  if (mcpSchema.required && Array.isArray(mcpSchema.required)) {
    openaiSchema.required = mcpSchema.required;
  }
  
  return openaiSchema;
}

// API请求相关函数
async function callOpenAI(assistant: any, messages: any[], onProgress?: (text: string) => void, tools?: any[]) {
  return new Promise(async (resolve, reject) => {
    try {
      // 使用 OpenAI Node.js 库
      const baseUrl = assistant.api_url || 'https://api.openai.com';
      const apiKey = assistant.api_key;
      const modelName = assistant.model_name || 'gpt-3.5-turbo';
      
      if (!apiKey) {
        return reject(new Error('未设置API密钥'));
      }
      
      // 获取Agent类型，默认为直接对话
      const agentType = assistant.agent_type || AgentType.DIRECT;
      const systemPrompt = assistant.system_prompt || '你是一个有用的AI助手。';
      
      openaiLogger.info(`assistant: ${JSON.stringify(assistant)}`)
      openaiLogger.info(`请求模型: ${modelName}, API URL: ${baseUrl}, Agent类型: ${agentType}`);
      
      // 使用LangGraph Agent
      try {
        openaiLogger.info(`🤖 [LangGraph] 准备创建${AgentFactory.getAgentTypeName(agentType)}Agent...`);
        
        if (onProgress) {
          onProgress(`🤖 **正在启动${AgentFactory.getAgentTypeName(agentType)}模式...**\n\n`);
        }
        
        const model = {
          model_name: modelName,
          api_key: apiKey,
          api_url: baseUrl
        };
        
        const agentConfig = {
          model,
          tools: tools || [],
          maxIterations: 10,
          systemPrompt,
          temperature: assistant.temperature || 0.7,
          maxTokens: assistant.max_tokens || 2048
        };
        
        openaiLogger.info(`📋 [LangGraph] Agent配置:`, {
          agentType,
          modelName,
          toolsCount: tools?.length || 0,
          maxIterations: agentConfig.maxIterations,
          temperature: agentConfig.temperature
        });
        
        // 创建Agent
        openaiLogger.info(`🏗️ [LangGraph] 正在创建Agent实例...`);
        const agentConfigWithProgress = {
          ...agentConfig,
          onProgress: onProgress
        };
        const agent = AgentFactory.createAgent(agentType, agentConfigWithProgress);
        
        if (onProgress) {
          onProgress(`✅ **Agent创建成功，开始处理消息...**\n\n`);
        }
        
        // 转换消息格式为LangGraph格式
        openaiLogger.info(`🔄 [LangGraph] 转换消息格式，消息数量: ${messages.length}`);
        const langGraphMessages = messages.map(msg => {
          if (msg.role === 'user') {
            return new HumanMessage(msg.content);
          } else if (msg.role === 'assistant') {
            return new AIMessage(msg.content);
          }
          return new HumanMessage(msg.content);
        });
        
        // 准备初始状态
        const initialState = {
          messages: langGraphMessages,
          iterations: 0,
          maxIterations: 10,
          tools: tools || [],
          toolResults: []
        };
        
        openaiLogger.info(`🚀 [LangGraph] 开始执行${AgentFactory.getAgentTypeName(agentType)}Agent`);
        
        if (onProgress) {
          onProgress(`🚀 **开始${AgentFactory.getAgentTypeName(agentType)}推理过程...**\n\n`);
        }
        
        // 执行Agent
        if (onProgress) {
          onProgress(`🔄 **正在执行${AgentFactory.getAgentTypeName(agentType)}推理...**\n\n`);
        }
        
        const result = await agent.invoke(initialState);
        
        openaiLogger.info(`✅ [LangGraph] Agent执行完成，处理结果...`);
        
        if (onProgress) {
          onProgress(`✅ **${AgentFactory.getAgentTypeName(agentType)}推理完成，正在处理结果...**\n\n`);
        }
        
        // 处理Agent结果
        let responseContent = '';
        let toolCalls: any[] = [];
        let toolResults: any[] = [];
        
        openaiLogger.info(`📊 [LangGraph] 分析Agent执行结果:`, {
          hasMessages: !!(result.messages && result.messages.length > 0),
          messageCount: result.messages?.length || 0,
          hasToolResults: !!(result.toolResults && result.toolResults.length > 0),
          toolResultsCount: result.toolResults?.length || 0,
          iterations: result.iterations || 0
        });
        
        if (result.messages && result.messages.length > 0) {
          const lastMessage = result.messages[result.messages.length - 1];
          openaiLogger.info(`📝 [LangGraph] 最后一条消息类型: ${lastMessage.constructor.name}`);
          
          if (lastMessage.constructor.name === 'AIMessage') {
            responseContent = lastMessage.content;
            openaiLogger.info(`📄 [LangGraph] 响应内容长度: ${responseContent.length}字符`);
            
            // 模拟流式输出
            if (onProgress) {
              openaiLogger.info(`🌊 [LangGraph] 开始模拟流式输出...`);
              const words = responseContent.split(' ');
              for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
                onProgress(chunk);
                
                // 添加小延迟以模拟流式效果
                await new Promise(resolve => setTimeout(resolve, 30));
              }
              openaiLogger.info(`✅ [LangGraph] 流式输出完成`);
            }
          }
        } else {
          openaiLogger.warn(`⚠️ [LangGraph] Agent未返回任何消息`);
        }
        
        // 处理工具调用结果
        if (result.toolResults && result.toolResults.length > 0) {
          openaiLogger.info(`🔧 [LangGraph] 检测到${result.toolResults.length}个工具调用`);
          toolCalls = result.toolResults;
          
          if (onProgress) {
            onProgress(`\n\n🔧 **检测到${toolCalls.length}个工具调用，开始执行...**\n\n`);
          }
          
          // 执行MCP工具调用
          for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            openaiLogger.info(`🛠️ [LangGraph] 执行工具 ${i + 1}/${toolCalls.length}: ${toolCall.function?.name || toolCall.name}`);
            
            try {
              if (onProgress) {
                onProgress(`🔧 **[${i + 1}/${toolCalls.length}] 正在调用工具:** ${toolCall.function?.name || toolCall.name}\n`);
              }
              
              const mcpResult = await executeMcpTool(toolCall);
              
              let formattedResult: string;
              if (typeof mcpResult === 'string') {
                formattedResult = mcpResult;
              } else if (typeof mcpResult === 'object') {
                formattedResult = JSON.stringify(mcpResult, null, 2);
              } else {
                formattedResult = String(mcpResult);
              }
              
              openaiLogger.info(`✅ [LangGraph] 工具执行成功: ${toolCall.function?.name || toolCall.name}, 结果长度: ${formattedResult.length}字符`);
              
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: formattedResult
              });
              
              if (onProgress) {
                onProgress(`✅ **[${i + 1}/${toolCalls.length}] 工具执行完成:** ${toolCall.function?.name || toolCall.name}\n\n**结果:**\n\`\`\`\n${formattedResult.substring(0, 500)}${formattedResult.length > 500 ? '...' : ''}\n\`\`\`\n\n`);
              }
              
            } catch (error) {
              openaiLogger.error(`❌ [LangGraph] 工具执行失败: ${toolCall.function?.name || toolCall.name}:`, error);
              
              const errorResult = JSON.stringify({ 
                error: (error as Error).message,
                tool_name: toolCall.function?.name || toolCall.name
              });
              
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: errorResult
              });
              
              if (onProgress) {
                onProgress(`❌ **[${i + 1}/${toolCalls.length}] 工具执行失败:** ${toolCall.function?.name || toolCall.name}\n\n**错误:**\n\`\`\`\n${(error as Error).message}\n\`\`\`\n\n`);
              }
            }
          }
          
          openaiLogger.info(`🎯 [LangGraph] 所有工具调用完成，成功: ${toolResults.filter(r => !r.content.includes('error')).length}/${toolCalls.length}`);
        } else {
          openaiLogger.info(`ℹ️ [LangGraph] 无工具调用需要执行`);
        }
        
        openaiLogger.info(`🎉 [LangGraph] ${AgentFactory.getAgentTypeName(agentType)}Agent执行完成`);
        
        if (onProgress) {
          onProgress(`\n\n🎉 **${AgentFactory.getAgentTypeName(agentType)}模式处理完成！**\n\n`);
        }
        
        const finalResult = {
          content: responseContent,
          tool_calls: toolCalls.length > 0 ? toolCalls : null,
          tool_results: toolResults.length > 0 ? toolResults : null
        };
        
        openaiLogger.info(`📊 [LangGraph] 最终结果统计:`, {
          contentLength: responseContent.length,
          toolCallsCount: toolCalls.length,
          toolResultsCount: toolResults.length,
          agentType: AgentFactory.getAgentTypeName(agentType)
        });
        
        resolve(finalResult);
        
      } catch (agentError) {
        openaiLogger.error(`❌ [LangGraph] ${AgentFactory.getAgentTypeName(agentType)}Agent执行失败，降级到直接调用:`, agentError);
        
        if (onProgress) {
          onProgress(`\n\n⚠️ **Agent执行遇到问题，切换到直接对话模式...**\n\n`);
        }
      }
      
    } catch (error) {
      openaiLogger.error('callOpenAI失败:', error);
      reject(error);
    }
  });
}

async function callOllama(assistant: any, messages: any[], onProgress?: (text: string) => void) {
  return new Promise((resolve, reject) => {
    try {
      // 构建完整的API URL
      const baseUrl = assistant.api_url || 'http://localhost:11434';
      const apiUrl = `${baseUrl}/api/chat`;
      const modelName = assistant.model_name || 'llama2';
      
      // 添加系统提示
      const systemPrompt = assistant.system_prompt || '你是一个有用的AI助手。';
      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];
      
      ollamaLogger.info(`请求模型: ${modelName}, API URL: ${apiUrl}`);
      
      // 构建请求头
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // 打印请求头
      ollamaLogger.info('请求头:', headers);
      
      const request = net.request({
        method: 'POST',
        url: apiUrl,
        headers: headers
      });
      
      let responseData = '';
      let fullContent = '';
      
      // 构建请求体
      const requestBody = {
        model: modelName,
        messages: formattedMessages,
        stream: !!onProgress // 如果提供了onProgress回调，则启用流式输出
      };
      
      // 打印请求体
      ollamaLogger.info('请求体:', JSON.stringify(requestBody, null, 2));
      
      request.on('response', (response) => {
        ollamaLogger.info(`状态码: ${response.statusCode}`);
        
        // 打印响应头
        const responseHeaders = response.headers;
        ollamaLogger.info('响应头:', responseHeaders);
        
        if (response.statusCode !== 200) {
          ollamaLogger.error(`请求失败: ${response.statusCode}`);
        }
        
        response.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          responseData += chunkStr;
          
          // 处理流式响应
          if (requestBody.stream && onProgress) {
            try {
              // Ollama的流式响应是一行一个JSON
              const lines = chunkStr.split('\n').filter(line => line.trim() !== '');
              
              for (const line of lines) {
                try {
                  const json = JSON.parse(line);
                  if (json.message?.content) {
                    // Ollama的流式响应中，每个消息都包含完整的内容
                    fullContent = json.message.content;
                    onProgress(fullContent);
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            } catch (e) {
              ollamaLogger.error('处理流式数据失败:', e);
            }
          }
        });
        
        response.on('end', () => {
          try {
            // 打印原始响应内容摘要
            ollamaLogger.info('响应内容摘要:', responseData.substring(0, 200) + '...');
            
            if (response.statusCode !== 200) {
              let error;
              try {
                error = JSON.parse(responseData);
              } catch {
                error = { error: '无法解析错误响应' };
              }
              ollamaLogger.error('错误详情:', error);
              return reject(new Error(error.error || `API请求失败: ${response.statusCode}`));
            }
            
            // 如果是流式响应，已经通过onProgress回调处理了
            if (requestBody.stream) {
              ollamaLogger.info('流式请求成功完成');
              resolve(fullContent);
            } else {
              // 非流式响应，解析JSON
              const data = JSON.parse(responseData);
              ollamaLogger.info('请求成功');
              resolve(data.message?.content || '');
            }
          } catch (error) {
            ollamaLogger.error('解析响应失败:', error);
            reject(new Error('解析API响应失败'));
          }
        });
      });
      
      request.on('error', (error) => {
        ollamaLogger.error('请求错误:', error);
        reject(new Error(`API请求错误: ${error instanceof Error ? error.message : String(error)}`));
      });
      
      // 发送请求数据
      const requestData = JSON.stringify(requestBody);
      request.write(requestData);
      request.end();
    } catch (error) {
      ollamaLogger.error('调用异常:', error);
      reject(new Error(`API调用异常: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
}

async function callClaude(assistant: any, messages: any[], onProgress?: (text: string) => void) {
  return new Promise((resolve, reject) => {
    try {
      // 构建完整的API URL
      const baseUrl = assistant.api_url || 'https://api.anthropic.com';
      const apiUrl = `${baseUrl}/v1/messages`;
      const apiKey = assistant.api_key;
      const modelName = assistant.model_name || 'claude-3-opus-20240229';
      
      if (!apiKey) {
        return reject(new Error('未设置API密钥'));
      }
      
      // 添加系统提示
      const systemPrompt = assistant.system_prompt || '你是一个有用的AI助手。';
      
      // 格式化消息
      const formattedMessages = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      // 构建请求体
      const requestBody = {
        model: modelName,
        system: systemPrompt,
        messages: formattedMessages,
        max_tokens: assistant.max_tokens || 2048,
        temperature: assistant.temperature || 0.7,
        stream: !!onProgress // 如果提供了onProgress回调，则启用流式输出
      };
      
      claudeLogger.info(`请求模型: ${modelName}, API URL: ${apiUrl}`);
      claudeLogger.info('模拟请求体:', JSON.stringify(requestBody, null, 2));
      
      // 模拟响应
      if (onProgress) {
        // 模拟流式输出
        const response = '这是Claude API的模拟流式响应。请在设置中配置真实的Claude API密钥以获取实际响应。';
        let currentText = '';
        
        // 模拟每200ms输出一个词
        const words = response.split(' ');
        let wordIndex = 0;
        
        const interval = setInterval(() => {
          if (wordIndex < words.length) {
            currentText += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
            onProgress(currentText);
            wordIndex++;
          } else {
            clearInterval(interval);
            claudeLogger.info('模拟流式响应完成');
            resolve(currentText);
          }
        }, 200);
      } else {
        // 非流式响应
        setTimeout(() => {
          claudeLogger.info('模拟响应内容:', '这是Claude API的模拟响应');
          resolve('这是Claude API的模拟响应。请在设置中配置真实的Claude API密钥以获取实际响应。');
        }, 1000);
      }
    } catch (error) {
      claudeLogger.error('调用异常:', error);
      reject(new Error(`API调用异常: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
}

async function callGemini(assistant: any, messages: any[], onProgress?: (text: string) => void) {
  return new Promise((resolve, reject) => {
    try {
      // 构建完整的API URL
      const baseUrl = assistant.api_url || 'https://generativelanguage.googleapis.com';
      const apiUrl = `${baseUrl}/v1/models/${assistant.model_name || 'gemini-pro'}:generateContent`;
      const apiKey = assistant.api_key;
      
      if (!apiKey) {
        return reject(new Error('未设置API密钥'));
      }
      
      // 添加系统提示
      const systemPrompt = assistant.system_prompt || '你是一个有用的AI助手。';
      
      // 格式化消息
      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];
      
      // 构建请求体
      const requestBody = {
        contents: formattedMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: assistant.temperature || 0.7,
          maxOutputTokens: assistant.max_tokens || 2048
        },
        stream: !!onProgress // 如果提供了onProgress回调，则启用流式输出
      };
      
      geminiLogger.info(`请求模型: ${assistant.model_name || 'gemini-pro'}, API URL: ${apiUrl}`);
      geminiLogger.info('模拟请求体:', JSON.stringify(requestBody, null, 2));
      
      // 模拟响应
      if (onProgress) {
        // 模拟流式输出
        const response = '这是Gemini API的模拟流式响应。请在设置中配置真实的Gemini API密钥以获取实际响应。';
        let currentText = '';
        
        // 模拟每200ms输出一个词
        const words = response.split(' ');
        let wordIndex = 0;
        
        const interval = setInterval(() => {
          if (wordIndex < words.length) {
            currentText += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
            onProgress(currentText);
            wordIndex++;
          } else {
            clearInterval(interval);
            geminiLogger.info('模拟流式响应完成');
            resolve(currentText);
          }
        }, 200);
      } else {
        // 非流式响应
        setTimeout(() => {
          const responseContent = `这是Gemini模型的模拟回复。\n\n当前使用的助手: ${assistant.name}\n模型类型: ${assistant.model_type}`;
          geminiLogger.info('模拟响应内容:', responseContent);
          resolve(responseContent);
        }, 1000);
      }
    } catch (error) {
      geminiLogger.error('调用异常:', error);
      reject(new Error(`API调用异常: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
}

// 注册IPC处理程序
export function setupIPC(): void {
  // 对话相关
  ipcMain.handle('get-all-conversations', async () => {
    try {
      return conversationService.getAllConversations();
    } catch (error) {
      ipcLogger.error('获取所有对话失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-conversation', async (_, id: number) => {
    try {
      return conversationService.getConversation(id);
    } catch (error) {
      ipcLogger.error(`获取对话 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-conversation', async (_, title: string, assistantId: string, temperature?: number, maxTokens?: number) => {
    try {
      return conversationService.createConversation(title, assistantId, temperature, maxTokens);
    } catch (error) {
      ipcLogger.error('创建对话失败:', error);
      throw error;
    }
  });

  ipcMain.handle('update-conversation', async (_, id: number, data: { title?: string, temperature?: number, maxTokens?: number, mcpServices?: string[] }) => {
    try {
      ipcLogger.info(`IPC: 收到更新对话请求 - ID: ${id}, 数据:`, JSON.stringify(data, null, 2));
      const result = conversationService.updateConversation(id, data);
      ipcLogger.info(`IPC: 对话更新结果:`, result);
      return result;
    } catch (error) {
      ipcLogger.error(`更新对话 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-conversation', async (_, id: number) => {
    try {
      return conversationService.deleteConversation(id);
    } catch (error) {
      ipcLogger.error(`删除对话 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('clear-all-conversations', async () => {
    try {
      return conversationService.clearAllConversations();
    } catch (error) {
      ipcLogger.error('清空所有对话失败:', error);
      throw error;
    }
  });

  // 消息相关
  ipcMain.handle('get-messages-by-conversation', async (_, conversationId: number) => {
    try {
      return messageService.getMessagesByConversation(conversationId);
    } catch (error) {
      ipcLogger.error(`获取对话 ${conversationId} 的消息失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('add-message', async (_, conversationId: number, role: string, content: string, toolCalls?: any[], toolCallId?: string) => {
    try {
      return messageService.addMessage(conversationId, role, content, toolCalls, toolCallId);
    } catch (error) {
      ipcLogger.error(`添加消息到对话 ${conversationId} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-all-messages', async (_, conversationId: number) => {
    try {
      return messageService.deleteAllMessages(conversationId);
    } catch (error) {
      ipcLogger.error(`删除对话 ${conversationId} 的所有消息失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-message', async (_, messageId: number) => {
    try {
      return messageService.deleteMessage(messageId);
    } catch (error) {
      ipcLogger.error(`删除消息 ${messageId} 失败:`, error);
      throw error;
    }
  });

  // 模型相关
  ipcMain.handle('get-all-models', async () => {
    try {
      return modelService.getAllModels();
    } catch (error) {
      ipcLogger.error('获取所有模型失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-model', async (_, id: string) => {
    try {
      return modelService.getModel(id);
    } catch (error) {
      ipcLogger.error(`获取模型 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-model', async (_, model: any) => {
    try {
      return modelService.createModel(model);
    } catch (error) {
      ipcLogger.error('创建模型失败:', error);
      throw error;
    }
  });

  ipcMain.handle('update-model', async (_, id: string, model: any) => {
    try {
      return modelService.updateModel(id, model);
    } catch (error) {
      ipcLogger.error(`更新模型 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-model', async (_, id: string) => {
    try {
      return modelService.deleteModel(id);
    } catch (error) {
      ipcLogger.error(`删除模型 ${id} 失败:`, error);
      throw error;
    }
  });

  // 助手相关
  ipcMain.handle('get-all-assistants', async () => {
    try {
      return assistantService.getAllAssistants();
    } catch (error) {
      ipcLogger.error('获取所有助手失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-assistant', async (_, id: string) => {
    try {
      return assistantService.getAssistant(id);
    } catch (error) {
      ipcLogger.error(`获取助手 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-assistant', async (_, assistant: any) => {
    try {
      return assistantService.createAssistant(assistant);
    } catch (error) {
      ipcLogger.error('创建助手失败:', error);
      throw error;
    }
  });

  ipcMain.handle('update-assistant', async (_, id: string, assistant: any) => {
    try {
      return assistantService.updateAssistant(id, assistant);
    } catch (error) {
      ipcLogger.error(`更新助手 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-assistant', async (_, id: string) => {
    try {
      return assistantService.deleteAssistant(id);
    } catch (error) {
      ipcLogger.error(`删除助手 ${id} 失败:`, error);
      throw error;
    }
  });

  // 设置相关
  ipcMain.handle('get-all-settings', async () => {
    try {
      return settingService.getAllSettings();
    } catch (error) {
      ipcLogger.error('获取所有设置失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-setting', async (_, key: string) => {
    try {
      return settingService.getSetting(key);
    } catch (error) {
      ipcLogger.error(`获取设置 ${key} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('update-setting', async (_, key: string, value: string) => {
    try {
      return settingService.updateSetting(key, value);
    } catch (error) {
      ipcLogger.error(`更新设置 ${key} 失败:`, error);
      throw error;
    }
  });
  
  // MCP服务相关
  ipcMain.handle('get-all-mcp-services', async () => {
    try {
      return mcpService.getAllMcpServices();
    } catch (error) {
      ipcLogger.error('获取所有MCP服务失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-mcp-service', async (_, id: string) => {
    try {
      return mcpService.getMcpService(id);
    } catch (error) {
      ipcLogger.error(`获取MCP服务 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-mcp-service', async (_, service: any) => {
    try {
      return mcpService.createMcpService(service);
    } catch (error) {
      ipcLogger.error('创建MCP服务失败:', error);
      throw error;
    }
  });

  ipcMain.handle('update-mcp-service', async (_, id: string, service: any) => {
    try {
      return mcpService.updateMcpService(id, service);
    } catch (error) {
      ipcLogger.error(`更新MCP服务 ${id} 失败:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-mcp-service', async (_, id: string) => {
    try {
      return mcpService.deleteMcpService(id);
    } catch (error) {
      ipcLogger.error(`删除MCP服务 ${id} 失败:`, error);
      throw error;
    }
  });
  
  ipcMain.handle('import-mcp-service', async (_, jsonConfig: string) => {
    try {
      return mcpService.importMcpServiceFromJson(jsonConfig);
    } catch (error) {
      ipcLogger.error('导入MCP服务失败:', error);
      throw error;
    }
  });
  
  ipcMain.handle('validate-mcp-service', async (_, service: any) => {
    try {
      mcpLogger.info('验证MCP服务:', service.name);
      
      // 根据服务类型进行验证
      if (service.type === 'stdio') {
        // 验证命令是否存在
        if (!service.command) {
          throw new Error('命令不能为空');
        }
        
        mcpLogger.info('验证stdio服务成功');
        return { valid: true, message: '验证成功' };
      } else if (service.type === 'http') {
        // 验证URL是否有效
        if (!service.request_url) {
          throw new Error('请求URL不能为空');
        }
        
        try {
          // 尝试解析URL
          new URL(service.request_url);
          mcpLogger.info('验证http服务成功');
          return { valid: true, message: '验证成功' };
        } catch (error) {
          throw new Error('无效的URL格式');
        }
      } else {
        throw new Error('不支持的MCP服务类型');
      }
    } catch (error) {
      mcpLogger.error('验证MCP服务失败:', error);
      return { valid: false, message: (error as Error).message || '验证失败' };
    }
  });
  
  // MCP服务健康检查
  ipcMain.handle('mcp-health-check', async (_, serviceId?: string) => {
    try {
      if (serviceId) {
        // 检查单个服务
        const result = await checkMcpServiceHealth(serviceId);
        mcpLogger.info(`MCP服务健康检查完成 - 服务ID: ${serviceId}`, result);
        return result;
      } else {
        // 检查所有服务
        const results = await checkAllMcpServicesHealth();
        mcpLogger.info(`所有MCP服务健康检查完成`, { totalServices: Object.keys(results).length });
        return results;
      }
    } catch (error) {
      mcpLogger.error('MCP服务健康检查失败:', error);
      throw error;
    }
  });
  
  // 清理不健康的MCP客户端
  ipcMain.handle('mcp-cleanup-unhealthy', async () => {
    try {
      const cleanupResults = await cleanupUnhealthyMcpClients();
      mcpLogger.info('清理不健康MCP客户端完成', cleanupResults);
      return cleanupResults;
    } catch (error) {
      mcpLogger.error('清理不健康MCP客户端失败:', error);
      throw error;
    }
  });
  
  // 重置MCP客户端池
  ipcMain.handle('mcp-reset-pool', async () => {
    try {
      mcpClientPool.clear();
      mcpLogger.info('MCP客户端池已重置');
      return { success: true, message: 'MCP客户端池已重置' };
    } catch (error) {
      mcpLogger.error('重置MCP客户端池失败:', error);
      throw error;
    }
  });
  
  // 获取MCP连接状态
  ipcMain.handle('mcp-get-connection-status', async () => {
    try {
      const status = {
        poolSize: mcpClientPool.size,
        connections: Array.from(mcpClientPool.keys())
      };
      mcpLogger.info('获取MCP连接状态', status);
      return status;
    } catch (error) {
      mcpLogger.error('获取MCP连接状态失败:', error);
      throw error;
    }
  });

  // MCP服务调用
  ipcMain.handle('call-mcp-service', async (event, serviceId: string, method: string, params?: any) => {
    const startTime = Date.now();
    mcpLogger.info(`开始调用MCP服务 - 服务ID: ${serviceId}, 方法: ${method}`);
    
    try {
      // 获取MCP服务信息
      const service = mcpService.getMcpService(serviceId);
      if (!service) {
        mcpLogger.error(`未找到MCP服务:`, { serviceId });
        throw new Error(`未找到ID为 ${serviceId} 的MCP服务`);
      }
      
      mcpLogger.info(`MCP服务信息:`, { 
        id: service.id,
        name: service.name, 
        type: service.type
      });
      
      // 发送进度更新
      event.sender.send('mcp-call-progress', {
        status: 'starting',
        message: `正在调用 ${service.name} 服务...`,
        service: service.name,
        method
      });
      
      return new Promise((resolve, reject) => {
        // 根据服务类型调用不同的处理方法
        let callPromise;
        
        if (service.type === 'stdio') {
          callPromise = callStdioMcpService(service, method, params, (progress) => {
            event.sender.send('mcp-call-progress', progress);
          });
        } else if (service.type === 'http') {
          callPromise = callHttpMcpService(service, method, params, (progress) => {
            event.sender.send('mcp-call-progress', progress);
          });
        } else {
          throw new Error(`不支持的MCP服务类型: ${service.type}`);
        }
        
        callPromise.then((result) => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          mcpLogger.info(`MCP服务调用成功 - 耗时: ${duration}ms`, { 
            serviceId,
            method,
            result_preview: JSON.stringify(result).substring(0, 100)
          });
          
          // 发送完成信号
          event.sender.send('mcp-call-done', {
            serviceId,
            method,
            result,
            duration
          });
          
          resolve(result);
        }).catch(error => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          mcpLogger.error(`MCP服务调用失败 - 耗时: ${duration}ms`, error);
          
          // 发送错误信号
          event.sender.send('mcp-call-error', {
            serviceId,
            method,
            error: (error as Error).message || '调用失败',
            duration
          });
          
          reject(error);
        });
      });
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      mcpLogger.error(`MCP服务调用失败 - 耗时: ${duration}ms`, error);
      
      // 发送错误信号
      event.sender.send('mcp-call-error', {
        serviceId,
        method,
        error: (error as Error).message || '调用失败',
        duration
      });
      
      throw error;
    }
  });
  
  // MCP服务调用辅助函数 - 使用MCP TypeScript SDK
  async function callStdioMcpService(service: any, method: string, params: any, onProgress: (progress: any) => void) {
    const { McpClient } = require('@modelcontextprotocol/sdk/client/mcp.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      onProgress({
        status: 'executing',
        message: `正在执行命令: ${service.command}`,
        service: service.name,
        method
      });
      
      try {
        // 解析命令和参数
        // 将换行分隔的args字符串转换为数组
        const args = service.args ? service.args.split('\n').filter(arg => arg.trim() !== '') : [];
        
        // 创建子进程
        const child = spawn(service.command, args, {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // 创建MCP客户端和传输层
        const transport = new StdioClientTransport(child.stdin, child.stdout);
        const client = new McpClient();
        
        // 连接到MCP服务器
        client.connect(transport).then(async () => {
          onProgress({
            status: 'connected',
            message: '已连接到MCP服务器，正在调用方法...',
            service: service.name,
            method
          });
          
          try {
            // 获取服务器信息
            const serverInfo = await client.getServerInfo();
            mcpLogger.info(`连接到MCP服务器: ${serverInfo.name} v${serverInfo.version}`);
            
            // 根据方法类型调用不同的API
            let result;
            
            if (method === 'execute' || method === 'test') {
              // 获取可用工具列表
              const tools = await client.listTools();
              if (tools && tools.length > 0) {
                // 使用第一个可用工具
                const tool = tools[0];
                mcpLogger.info(`使用工具: ${tool.id} - ${tool.title}`);
                
                // 调用工具
                result = await client.callTool(tool.id, params || {});
              } else {
                // 获取可用资源列表
                const resources = await client.listResources();
                if (resources && resources.length > 0) {
                  // 使用第一个可用资源
                  const resource = resources[0];
                  mcpLogger.info(`使用资源: ${resource.id} - ${resource.title}`);
                  
                  // 获取资源内容
                  result = await client.getResource(resource.id);
                } else {
                  throw new Error('没有可用的工具或资源');
                }
              }
            } else {
              // 直接调用指定方法
              result = await client.callTool(method, params || {});
            }
            
            // 断开连接
            await client.disconnect();
            
            // 返回结果
            resolve(result);
          } catch (error) {
            mcpLogger.error('MCP调用失败:', error);
            await client.disconnect();
            reject(error);
          }
        }).catch(error => {
          mcpLogger.error('MCP连接失败:', error);
          reject(new Error(`连接MCP服务器失败: ${(error as Error).message}`));
        });
        
        // 处理标准错误输出
        let stderr = '';
        child.stderr.on('data', (data) => {
          stderr += data.toString();
          mcpLogger.warn(`MCP服务标准错误输出: ${data.toString()}`);
        });
        
        // 处理子进程错误
        child.on('error', (error) => {
          mcpLogger.error('MCP子进程错误:', error);
          reject(new Error(`命令执行错误: ${(error as Error).message}`));
        });
        
        // 处理子进程退出
        child.on('close', (code) => {
          if (code !== 0) {
            mcpLogger.error(`MCP子进程异常退出，退出码: ${code}, 错误: ${stderr}`);
            reject(new Error(`命令执行失败，退出码: ${code}, 错误: ${stderr}`));
          }
        });
      } catch (error) {
        mcpLogger.error('MCP服务调用准备失败:', error);
        reject(new Error(`解析命令参数失败: ${(error as Error).message}`));
      }
    });
  }
  
  async function callHttpMcpService(service: any, method: string, params: any, onProgress: (progress: any) => void) {
    const { McpClient } = require('@modelcontextprotocol/sdk/client/mcp.js');
    const { HttpClientTransport } = require('@modelcontextprotocol/sdk/client/http.js');
    
    return new Promise((resolve, reject) => {
      onProgress({
        status: 'connecting',
        message: `正在连接到 ${service.request_url}`,
        service: service.name,
        method
      });
      
      try {
        // 创建MCP客户端和HTTP传输层
        const transport = new HttpClientTransport(service.request_url);
        const client = new McpClient();
        
        // 连接到MCP服务器
        client.connect(transport).then(async () => {
          onProgress({
            status: 'connected',
            message: '已连接到MCP服务器，正在调用方法...',
            service: service.name,
            method
          });
          
          try {
            // 获取服务器信息
            const serverInfo = await client.getServerInfo();
            mcpLogger.info(`连接到HTTP MCP服务器: ${serverInfo.name} v${serverInfo.version}`);
            
            // 根据方法类型调用不同的API
            let result;
            
            if (method === 'execute' || method === 'test') {
              // 获取可用工具列表
              const tools = await client.listTools();
              if (tools && tools.length > 0) {
                // 使用第一个可用工具
                const tool = tools[0];
                mcpLogger.info(`使用工具: ${tool.id} - ${tool.title}`);
                
                // 调用工具
                result = await client.callTool(tool.id, params || {});
              } else {
                // 获取可用资源列表
                const resources = await client.listResources();
                if (resources && resources.length > 0) {
                  // 使用第一个可用资源
                  const resource = resources[0];
                  mcpLogger.info(`使用资源: ${resource.id} - ${resource.title}`);
                  
                  // 获取资源内容
                  result = await client.getResource(resource.id);
                } else {
                  throw new Error('没有可用的工具或资源');
                }
              }
            } else {
              // 直接调用指定方法
              result = await client.callTool(method, params || {});
            }
            
            // 断开连接
            await client.disconnect();
            
            // 返回结果
            resolve(result);
          } catch (error) {
            mcpLogger.error('HTTP MCP调用失败:', error);
            await client.disconnect();
            reject(error);
          }
        }).catch(error => {
          mcpLogger.error('HTTP MCP连接失败:', error);
          reject(new Error(`连接HTTP MCP服务器失败: ${(error as Error).message}`));
        });
      } catch (error) {
        mcpLogger.error('HTTP MCP服务调用准备失败:', error);
        reject(new Error(`HTTP MCP服务调用准备失败: ${(error as Error).message}`));
      }
    });
  }
  
  // API请求相关
  ipcMain.handle('call-api', async (event, assistantId: string, messages: any[], conversationId?: number, temperature?: number, maxTokens?: number, mcpServices?: any[]) => {
    const startTime = Date.now();
    apiLogger.info(`开始API请求 - 助手ID: ${assistantId}, 消息数量: ${messages.length}`);
    
    try {
      // 获取助手信息
      const assistant = assistantService.getAssistant(assistantId);
      apiLogger.info(`助手信息:`, { assistant });
      if (!assistant) {
        apiLogger.error(`未找到助手:`, { assistantId });
        throw new Error(`未找到ID为 ${assistantId} 的助手`);
      }
      
      // 获取对话信息，用于获取对话特定的temperature和maxTokens
      let conversationSettings: { temperature?: number; max_tokens?: number } = {};
      if (conversationId) {
        const conversation = conversationService.getConversation(conversationId);
        if (conversation) {
          conversationSettings = {
            temperature: conversation.temperature,
            max_tokens: conversation.max_tokens
          };
        }
      }
      
      // 创建一个包含所有必要信息的配置对象
      const apiConfig = {
        ...assistant,
        // 优先使用函数参数中的temperature和maxTokens，其次是对话中的设置，最后是助手/模型的默认值
        temperature: temperature !== undefined ? temperature : 
                    conversationSettings.temperature !== undefined ? conversationSettings.temperature : 
                    assistant.default_temperature || assistant.temperature || 0.7,
        max_tokens: maxTokens !== undefined ? maxTokens : 
                   conversationSettings.max_tokens !== undefined ? conversationSettings.max_tokens : 
                   assistant.default_max_tokens || assistant.max_tokens || 2048
      };
      
      apiLogger.info(`助手信息:`, { 
        id: assistant.id,
        name: assistant.name, 
        type: assistant.model_type, 
        model: assistant.model_name,
        model_display_name: assistant.model_display_name,
        api_url: assistant.api_url,
        temperature: apiConfig.temperature,
        max_tokens: apiConfig.max_tokens
      });
      
      // 记录消息内容摘要
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        apiLogger.info(`最新消息:`, { 
          role: lastMessage.role, 
          content_preview: lastMessage.content.substring(0, 100) + (lastMessage.content.length > 100 ? '...' : '')
        });
      }
      
      // 记录选中的MCP服务
      if (mcpServices && mcpServices.length > 0) {
        apiLogger.info(`选中的MCP服务:`, {
          count: mcpServices.length,
          services: mcpServices.map(s => ({ id: s.id, name: s.name, type: s.type }))
        });
      }
      
      return new Promise(async (resolve, reject) => {
        // 创建进度回调函数，用于流式输出
        const onProgress = (text) => {
          // 发送流式更新到渲染进程，包含对话ID以实现对话级别的事件
          event.sender.send('api-stream-response', {
            conversationId: conversationId,
            text: text
          });
        };
        
        // 根据助手类型调用不同的API
        let apiPromise;
        apiLogger.info(`开始调用${assistant.model_type}模型API`);
        
        const apiStartTime = Date.now();
        
        // 准备MCP服务工具信息
        let tools: any[] = [];
        if (mcpServices && mcpServices.length > 0) {
          // 获取所有MCP服务的工具列表并转换为OpenAI工具格式
          tools = await convertMcpServicesToOpenAITools(mcpServices);
          
          apiLogger.info(`已准备 ${tools.length} 个MCP服务工具`);
        }
        
        switch (assistant.model_type) {
          case 'openai':
          case 'azure':
          case 'custom':
            // OpenAI、Azure和自定义类型都使用OpenAI Node.js库处理
            // 如果有MCP服务，则传递tools参数
            apiPromise = callOpenAI(apiConfig, messages, onProgress, tools.length > 0 ? tools : undefined);
            break;
          case 'claude':
            apiPromise = callClaude(apiConfig, messages, onProgress);
            break;
          case 'gemini':
            apiPromise = callGemini(apiConfig, messages, onProgress);
            break;
          case 'ollama':
            apiPromise = callOllama(apiConfig, messages, onProgress);
            break;
          default:
            // 如果是未知类型，尝试使用OpenAI API格式处理
            apiLogger.warn(`未知模型类型 ${assistant.model_type}，尝试使用OpenAI API格式处理`);
            apiPromise = callOpenAI(apiConfig, messages, onProgress);
            break;
        }
        
        // 处理API调用结果
        apiPromise.then(async (response) => {
          const apiEndTime = Date.now();
          const apiDuration = apiEndTime - apiStartTime;
          
          // 处理响应结构
          let responseContent: string;
          let toolCalls: any[] | null = null;
          let toolResults: any[] | null = null;
          
          if (typeof response === 'string') {
            // 兼容旧的字符串返回格式
            responseContent = response;
          } else if (response && typeof response === 'object') {
            // 新的结构化返回格式
            responseContent = response.content || '';
            toolCalls = response.tool_calls;
            toolResults = response.tool_results;
          } else {
            responseContent = String(response || '');
          }
          
          // 记录响应摘要
          apiLogger.info(`API响应成功 - 耗时: ${apiDuration}ms`, { 
            response_preview: responseContent.substring(0, 100) + (responseContent.length > 100 ? '...' : ''),
            response_length: responseContent.length,
            has_tool_calls: !!toolCalls,
            tool_calls_count: toolCalls ? toolCalls.length : 0
          });
          
          const endTime = Date.now();
          const totalDuration = endTime - startTime;
          apiLogger.info(`完成API请求 - 总耗时: ${totalDuration}ms`);
          
          // 将消息存储到数据库
          if (conversationId) {
            try {
              // 如果有工具调用结果，先保存工具调用结果到数据库
              if (toolResults && toolResults.length > 0) {
                for (const toolResult of toolResults) {
                  if (toolResult.tool_call_id && toolResult.content) {
                    const toolMessageId = await messageService.addMessage(
                      conversationId, 
                      'tool', 
                      toolResult.content, 
                      null, 
                      toolResult.tool_call_id
                    );
                    apiLogger.info(`工具调用结果已存储到数据库，消息ID: ${toolMessageId}`);
                  }
                }
              }
              
              // 然后保存助手消息，包含工具调用信息
              const messageId = await messageService.addMessage(conversationId, 'assistant', responseContent, toolCalls);
              apiLogger.info(`AI回复已存储到数据库，消息ID: ${messageId}，对话ID: ${conversationId}`);
            } catch (dbError) {
              apiLogger.error(`存储消息到数据库失败:`, dbError);
            }
          } else {
            apiLogger.warn('未提供对话ID，无法存储消息');
          }
          
          // 发送完成信号，包含对话ID
          event.sender.send('api-stream-done', {
            conversationId: conversationId
          });
          
          // 返回完整响应内容
          resolve(responseContent);
        }).catch(error => {
          const endTime = Date.now();
          const totalDuration = endTime - startTime;
          apiLogger.error(`API调用失败 - 总耗时: ${totalDuration}ms`, error);
          reject(error);
        });
      });
    } catch (error) {
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      apiLogger.error(`API调用失败 - 总耗时: ${totalDuration}ms`, error);
      throw error;
    }
  });
}