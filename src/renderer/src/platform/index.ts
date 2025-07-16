import { Capacitor } from '@capacitor/core'
import { createCapacitorAPI, type CapacitorAPI } from './capacitor-api'

// 平台类型
export type Platform = 'electron' | 'web' | 'ios' | 'android'

// 获取当前平台
export function getCurrentPlatform(): Platform {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    if (platform === 'ios' || platform === 'android') {
      return platform as Platform
    }
  }
  
  // 检查是否在Electron环境中
  if (typeof window !== 'undefined' && window.api) {
    return 'electron'
  }
  
  return 'web'
}

// 平台特性检测
export const platformFeatures = {
  get isElectron() {
    return getCurrentPlatform() === 'electron'
  },
  
  get isMobile() {
    const platform = getCurrentPlatform()
    return platform === 'ios' || platform === 'android'
  },
  
  get isWeb() {
    return getCurrentPlatform() === 'web'
  },
  
  get supportsWindowControls() {
    return this.isElectron
  },
  
  get supportsFileSystem() {
    return this.isElectron || Capacitor.isNativePlatform()
  },
  
  get supportsNotifications() {
    return true // 所有平台都支持某种形式的通知
  },
  
  get supportsBackButton() {
    return getCurrentPlatform() === 'android'
  },
  
  get supportsStatusBar() {
    return this.isMobile
  },
  
  get supportsKeyboard() {
    return this.isMobile
  },
  
  get supportsHaptics() {
    return this.isMobile
  }
}

// API适配器
class APIAdapter {
  private api: any
  
  constructor() {
    this.initializeAPI()
  }
  
  private initializeAPI() {
    const platform = getCurrentPlatform()
    
    if (platform === 'electron' && typeof window !== 'undefined' && window.api) {
      // 使用Electron API
      this.api = window.api
    } else {
      // 使用Capacitor API适配器
      this.api = createCapacitorAPI()
    }
  }
  
  // 获取API实例
  getAPI(): CapacitorAPI {
    return this.api
  }
  
  // 平台特定的初始化
  async initialize() {
    const platform = getCurrentPlatform()
    
    switch (platform) {
      case 'electron':
        await this.initializeElectron()
        break
      case 'ios':
      case 'android':
        await this.initializeMobile()
        break
      case 'web':
        await this.initializeWeb()
        break
    }
  }
  
  private async initializeElectron() {
    console.log('Initializing Electron platform')
    // Electron特定的初始化逻辑
  }
  
  private async initializeMobile() {
    console.log('Initializing mobile platform')
    
    try {
      // 导入移动端特定的插件
      const [statusBarModule, splashScreenModule, appModule, keyboardModule] = await Promise.all([
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
        import('@capacitor/app'),
        import('@capacitor/keyboard')
      ])
      
      const { StatusBar, Style } = statusBarModule
      const { SplashScreen } = splashScreenModule
      const { App } = appModule
      const { Keyboard } = keyboardModule
      
      // 设置状态栏
      if (platformFeatures.supportsStatusBar) {
        await StatusBar.setStyle({ style: Style.Default })
        await StatusBar.setBackgroundColor({ color: '#1976D2' })
      }
      
      // 隐藏启动屏幕
      await SplashScreen.hide()
      
      // 监听应用状态变化
      App.addListener('appStateChange', ({ isActive }) => {
        console.log('App state changed. Is active?', isActive)
      })
      
      // 监听返回按钮（Android）
      if (platformFeatures.supportsBackButton) {
        App.addListener('backButton', ({ canGoBack }) => {
          if (!canGoBack) {
            App.exitApp()
          } else {
            window.history.back()
          }
        })
      }
      
      // 键盘事件监听
      if (platformFeatures.supportsKeyboard) {
        Keyboard.addListener('keyboardWillShow', info => {
          console.log('keyboard will show with height:', info.keyboardHeight)
          // 可以在这里调整UI布局
          document.body.style.paddingBottom = `${info.keyboardHeight}px`
        })
        
        Keyboard.addListener('keyboardDidHide', () => {
          console.log('keyboard did hide')
          // 恢复UI布局
          document.body.style.paddingBottom = '0px'
        })
      }
    } catch (error) {
      console.warn('Failed to initialize some mobile features:', error)
    }
  }
  
  private async initializeWeb() {
    console.log('Initializing web platform')
    // Web特定的初始化逻辑
  }
  
  // 平台特定的功能
  async showToast(message: string, duration: number = 3000) {
    if (platformFeatures.isMobile) {
      try {
        const { Toast } = await import('@capacitor/toast')
        await Toast.show({
          text: message,
          duration: duration === 3000 ? 'short' : 'long'
        })
      } catch (error) {
        console.log('Toast fallback:', message)
      }
    } else {
      // Web端使用浏览器通知或自定义toast
      console.log('Toast:', message)
    }
  }
  
  async vibrate(duration: number = 100) {
    if (platformFeatures.supportsHaptics) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
        await Haptics.impact({ style: ImpactStyle.Light })
      } catch (error) {
        console.log('Haptics not available')
      }
    }
  }
  
  async shareContent(content: { title?: string, text?: string, url?: string }) {
    if (platformFeatures.isMobile) {
      try {
        const { Share } = await import('@capacitor/share')
        await Share.share(content)
      } catch (error) {
        // 降级到Web API
        if (navigator.share) {
          await navigator.share(content)
        } else {
          const text = `${content.title || ''}\n${content.text || ''}\n${content.url || ''}`
          await navigator.clipboard.writeText(text)
        }
      }
    } else {
      // Web端使用Web Share API或复制到剪贴板
      if (navigator.share) {
        await navigator.share(content)
      } else {
        // 复制到剪贴板作为备选方案
        const text = `${content.title || ''}\n${content.text || ''}\n${content.url || ''}`
        await navigator.clipboard.writeText(text)
      }
    }
  }
  
  async openUrl(url: string) {
    if (platformFeatures.isMobile) {
      try {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url })
      } catch (error) {
        window.open(url, '_blank')
      }
    } else {
      window.open(url, '_blank')
    }
  }
}

// 创建全局API适配器实例
export const apiAdapter = new APIAdapter()

// 导出API实例
export const api = apiAdapter.getAPI()

// 平台初始化函数
export async function initializePlatform() {
  await apiAdapter.initialize()
}

// 类型声明扩展
declare global {
  interface Window {
    api?: any
    electron?: any
  }
}