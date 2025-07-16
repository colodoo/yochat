import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'

// Capacitor imports
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Keyboard } from '@capacitor/keyboard'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'

// Markdown渲染
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

// 创建Vuetify实例
const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi
    }
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1976D2',
          secondary: '#424242',
          accent: '#82B1FF',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FFC107'
        }
      }
    }
  }
})

// 配置Markdown
// @ts-ignore - MarkedOptions类型定义可能不完整
marked.setOptions({
  // @ts-ignore - langPrefix属性在某些版本中可能不存在
  langPrefix: 'hljs language-',
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  }
});

// 创建Pinia实例
const pinia = createPinia()

// 创建应用实例
const app = createApp(App)

// 使用插件
app.use(vuetify)
app.use(router)
app.use(pinia)

// 全局属性
app.config.globalProperties.$marked = marked

// Capacitor平台初始化
const initializeCapacitor = async () => {
  if (Capacitor.isNativePlatform()) {
    // 移动端初始化
    console.log('Running on native platform:', Capacitor.getPlatform())
    
    // 设置状态栏样式
    if (Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android') {
      await StatusBar.setStyle({ style: Style.Default })
      await StatusBar.setBackgroundColor({ color: '#1976D2' })
    }
    
    // 隐藏启动屏幕
    await SplashScreen.hide()
    
    // 监听应用状态变化
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      console.log('App state changed. Is active?', isActive)
    })
    
    // 监听返回按钮（Android）
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        CapacitorApp.exitApp()
      } else {
        window.history.back()
      }
    })
    
    // 键盘事件监听
    Keyboard.addListener('keyboardWillShow', info => {
      console.log('keyboard will show with height:', info.keyboardHeight)
    })
    
    Keyboard.addListener('keyboardDidShow', info => {
      console.log('keyboard did show with height:', info.keyboardHeight)
    })
    
    Keyboard.addListener('keyboardWillHide', () => {
      console.log('keyboard will hide')
    })
    
    Keyboard.addListener('keyboardDidHide', () => {
      console.log('keyboard did hide')
    })
  } else {
    // Web端或Electron端
    console.log('Running on web platform')
  }
}

// 初始化并挂载应用
initializeCapacitor().then(() => {
  app.mount('#app')
}).catch(error => {
  console.error('Failed to initialize Capacitor:', error)
  // 即使初始化失败也要挂载应用
  app.mount('#app')
})