import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { CapacitorHttp } from '@capacitor/core'

// 模拟Electron API的接口
export interface CapacitorAPI {
  conversations: {
    getAll: () => Promise<any[]>
    get: (id: number) => Promise<any>
    create: (title: string, assistantId: string, temperature?: number, maxTokens?: number) => Promise<number>
    update: (id: number, data: any) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  messages: {
    getByConversation: (conversationId: number) => Promise<any[]>
    add: (conversationId: number, role: string, content: string, toolCalls?: any[], toolCallId?: string) => Promise<number>
    deleteAll: (conversationId: number) => Promise<void>
    delete: (messageId: number) => Promise<void>
  }
  models: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (model: any) => Promise<string>
    update: (id: string, model: any) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  assistants: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (assistant: any) => Promise<string>
    update: (id: string, assistant: any) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  mcp: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (service: any) => Promise<string>
    update: (id: string, service: any) => Promise<void>
    delete: (id: string) => Promise<void>
    import: (jsonConfig: string) => Promise<string>
    call: (serviceId: string, method: string, params?: any) => Promise<any>
    onCallProgress: (callback: (data: any) => void) => () => void
    onCallDone: (callback: (result: any) => void) => () => void
    onCallError: (callback: (error: any) => void) => () => void
  }
  settings: {
    getAll: () => Promise<any[]>
    get: (key: string) => Promise<string | null>
    update: (key: string, value: string) => Promise<void>
  }
  ai: {
    callApi: (assistantId: string, messages: any[], conversationId?: number, temperature?: number, maxTokens?: number, mcpServices?: any[]) => Promise<void>
    stopGeneration: (conversationId: number) => Promise<void>
    onStreamResponse: (callback: (data: any) => void) => () => void
    onStreamDone: (callback: (data: any) => void) => () => void
    onStreamCancelled: (callback: (data: any) => void) => () => void
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    unmaximize: () => void
    isMaximized: () => Promise<boolean>
  }
  navigation: {
    onNavigateTo: (callback: (route: string) => void) => () => void
  }
  openCodeRunner: (data: { code: string, title: string, language: string }) => void
  closeCodeRunner: () => void
  codeRunnerReady: () => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
}

// 事件监听器管理
class EventManager {
  private listeners: Map<string, Set<Function>> = new Map()
  
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }
  
  off(event: string, callback: Function) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.delete(callback)
    }
  }
  
  emit(event: string, ...args: any[]) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(...args))
    }
  }
}

const eventManager = new EventManager()

// 本地存储管理
class LocalStorage {
  static async getItem(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const result = await Preferences.get({ key })
      return result.value
    } else {
      return localStorage.getItem(key)
    }
  }
  
  static async setItem(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value })
    } else {
      localStorage.setItem(key, value)
    }
  }
  
  static async removeItem(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  }
}

// 数据存储管理（简化版，实际应用中可能需要更复杂的数据库）
class DataManager {
  private static async getData(key: string): Promise<any[]> {
    const data = await LocalStorage.getItem(key)
    return data ? JSON.parse(data) : []
  }
  
  private static async setData(key: string, data: any[]): Promise<void> {
    await LocalStorage.setItem(key, JSON.stringify(data))
  }
  
  static async getConversations(): Promise<any[]> {
    return this.getData('conversations')
  }
  
  static async saveConversations(conversations: any[]): Promise<void> {
    await this.setData('conversations', conversations)
  }
  
  static async getMessages(): Promise<any[]> {
    return this.getData('messages')
  }
  
  static async saveMessages(messages: any[]): Promise<void> {
    await this.setData('messages', messages)
  }
  
  static async getModels(): Promise<any[]> {
    return this.getData('models')
  }
  
  static async saveModels(models: any[]): Promise<void> {
    await this.setData('models', models)
  }
  
  static async getAssistants(): Promise<any[]> {
    return this.getData('assistants')
  }
  
  static async saveAssistants(assistants: any[]): Promise<void> {
    await this.setData('assistants', assistants)
  }
  
  static async getMcpServices(): Promise<any[]> {
    return this.getData('mcpServices')
  }
  
  static async saveMcpServices(services: any[]): Promise<void> {
    await this.setData('mcpServices', services)
  }
  
  static async getSettings(): Promise<any[]> {
    return this.getData('settings')
  }
  
  static async saveSettings(settings: any[]): Promise<void> {
    await this.setData('settings', settings)
  }
}

// HTTP请求管理
class HttpManager {
  static async request(options: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    headers?: Record<string, string>
    data?: any
  }): Promise<any> {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url: options.url,
        method: options.method,
        headers: options.headers || {},
        data: options.data
      })
      return response.data
    } else {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.data ? JSON.stringify(options.data) : undefined
      })
      return response.json()
    }
  }
}

