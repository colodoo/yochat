import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'

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

// 挂载应用
app.mount('#app')
