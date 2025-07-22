import { ElectronAPI as BaseElectronAPI } from '@electron-toolkit/preload'

// 扩展ElectronAPI接口
interface ElectronAPI extends BaseElectronAPI {
  process: {
    versions: Record<string, string>
  }
}

// 定义API接口
interface API {
  conversations: {
    getAll: () => Promise<any[]>
    get: (id: number) => Promise<any>
    create: (title: string, assistantId: string) => Promise<number>
    update: (id: number, data: string | { title?: string, temperature?: number, maxTokens?: number }) => Promise<any>
    delete: (id: number) => Promise<any>
  }
  messages: {
    getByConversation: (conversationId: number) => Promise<any[]>
    add: (conversationId: number, role: string, content: string) => Promise<number>
    deleteAll: (conversationId: number) => Promise<any>
    delete: (messageId: number) => Promise<any>
  }
  assistants: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (assistant: any) => Promise<string>
    update: (id: string, assistant: any) => Promise<any>
    delete: (id: string) => Promise<any>
  }
  models: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (model: any) => Promise<string>
    update: (id: string, model: any) => Promise<any>
    delete: (id: string) => Promise<any>
  }
  settings: {
    getAll: () => Promise<Record<string, string>>
    get: (key: string) => Promise<string | null>
    update: (key: string, value: string) => Promise<any>
  }
  ai: {
    callApi: (assistantId: string, messages: any[], conversationId?: number, temperature?: number, maxTokens?: number, mcpServices?: any[]) => Promise<string>
    stopGeneration: (conversationId: number) => Promise<void>
    onStreamResponse: (callback: (text: string) => void) => () => void
    onStreamDone: (callback: () => void) => () => void
    onStreamCancelled: (callback: (data: any) => void) => () => void
  }
  navigation: {
    onNavigateTo: (callback: (route: string) => void) => () => void
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    unmaximize: () => void
    isMaximized: () => Promise<boolean>
  }
  mcp: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (serviceData: any) => Promise<string>
    update: (id: string, serviceData: any) => Promise<any>
    delete: (id: string) => Promise<any>
    import: (jsonConfig: string) => Promise<string>
    validate: (serviceData: any) => Promise<any>
    call: (serviceId: string, method: string, params?: any) => Promise<any>
    onCallProgress: (callback: (progress: any) => void) => () => void
    onCallDone: (callback: (result: any) => void) => () => void
    onCallError: (callback: (error: any) => void) => () => void
  }
  notes: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (title: string, content: string) => Promise<string>
    update: (id: string, title: string, content: string) => Promise<any>
    delete: (id: string) => Promise<any>
    appendTo: (id: string, content: string) => Promise<any>
    search: (query: string) => Promise<any[]>
  }
  openCodeRunner: (data: { code: string, title: string, language: string }) => void
  closeCodeRunner: () => void
  codeRunnerReady: () => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
