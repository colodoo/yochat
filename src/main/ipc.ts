import { ipcMain } from 'electron';
import { conversationService, messageService, assistantService, settingService, modelService, mcpService } from './database/services';
import { checkpointer } from './database/index';
import { createLogger } from './utils/logger';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

// 创建日志记录器
const apiLogger = createLogger('API');
const mcpLogger = createLogger('MCP');
const ipcLogger = createLogger('IPC');
const agentLogger = createLogger('Agent');

// 新的MCP客户端管理器 - 基于LangChain MCP适配器
class LangChainMcpManager {
  private client: MultiServerMCPClient | null = null;
  private tools: any[] = [];
  private isInitialized = false;
  
  async initialize(mcpServices: any[]): Promise<void> {
    if (this.isInitialized && this.client) {
      await this.client.close();
    }
    
    if (!mcpServices || mcpServices.length === 0) {
      mcpLogger.info('没有MCP服务需要初始化');
      this.tools = [];
      this.isInitialized = true;
      return;
    }
    
    try {
      mcpLogger.info(`初始化LangChain MCP客户端，服务数量: ${mcpServices.length}`);
      
      // 构建MCP服务器配置
      const mcpServers: any = {};
      
      for (const service of mcpServices) {
        const serverKey = service.id || service.name;
        
        if (service.type === 'stdio') {
          const args = service.args ? service.args.split('\n').filter(arg => arg.trim() !== '') : [];
          
          // 处理环境变量
          let env = {};
          if (service.env) {
            const envLines = service.env.split('\n').filter(line => line.trim() !== '');
            for (const line of envLines) {
              const [key, ...valueParts] = line.split('=');
              if (key && valueParts.length > 0) {
                env[key.trim()] = valueParts.join('=').trim();
              }
            }
          }
          
          mcpServers[serverKey] = {
            transport: 'stdio',
            command: service.command,
            args: args,
            env: env, // 只使用用户配置的环境变量
            restart: {
              enabled: true,
              maxAttempts: 3,
              delayMs: 1000,
            },
          };
        } else if (service.type === 'http') {
          const headers = service.request_headers ? JSON.parse(service.request_headers) : {};
          
          mcpServers[serverKey] = {
            url: service.request_url,
            headers: {
              'User-Agent': 'YoChat/1.0.0',
              ...headers
            },
            reconnect: {
              enabled: true,
              maxAttempts: 5,
              delayMs: 2000,
            },
          };
        }
      }
      
      // 创建MultiServerMCPClient
      this.client = new MultiServerMCPClient({
        throwOnLoadError: false, // 不因单个工具加载失败而抛出错误
        prefixToolNameWithServerName: true, // 为工具名称添加服务器前缀
        additionalToolNamePrefix: 'mcp', // 额外的工具名称前缀
        useStandardContentBlocks: true, // 使用标准化内容块格式
        mcpServers
      });
      
      // 获取所有工具
      this.tools = await this.client.getTools();
      this.isInitialized = true;
      
      mcpLogger.info(`LangChain MCP客户端初始化成功，获取到${this.tools.length}个工具`);
      
    } catch (error) {
      mcpLogger.error('LangChain MCP客户端初始化失败:', error);
      this.tools = [];
      this.isInitialized = true;
      throw error;
    }
  }
  
  getTools(): any[] {
    return this.tools;
  }
  
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        mcpLogger.info('LangChain MCP客户端已关闭');
      } catch (error) {
        mcpLogger.warn('关闭LangChain MCP客户端时出错:', error);
      }
      this.client = null;
    }
    this.tools = [];
    this.isInitialized = false;
  }
}

// 全局LangChain MCP管理器实例
const langChainMcpManager = new LangChainMcpManager();

// 跟踪当前正在进行的流式请求
const activeStreamRequests = new Map<number, { abortController: AbortController, isActive: boolean }>();

// MCP客户端连接池
class McpClientPool {
  private clients: Map<string, any> = new Map();
  private processes: Map<string, any> = new Map();
  private connectionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly CONNECTION_TIMEOUT = 30000; // 30秒连接超时
  private readonly IDLE_TIMEOUT = 300000; // 5分钟空闲超时
  // private readonly MAX_RETRIES = 3; // 最大重试次数
  
