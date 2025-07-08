import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 自定义API，用于渲染进程
const api = {
  // 对话相关
  conversations: {
    getAll: () => ipcRenderer.invoke('get-all-conversations'),
    get: (id: number) => ipcRenderer.invoke('get-conversation', id),
    create: (title: string, assistantId: string, temperature?: number, maxTokens?: number) => 
      ipcRenderer.invoke('create-conversation', title, assistantId, temperature, maxTokens),
    update: (id: number, data: { title?: string, temperature?: number, maxTokens?: number, mcpServices?: string[] }) => 
      ipcRenderer.invoke('update-conversation', id, data),
    delete: (id: number) => ipcRenderer.invoke('delete-conversation', id)
  },
  
  // 消息相关
  messages: {
    getByConversation: (conversationId: number) => ipcRenderer.invoke('get-messages-by-conversation', conversationId),
    add: (conversationId: number, role: string, content: string, toolCalls?: any[], toolCallId?: string) => ipcRenderer.invoke('add-message', conversationId, role, content, toolCalls, toolCallId),
    deleteAll: (conversationId: number) => ipcRenderer.invoke('delete-all-messages', conversationId),
    delete: (messageId: number) => ipcRenderer.invoke('delete-message', messageId)
  },
  
  // 模型相关
  models: {
    getAll: () => ipcRenderer.invoke('get-all-models'),
    get: (id: string) => ipcRenderer.invoke('get-model', id),
    create: (model: any) => ipcRenderer.invoke('create-model', model),
    update: (id: string, model: any) => ipcRenderer.invoke('update-model', id, model),
    delete: (id: string) => ipcRenderer.invoke('delete-model', id)
  },
  
  // 助手相关
  assistants: {
    getAll: () => ipcRenderer.invoke('get-all-assistants'),
    get: (id: string) => ipcRenderer.invoke('get-assistant', id),
    create: (assistant: any) => ipcRenderer.invoke('create-assistant', assistant),
    update: (id: string, assistant: any) => ipcRenderer.invoke('update-assistant', id, assistant),
    delete: (id: string) => ipcRenderer.invoke('delete-assistant', id)
  },
  
  // MCP服务相关
  mcp: {
    getAll: () => ipcRenderer.invoke('get-all-mcp-services'),
    get: (id: string) => ipcRenderer.invoke('get-mcp-service', id),
    create: (service: any) => ipcRenderer.invoke('create-mcp-service', service),
    update: (id: string, service: any) => ipcRenderer.invoke('update-mcp-service', id, service),
    delete: (id: string) => ipcRenderer.invoke('delete-mcp-service', id),
    import: (jsonConfig: string) => ipcRenderer.invoke('import-mcp-service', jsonConfig),
    call: (serviceId: string, method: string, params?: any) => ipcRenderer.invoke('call-mcp-service', serviceId, method, params),
    onCallProgress: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('mcp-call-progress', listener);
      return () => ipcRenderer.removeListener('mcp-call-progress', listener);
    },
    onCallDone: (callback: (result: any) => void) => {
      const listener = (_: any, result: any) => callback(result);
      ipcRenderer.on('mcp-call-done', listener);
      return () => ipcRenderer.removeListener('mcp-call-done', listener);
    },
    onCallError: (callback: (error: any) => void) => {
      const listener = (_: any, error: any) => callback(error);
      ipcRenderer.on('mcp-call-error', listener);
      return () => ipcRenderer.removeListener('mcp-call-error', listener);
    }
  },
  
  // 设置相关
  settings: {
    getAll: () => ipcRenderer.invoke('get-all-settings'),
    get: (key: string) => ipcRenderer.invoke('get-setting', key),
    update: (key: string, value: string) => ipcRenderer.invoke('update-setting', key, value)
  },
  
  // API请求相关
  ai: {
    callApi: (assistantId: string, messages: any[], conversationId?: number, temperature?: number, maxTokens?: number, mcpServices?: any[]) => 
      ipcRenderer.invoke('call-api', assistantId, messages, conversationId, temperature, maxTokens, mcpServices),
    stopGeneration: (conversationId: number) => 
      ipcRenderer.invoke('stop-generation', conversationId),
    onStreamResponse: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('api-stream-response', listener);
      return () => ipcRenderer.removeListener('api-stream-response', listener);
    },
    onStreamDone: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('api-stream-done', listener);
      return () => ipcRenderer.removeListener('api-stream-done', listener);
    },
    onStreamCancelled: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('api-stream-cancelled', listener);
      return () => ipcRenderer.removeListener('api-stream-cancelled', listener);
    }
  },
  
  // 窗口控制相关
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    unmaximize: () => ipcRenderer.send('window-unmaximize'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized')
  },
  
  // 导航
  navigation: {
    onNavigateTo: (callback: (route: string) => void) => {
      const channel = 'navigate-to';
      const listener = (_event: any, route: string) => callback(route);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  },
  
  // 通用IPC调用
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