// 创建Capacitor API实现
export const createCapacitorAPI = (): CapacitorAPI => {
  return {
    conversations: {
      async getAll() {
        return DataManager.getConversations()
      },
      async get(id: number) {
        const conversations = await DataManager.getConversations()
        return conversations.find(c => c.id === id)
      },
      async create(title: string, assistantId: string, temperature?: number, maxTokens?: number) {
        const conversations = await DataManager.getConversations()
        const id = Date.now()
        const newConversation = {
          id,
          title,
          assistant_id: assistantId,
          temperature,
          max_tokens: maxTokens,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        conversations.push(newConversation)
        await DataManager.saveConversations(conversations)
        return id
      },
      async update(id: number, data: any) {
        const conversations = await DataManager.getConversations()
        const index = conversations.findIndex(c => c.id === id)
        if (index !== -1) {
          conversations[index] = { ...conversations[index], ...data, updated_at: new Date().toISOString() }
          await DataManager.saveConversations(conversations)
        }
      },
      async delete(id: number) {
        const conversations = await DataManager.getConversations()
        const filtered = conversations.filter(c => c.id !== id)
        await DataManager.saveConversations(filtered)
      }
    },
    
    messages: {
      async getByConversation(conversationId: number) {
        const messages = await DataManager.getMessages()
        return messages.filter(m => m.conversation_id === conversationId)
      },
      async add(conversationId: number, role: string, content: string, toolCalls?: any[], toolCallId?: string) {
        const messages = await DataManager.getMessages()
        const id = Date.now()
        const newMessage = {
          id,
          conversation_id: conversationId,
          role,
          content,
          tool_calls: toolCalls,
          tool_call_id: toolCallId,
          created_at: new Date().toISOString()
        }
        messages.push(newMessage)
        await DataManager.saveMessages(messages)
        return id
      },
      async deleteAll(conversationId: number) {
        const messages = await DataManager.getMessages()
        const filtered = messages.filter(m => m.conversation_id !== conversationId)
        await DataManager.saveMessages(filtered)
      },
      async delete(messageId: number) {
        const messages = await DataManager.getMessages()
        const filtered = messages.filter(m => m.id !== messageId)
        await DataManager.saveMessages(filtered)
      }
    },
    
    models: {
      async getAll() {
        return DataManager.getModels()
      },
      async get(id: string) {
        const models = await DataManager.getModels()
        return models.find(m => m.id === id)
      },
      async create(model: any) {
        const models = await DataManager.getModels()
        const id = Date.now().toString()
        const newModel = { ...model, id, created_at: new Date().toISOString() }
        models.push(newModel)
        await DataManager.saveModels(models)
        return id
      },
      async update(id: string, model: any) {
        const models = await DataManager.getModels()
        const index = models.findIndex(m => m.id === id)
        if (index !== -1) {
          models[index] = { ...models[index], ...model, updated_at: new Date().toISOString() }
          await DataManager.saveModels(models)
        }
      },
      async delete(id: string) {
        const models = await DataManager.getModels()
        const filtered = models.filter(m => m.id !== id)
        await DataManager.saveModels(filtered)
      }
    },
    
    assistants: {
      async getAll() {
        return DataManager.getAssistants()
      },
      async get(id: string) {
        const assistants = await DataManager.getAssistants()
        return assistants.find(a => a.id === id)
      },
      async create(assistant: any) {
        const assistants = await DataManager.getAssistants()
        const id = Date.now().toString()
        const newAssistant = { ...assistant, id, created_at: new Date().toISOString() }
        assistants.push(newAssistant)
        await DataManager.saveAssistants(assistants)
        return id
      },
      async update(id: string, assistant: any) {
        const assistants = await DataManager.getAssistants()
        const index = assistants.findIndex(a => a.id === id)
        if (index !== -1) {
          assistants[index] = { ...assistants[index], ...assistant, updated_at: new Date().toISOString() }
          await DataManager.saveAssistants(assistants)
        }
      },
      async delete(id: string) {
        const assistants = await DataManager.getAssistants()
        const filtered = assistants.filter(a => a.id !== id)
        await DataManager.saveAssistants(filtered)
      }
    },
    
    mcp: {
      async getAll() {
        return DataManager.getMcpServices()
      },
      async get(id: string) {
        const services = await DataManager.getMcpServices()
        return services.find(s => s.id === id)
      },
      async create(service: any) {
        const services = await DataManager.getMcpServices()
        const id = Date.now().toString()
        const newService = { ...service, id, created_at: new Date().toISOString() }
        services.push(newService)
        await DataManager.saveMcpServices(services)
        return id
      },
      async update(id: string, service: any) {
        const services = await DataManager.getMcpServices()
        const index = services.findIndex(s => s.id === id)
        if (index !== -1) {
          services[index] = { ...services[index], ...service, updated_at: new Date().toISOString() }
          await DataManager.saveMcpServices(services)
        }
      },
      async delete(id: string) {
        const services = await DataManager.getMcpServices()
        const filtered = services.filter(s => s.id !== id)
        await DataManager.saveMcpServices(filtered)
      },
      async import(jsonConfig: string) {
        // 简化的导入实现
        const config = JSON.parse(jsonConfig)
        return this.create(config)
      },
      async call(serviceId: string, method: string, params?: any) {
        // MCP服务调用的简化实现
        // 在实际应用中，这里需要实现真正的MCP协议调用
        console.log('MCP call:', serviceId, method, params)
        return { result: 'success' }
      },
      onCallProgress(callback: (data: any) => void) {
        eventManager.on('mcp-call-progress', callback)
        return () => eventManager.off('mcp-call-progress', callback)
      },
      onCallDone(callback: (result: any) => void) {
        eventManager.on('mcp-call-done', callback)
        return () => eventManager.off('mcp-call-done', callback)
      },
      onCallError(callback: (error: any) => void) {
        eventManager.on('mcp-call-error', callback)
        return () => eventManager.off('mcp-call-error', callback)
      }
    },
    
    settings: {
      async getAll() {
        return DataManager.getSettings()
      },
      async get(key: string) {
        const settings = await DataManager.getSettings()
        const setting = settings.find(s => s.key === key)
        return setting ? setting.value : null
      },
      async update(key: string, value: string) {
        const settings = await DataManager.getSettings()
        const index = settings.findIndex(s => s.key === key)
        if (index !== -1) {
          settings[index].value = value
        } else {
          settings.push({ key, value })
        }
        await DataManager.saveSettings(settings)
      }
    },
    
    ai: {
      async callApi(assistantId: string, messages: any[], conversationId?: number, temperature?: number, maxTokens?: number, mcpServices?: any[]) {
        console.log('AI API call:', assistantId, messages, conversationId, temperature, maxTokens, mcpServices)
        
        try {
          // 获取助手信息
          const assistants = await DataManager.getAssistants()
          const assistant = assistants.find(a => a.id === assistantId)
          
          if (!assistant) {
            throw new Error(`未找到ID为 ${assistantId} 的助手`)
          }
          
          // 获取对话设置
          let conversationSettings: { temperature?: number; max_tokens?: number } = {}
          if (conversationId) {
            const conversations = await DataManager.getConversations()
            const conversation = conversations.find(c => c.id === conversationId)
            if (conversation) {
              conversationSettings = {
                temperature: conversation.temperature,
                max_tokens: conversation.max_tokens
              }
            }
          }
          
          // 配置参数
          const apiConfig = {
            ...assistant,
            temperature: temperature !== undefined ? temperature : 
                        conversationSettings.temperature !== undefined ? conversationSettings.temperature : 
                        assistant.default_temperature || assistant.temperature || 0.7,
            max_tokens: maxTokens !== undefined ? maxTokens : 
                       conversationSettings.max_tokens !== undefined ? conversationSettings.max_tokens : 
                       assistant.default_max_tokens || assistant.max_tokens || 2048
          }
          
          // 调用AI API
          const response = await this.callAIService(apiConfig, messages, conversationId)
          
          // 存储消息到本地
          if (conversationId && response) {
            const messages = await DataManager.getMessages()
            const messageId = Date.now()
            const newMessage = {
              id: messageId,
              conversation_id: conversationId,
              role: 'assistant',
              content: response,
              created_at: new Date().toISOString()
            }
            messages.push(newMessage)
            await DataManager.saveMessages(messages)
          }
          
          return response
        } catch (error) {
          console.error('AI API调用失败:', error)
          eventManager.emit('api-stream-error', { error: error.message, conversationId })
          throw error
        }
      },
      
      async callAIService(config: any, messages: any[], conversationId?: number): Promise<string> {
        const { model_type, api_url, api_key, model_name, temperature, max_tokens } = config
        
        // 根据模型类型调用不同的API
        switch (model_type) {
          case 'openai':
            return this.callOpenAI(api_url || 'https://api.openai.com/v1', api_key, model_name, messages, temperature, max_tokens, conversationId)
          case 'anthropic':
            return this.callAnthropic(api_key, model_name, messages, temperature, max_tokens, conversationId)
          case 'google':
            return this.callGoogle(api_key, model_name, messages, temperature, max_tokens, conversationId)
          case 'ollama':
            return this.callOllama(api_url || 'http://localhost:11434', model_name, messages, temperature, max_tokens, conversationId)
          default:
            throw new Error(`不支持的模型类型: ${model_type}`)
        }
      },
      
      async callOpenAI(apiUrl: string, apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number, conversationId?: number): Promise<string> {
        const response = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true
          })
        })
        
        if (!response.ok) {
          throw new Error(`OpenAI API错误: ${response.status} ${response.statusText}`)
        }
        
        return this.handleStreamResponse(response, conversationId)
      },
      
      async callAnthropic(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number, conversationId?: number): Promise<string> {
        // 转换消息格式
        const systemMessage = messages.find(m => m.role === 'system')
        const userMessages = messages.filter(m => m.role !== 'system')
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            messages: userMessages,
            system: systemMessage?.content,
            temperature,
            max_tokens: maxTokens,
            stream: true
          })
        })
        
        if (!response.ok) {
          throw new Error(`Anthropic API错误: ${response.status} ${response.statusText}`)
        }
        
        return this.handleStreamResponse(response, conversationId)
      },
      
      async callGoogle(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number, conversationId?: number): Promise<string> {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: messages.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens
            }
          })
        })
        
        if (!response.ok) {
          throw new Error(`Google API错误: ${response.status} ${response.statusText}`)
        }
        
        return this.handleStreamResponse(response, conversationId)
      },
      
      async callOllama(apiUrl: string, model: string, messages: any[], temperature: number, maxTokens: number, conversationId?: number): Promise<string> {
        const response = await fetch(`${apiUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages,
            options: {
              temperature,
              num_predict: maxTokens
            },
            stream: true
          })
        })
        
        if (!response.ok) {
          throw new Error(`Ollama API错误: ${response.status} ${response.statusText}`)
        }
        
        return this.handleStreamResponse(response, conversationId)
      },
      
      async handleStreamResponse(response: Response, conversationId?: number): Promise<string> {
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('无法读取响应流')
        }
        
        let fullResponse = ''
        const decoder = new TextDecoder()
        
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') continue
                
                try {
                  const parsed = JSON.parse(data)
                  let content = ''
                  
                  // 处理不同API的响应格式
                  if (parsed.choices?.[0]?.delta?.content) {
                    // OpenAI格式
                    content = parsed.choices[0].delta.content
                  } else if (parsed.delta?.text) {
                    // Anthropic格式
                    content = parsed.delta.text
                  } else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                    // Google格式
                    content = parsed.candidates[0].content.parts[0].text
                  } else if (parsed.message?.content) {
                    // Ollama格式
                    content = parsed.message.content
                  }
                  
                  if (content) {
                    fullResponse += content
                    eventManager.emit('api-stream-response', { text: content, conversationId })
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
        
        eventManager.emit('api-stream-done', { conversationId })
        return fullResponse
      },
      async stopGeneration(conversationId: number) {
        console.log('Stop generation:', conversationId)
        eventManager.emit('api-stream-cancelled', { conversationId })
      },
      onStreamResponse(callback: (data: any) => void) {
        eventManager.on('api-stream-response', callback)
        return () => eventManager.off('api-stream-response', callback)
      },
      onStreamDone(callback: (data: any) => void) {
        eventManager.on('api-stream-done', callback)
        return () => eventManager.off('api-stream-done', callback)
      },
      onStreamCancelled(callback: (data: any) => void) {
        eventManager.on('api-stream-cancelled', callback)
        return () => eventManager.off('api-stream-cancelled', callback)
      }
    },
    
    window: {
      minimize() {
        // 移动端不支持窗口操作
        if (!Capacitor.isNativePlatform()) {
          console.log('Window minimize')
        }
      },
      maximize() {
        if (!Capacitor.isNativePlatform()) {
          console.log('Window maximize')
        }
      },
      close() {
        if (Capacitor.isNativePlatform()) {
          // 移动端退出应用
          import('@capacitor/app').then(({ App }) => {
            App.exitApp()
          })
        } else {
          console.log('Window close')
        }
      },
      unmaximize() {
        if (!Capacitor.isNativePlatform()) {
          console.log('Window unmaximize')
        }
      },
      async isMaximized() {
        return false // 移动端总是返回false
      }
    },
    
    navigation: {
      onNavigateTo(callback: (route: string) => void) {
        eventManager.on('navigate-to', callback)
        return () => eventManager.off('navigate-to', callback)
      }
    },
    
    openCodeRunner(data: { code: string, title: string, language: string }) {
      console.log('Open code runner:', data)
      // 移动端可能需要不同的实现
    },
    
    closeCodeRunner() {
      console.log('Close code runner')
    },
    
    codeRunnerReady() {
      console.log('Code runner ready')
    },
    
    async invoke(channel: string, ...args: any[]) {
      console.log('Invoke:', channel, args)
      return null
    }
  }
}