  async getClient(service: any): Promise<any> {
    const clientKey = `${service.type}_${service.id}`;
    
    if (this.clients.has(clientKey)) {
      mcpLogger.info(`从连接池获取MCP客户端: ${clientKey}`, JSON.stringify(service));
      const clientInfo = this.clients.get(clientKey);
      // 检查连接是否仍然有效
      if (clientInfo.client) {
        return clientInfo.client
      }
    }
    mcpLogger.info(`MCP客户端不存在，创建新连接: ${clientKey}`, JSON.stringify(service));
    // 创建新的客户端连接
    const clientInfo = this.createClient(service);
    mcpLogger.info(`MCP客户端创建成功: ${clientKey}`, clientInfo);
    this.clients.set(clientKey, clientInfo);
    
    // 设置空闲超时
    this.resetIdleTimeout(clientKey, service);
    
    return clientInfo;
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
     // 将换行分隔的args字符串转换为数组
        const args = service.args ? service.args.split('\n').filter(arg => arg.trim() !== '') : [];
        
        mcpLogger.info(`MCP服务 args: ${args}`)
        // 处理环境变量
        let env = {};
        mcpLogger.info(`MCP服务环境变量: ${service.env}`)
        if (service.env) {
          const envLines = service.env.split('\n').filter(line => line.trim() !== '');
          for (const line of envLines) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
              env[key.trim()] = valueParts.join('=').trim();
            }
          }
        }
        
        mcpLogger.info(`创建MCP客户端连接: ${service.command} ${args.join(' ')}`);
        if (service.env) {
          mcpLogger.info(`环境变量: ${JSON.stringify(env)}`);
        }
        
        const params = {
          command: service.command,
          args: args,
          env: env
        }
        mcpLogger.info(`创建MCP客户端连接参数: ${JSON.stringify(params)}`)
        // // 如果存在env则设置循环env对象临时环境变量
        // if (env) {
        //   for (const key in env) {
        //     process.env[key] = env[key];
        //   }
        // }
        // mcpLogger.info(`process.env`, JSON.stringify(process.env))
        // 使用StdioClientTransport直接创建传输层，不使用child_process
        const transport = new StdioClientTransport(params);
        
        const client = new Client({
          name: 'yochat-client',
          version: '1.0.0'
        });
        try {
          // 连接到MCP服务器
          await client.connect(transport);
        } catch (error) {
          mcpLogger.error('MCP客户端连接失败:', error);
        }
        
        const clientInfo = {
          client,
          transport,
          service
        };
        
        mcpLogger.info(`MCP客户端已连接: ${service.name}`);
        return clientInfo;
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
  langChainMcpManager.close();
});

process.on('SIGINT', () => {
  mcpClientPool.closeAll();
  langChainMcpManager.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  mcpClientPool.closeAll();
  langChainMcpManager.close();
  process.exit(0);
});

// 创建LLM实例的工厂函数
function createLLMInstance(assistant: any): any {
  const modelType = assistant.model_type?.toLowerCase() || 'openai';
  
  switch (modelType) {
    case 'openai':
    case 'custom':
      return new ChatOpenAI({
        modelName: assistant.model_name || 'gpt-3.5-turbo',
        temperature: assistant.temperature || 0.7,
        maxTokens: assistant.max_tokens || 2048,
        openAIApiKey: assistant.api_key,
        configuration: {
          baseURL: assistant.api_url || 'https://api.openai.com'
        }
      });
    
    case 'claude':
      return new ChatAnthropic({
        modelName: assistant.model_name || 'claude-3-sonnet-20240229',
        temperature: assistant.temperature || 0.7,
        maxTokens: assistant.max_tokens || 2048,
        anthropicApiKey: assistant.api_key,
        anthropicApiUrl: assistant.api_url
      });
    
    case 'gemini':
      return new ChatGoogleGenerativeAI({
        modelName: assistant.model_name || 'gemini-pro',
        temperature: assistant.temperature || 0.7,
        maxOutputTokens: assistant.max_tokens || 2048,
        apiKey: assistant.api_key
      });
    
    case 'ollama':
      return new ChatOllama({
        model: assistant.model_name || 'llama2',
        temperature: assistant.temperature || 0.7,
        numCtx: assistant.max_tokens || 2048,
        baseUrl: assistant.api_url || 'http://localhost:11434'
      });
    
    default:
      // 默认使用OpenAI兼容格式
      return new ChatOpenAI({
        modelName: assistant.model_name || 'gpt-3.5-turbo',
        temperature: assistant.temperature || 0.7,
        maxTokens: assistant.max_tokens || 2048,
        openAIApiKey: assistant.api_key,
        configuration: {
          baseURL: assistant.api_url || 'https://api.openai.com'
        }
      });
  }
}

// 基于LangChain的API调用函数
async function callLangChainAPI(llm: any, messages: any[], tools?: any[], onProgress?: (text: string) => void, abortSignal?: AbortSignal, conversationId?: string): Promise<any> {
  try {
    agentLogger.info(`🚀 [LangChain] 开始调用模型，工具数量: ${tools?.length || 0}`);
    
    // 转换消息格式为LangChain格式
    const langChainMessages = messages.map(msg => {
      if (msg.role === 'system') {
        return new SystemMessage(msg.content);
      } else if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      }
      return new HumanMessage(msg.content);
    });
    
    // 根据是否有工具来决定使用Agent还是直接调用模型
     if (tools && tools.length > 0) {
       // 使用LangGraph的预构建React Agent处理工具调用
       agentLogger.info(`🔧 [LangChain] 使用React Agent处理${tools.length}个工具`);
       
       const agent = createReactAgent({
         llm: llm,
         tools,
         checkpointer
       });
       
       // 为每个对话创建唯一的线程ID
       const threadId = conversationId ? `conversation_${conversationId}` : `thread_${Date.now()}`;
       
       if (onProgress) {
         onProgress(`🤖 **正在使用Agent模式处理您的请求...**\n\n`);
       }
      
      // 使用流式执行Agent
      let responseContent = '';
      let toolSteps: string[] = [];
      let isThinking = false;
      let currentToolName = '';
      
      // 收集工具调用信息
      const toolCalls: any[] = [];
      const toolResults: any[] = [];
      let currentToolCall: any = null;
      
      try {
        const streamEvents = agent.streamEvents(
          {
            messages: langChainMessages
          },
          { 
            version: 'v2',
            signal: abortSignal, // 传递取消信号
            configurable: {
              thread_id: threadId
            }
          }
        );
        
        for await (const event of streamEvents) {
          // 检查是否已被取消
          if (abortSignal?.aborted) {
            agentLogger.info('🛑 [LangChain] 流式处理被用户取消');
            throw new Error('Request aborted by user');
          }
          
          // agentLogger.debug(`[StreamEvent] ${event.event}: ${event.name}`);
          
          // 处理不同类型的流式事件
          if (event.event === 'on_chat_model_stream') {
            // LLM token流式输出
            const chunk = event.data?.chunk;
            if (chunk?.content && onProgress) {
              responseContent += chunk.content;
              // 实时显示当前内容加上工具执行步骤
              const fullContent = responseContent + (toolSteps.length > 0 ? '\n\n' + toolSteps.join('\n') : '');
              onProgress(fullContent);
            }
          } else if (event.event === 'on_chat_model_start') {
            // 模型开始思考
            if (!isThinking && onProgress) {
              isThinking = true;
              const thinkingMsg = responseContent + '\n\n🤔 **正在思考...**';
              onProgress(thinkingMsg);
            }
          } else if (event.event === 'on_tool_start') {
            // 工具开始执行
            currentToolName = event.name || '未知工具';
            const toolStep = `🔧 **正在执行工具: ${currentToolName}**`;
            toolSteps.push(toolStep);
            
            // 收集工具调用信息
            const toolInput = event.data?.input;
            currentToolCall = {
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              function: {
                name: currentToolName,
                arguments: toolInput ? JSON.stringify(toolInput) : '{}'
              }
            };
            toolCalls.push(currentToolCall);
            
            if (onProgress) {
              const fullContent = responseContent + '\n\n' + toolSteps.join('\n');
              onProgress(fullContent);
            }
            
            agentLogger.info(`🔧 [Tool] 开始执行工具: ${currentToolName}`);
          } else if (event.event === 'on_tool_end') {
            // 工具执行完成
            const toolName = event.name || currentToolName;
            const toolOutput = event.data?.output;
            
            // 收集工具结果信息
            if (currentToolCall) {
              const toolResult = {
                tool_call_id: currentToolCall.id,
                content: typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput)
              };
              toolResults.push(toolResult);
            }
            
            // 更新最后一个工具步骤的状态
            if (toolSteps.length > 0) {
              toolSteps[toolSteps.length - 1] = `✅ **工具 ${toolName} 执行完成**`;
              
              // 添加工具输出摘要（如果有的话）
              if (toolOutput && typeof toolOutput === 'string') {
                const summary = toolOutput.length > 150 
                  ? toolOutput.substring(0, 150) + '...'
                  : toolOutput;
                toolSteps.push(`   📋 结果: ${summary}`);
              }
            }
            
            if (onProgress) {
              const fullContent = responseContent + '\n\n' + toolSteps.join('\n');
              onProgress(fullContent);
            }
            
            agentLogger.info(`✅ [Tool] 工具 ${toolName} 执行完成`);
          } else if (event.event === 'on_chain_start' && event.name === 'RunnableSequence') {
            // Agent链开始执行
            agentLogger.info(`🚀 [Agent] 开始执行Agent链`);
          } else if (event.event === 'on_chain_end' && event.name === 'RunnableSequence') {
            // Agent执行完成，获取最终结果
            const output = event.data?.output;
            if (output && output.messages) {
              const finalMessage = output.messages[output.messages.length - 1];
              if (finalMessage && finalMessage.content) {
                // 如果最终内容与当前流式内容不同，使用最终内容
                if (finalMessage.content !== responseContent) {
                  responseContent = finalMessage.content;
                  if (onProgress) {
                    onProgress(responseContent);
                  }
                }
              }
            }
            agentLogger.info(`🏁 [Agent] Agent链执行完成`);
          }
        }
      } catch (streamError) {
        agentLogger.warn('流式处理出错，回退到普通调用:', streamError);
        
        // 回退到普通的invoke调用
        const result = await agent.invoke(
          {
            messages: langChainMessages
          },
          {
            signal: abortSignal, // 传递取消信号
            configurable: {
              thread_id: threadId
            }
          }
        );
        
        const finalMessage = result.messages[result.messages.length - 1];
        responseContent = finalMessage.content || '';
        
        if (onProgress) {
          onProgress(responseContent);
        }
      }
      
      agentLogger.info(`✅ [LangChain] React Agent执行完成`);
      
      return {
        content: responseContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : null,
        tool_results: toolResults.length > 0 ? toolResults : null
      };
    } else {
      // 直接调用模型（无工具）
      agentLogger.info(`💭 [LangChain] 直接调用模型（无工具）`);
      
      if (onProgress) {
        onProgress(`🤖 **正在处理您的请求...**\n\n`);
      }
      
      let responseContent = '';
      
      try {
        // 使用流式调用
        const stream = await llm.stream(langChainMessages, {
          signal: abortSignal
        });
        
        for await (const chunk of stream) {
          if (abortSignal?.aborted) {
            agentLogger.info('🛑 [LangChain] 流式处理被用户取消');
            throw new Error('Request aborted by user');
          }
          
          if (chunk.content && onProgress) {
            responseContent += chunk.content;
            onProgress(responseContent);
          }
        }
      } catch (streamError) {
        agentLogger.warn('流式处理出错，回退到普通调用:', streamError);
        
        // 回退到普通调用
        const result = await llm.invoke(langChainMessages, {
          signal: abortSignal
        });
        
        responseContent = result.content || '';
        
        if (onProgress) {
          onProgress(responseContent);
        }
      }
      
      agentLogger.info(`✅ [LangChain] 模型调用完成`);
      
      return {
        content: responseContent,
        tool_calls: null,
        tool_results: null
      };
    }
    
  } catch (error) {
    agentLogger.error('❌ [LangChain] API调用失败:', error);
    if (onProgress) {
      onProgress(`❌ **调用失败: ${(error as Error).message}**\n\n`);
    }
    throw error;
  }
}

// MCP 服务健康检查
async function checkMcpServiceHealth(service: any): Promise<boolean> {
  try {
    mcpLogger.info(`检查MCP服务健康状态: ${service.name}`);
    
    const clientInfo = await mcpClientPool.getClient(service);
    // mcpLogger.info(`获取MCP服务客户端: `, clientInfo);
    const client = clientInfo.client || clientInfo;
    mcpLogger.info(`MCP服务 ${service.name} 健康检查通过:`)
    return client;
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
  
  // 测试MCP服务连接
  ipcMain.handle('mcp-test-connection', async (_, serviceId: string) => {
    try {
      mcpLogger.info(`测试MCP服务连接: ${serviceId}`);
      
      const service = mcpService.getMcpService(serviceId);
      if (!service) {
        throw new Error('MCP服务不存在');
      }
      
      mcpLogger.info('checkMcpServiceHealth', JSON.stringify(service))
      // 测试连接
      const isHealthy = await checkMcpServiceHealth(service);
      
      if (isHealthy) {
        mcpLogger.info(`MCP服务连接测试成功: ${service.name}`);
        return {
          success: true,
          message: '连接测试成功'
        };
      } else {
        mcpLogger.warn(`MCP服务连接测试失败: ${service.name}`);
        return {
          success: false,
          error: '连接测试失败，服务不可用'
        };
      }
    } catch (error) {
      mcpLogger.error(`测试MCP服务连接失败:`, error);
      return {
        success: false,
        error: (error as Error).message || '连接测试失败'
      };
    }
  });
  
  // 更新MCP服务状态
  ipcMain.handle('mcp-update-status', async (_, serviceId: string, status: string) => {
    try {
      mcpLogger.info(`更新MCP服务状态: ${serviceId} -> ${status}`);
      
      const result = mcpService.updateMcpServiceStatus(serviceId, status);
      
      if (result.changes > 0) {
        mcpLogger.info(`MCP服务状态更新成功: ${serviceId}`);
        return {
          success: true,
          message: '状态更新成功'
        };
      } else {
        mcpLogger.warn(`MCP服务状态更新失败，服务不存在: ${serviceId}`);
        return {
          success: false,
          error: 'MCP服务不存在'
        };
      }
    } catch (error) {
      mcpLogger.error(`更新MCP服务状态失败:`, error);
      return {
        success: false,
        error: (error as Error).message || '状态更新失败'
      };
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
        // 创建AbortController用于取消请求
        const abortController = new AbortController();
        
        // 如果有对话ID，记录活动请求
        if (conversationId) {
          activeStreamRequests.set(conversationId, {
            abortController,
            isActive: true
          });
        }
        
        // 创建进度回调函数，用于流式输出
        const onProgress = (text) => {
          // 检查请求是否已被取消
          if (abortController.signal.aborted) {
            return;
          }
          
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
        
        // 创建LLM实例
        const llm = createLLMInstance(assistant);
        
        // 初始化MCP服务并获取工具
        let tools: any[] | undefined = undefined;
        if (mcpServices && mcpServices.length > 0) {
          apiLogger.info(`初始化${mcpServices.length}个MCP服务`);
          await langChainMcpManager.initialize(mcpServices);
          tools = langChainMcpManager.getTools();
          apiLogger.info(`获取到${tools.length}个MCP工具`);
        }
        
        // 统一使用callLangChainAPI处理所有模型类型
        apiLogger.info(`使用LangChain方式调用${assistant.model_type}模型: ${assistant.model_name}`);
        apiPromise = callLangChainAPI(llm, messages, tools, onProgress, abortController.signal, conversationId);
        
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
          // 清理活动请求记录
          if (conversationId && activeStreamRequests.has(conversationId)) {
            activeStreamRequests.delete(conversationId);
          }
          
          resolve(responseContent);
        }).catch(error => {
          const endTime = Date.now();
          const totalDuration = endTime - startTime;
          
          // 清理活动请求记录
          if (conversationId && activeStreamRequests.has(conversationId)) {
            activeStreamRequests.delete(conversationId);
          }
          
          // 检查是否是用户主动取消
          if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            apiLogger.info(`API调用被用户取消 - 总耗时: ${totalDuration}ms`);
            event.sender.send('api-stream-cancelled', {
              conversationId: conversationId
            });
            resolve(''); // 返回空字符串而不是错误
          } else {
            apiLogger.error(`API调用失败 - 总耗时: ${totalDuration}ms`, error);
            reject(error);
          }
        });
      });
    } catch (error) {
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      
      // 清理活动请求记录
      if (conversationId && activeStreamRequests.has(conversationId)) {
        activeStreamRequests.delete(conversationId);
      }
      
      apiLogger.error(`API调用失败 - 总耗时: ${totalDuration}ms`, error);
      throw error;
    }
  });
}

// 停止生成API
ipcMain.handle('stop-generation', async (_, conversationId: number) => {
  try {
    ipcLogger.info(`收到停止生成请求，对话ID: ${conversationId}`);
    
    if (activeStreamRequests.has(conversationId)) {
      const requestInfo = activeStreamRequests.get(conversationId)!;
      
      if (requestInfo.isActive) {
        // 中止请求
        requestInfo.abortController.abort();
        requestInfo.isActive = false;
        
        ipcLogger.info(`已中止对话 ${conversationId} 的流式请求`);
        return { success: true, message: '生成已停止' };
      } else {
        ipcLogger.warn(`对话 ${conversationId} 的请求已经不活跃`);
        return { success: false, message: '请求已经结束' };
      }
    } else {
      ipcLogger.warn(`未找到对话 ${conversationId} 的活跃请求`);
      return { success: false, message: '未找到活跃的生成请求' };
    }
  } catch (error) {
    ipcLogger.error('停止生成失败:', error);
    return { success: false, message: '停止生成失败' };
  }
});