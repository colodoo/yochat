<template>
  <v-app>
    <!-- 移动端顶部导航栏 -->
    <v-app-bar
      v-if="showTopBar"
      :elevation="2"
      class="mobile-navbar safe-area-top"
      :color="theme === 'dark' ? 'surface' : 'primary'"
      :theme="theme"
    >
      <!-- 返回按钮 -->
      <v-btn
        v-if="showBackButton"
        icon
        @click="handleBack"
        class="mobile-touch"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      
      <!-- 菜单按钮 -->
      <v-btn
        v-else
        icon
        @click="toggleDrawer"
        class="mobile-touch"
      >
        <v-icon>mdi-menu</v-icon>
      </v-btn>
      
      <!-- 标题 -->
      <v-toolbar-title class="text-truncate">
        {{ title }}
      </v-toolbar-title>
      
      <v-spacer />
      
      <!-- 右侧操作按钮 -->
      <slot name="actions" />
      
      <!-- 更多菜单 -->
      <v-menu v-if="showMenu">
        <template v-slot:activator="{ props }">
          <v-btn
            icon
            v-bind="props"
            class="mobile-touch"
          >
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        
        <v-list>
          <slot name="menu-items" />
        </v-list>
      </v-menu>
    </v-app-bar>
    
    <!-- 侧边导航抽屉 -->
    <v-navigation-drawer
      v-model="drawer"
      :temporary="isMobile"
      :permanent="!isMobile"
      class="mobile-scroll"
      :width="280"
    >
      <!-- 抽屉头部 -->
      <div class="pa-4 safe-area-top">
        <div class="d-flex align-center">
          <v-avatar size="40" class="mr-3">
            <v-icon size="24">mdi-robot</v-icon>
          </v-avatar>
          <div>
            <div class="text-h6">YoChat</div>
            <div class="text-caption text-medium-emphasis">AI助手</div>
          </div>
        </div>
      </div>
      
      <v-divider />
      
      <!-- 导航菜单 -->
      <v-list nav class="py-0">
        <v-list-item
          v-for="item in navigationItems"
          :key="item.value"
          :to="item.to"
          :value="item.value"
          class="mobile-list-item mobile-touch"
          @click="handleNavigation(item)"
        >
          <template v-slot:prepend>
            <v-icon>{{ item.icon }}</v-icon>
          </template>
          
          <v-list-item-title>{{ item.title }}</v-list-item-title>
          
          <template v-slot:append v-if="item.badge">
            <v-badge
              :content="item.badge"
              color="error"
              inline
            />
          </template>
        </v-list-item>
      </v-list>
      
      <v-spacer />
      
      <!-- 底部设置 -->
      <div class="pa-4 safe-area-bottom">
        <v-list-item
          to="/settings"
          class="mobile-list-item mobile-touch"
        >
          <template v-slot:prepend>
            <v-icon>mdi-cog</v-icon>
          </template>
          <v-list-item-title>设置</v-list-item-title>
        </v-list-item>
      </div>
    </v-navigation-drawer>
    
    <!-- 主要内容区域 -->
    <v-main class="mobile-content keyboard-adjust">
      <div class="fill-height">
        <slot />
      </div>
    </v-main>
    
    <!-- 移动端底部导航 -->
    <v-bottom-navigation
      v-if="showBottomNav && isMobile"
      v-model="currentTab"
      class="mobile-bottom-nav safe-area-bottom"
      :elevation="8"
      grow
    >
      <v-btn
        v-for="item in bottomNavItems"
        :key="item.value"
        :value="item.value"
        class="mobile-touch"
        @click="handleBottomNavigation(item)"
      >
        <v-icon>{{ item.icon }}</v-icon>
        <span class="text-caption">{{ item.title }}</span>
      </v-btn>
    </v-bottom-navigation>
    
    <!-- 浮动操作按钮 -->
    <v-fab
      v-if="showFab"
      :icon="fabIcon"
      :color="fabColor"
      class="mobile-touch"
      :style="fabStyle"
      @click="handleFabClick"
    />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { platformFeatures, apiAdapter } from '../platform'
import { useSettingStore } from '../stores/setting'

interface NavigationItem {
  title: string
  value: string
  icon: string
  to?: string
  badge?: string | number
  action?: () => void
}

interface Props {
  title?: string
  showTopBar?: boolean
  showBackButton?: boolean
  showMenu?: boolean
  showBottomNav?: boolean
  showFab?: boolean
  fabIcon?: string
  fabColor?: string
  navigationItems?: NavigationItem[]
  bottomNavItems?: NavigationItem[]
}

const props = withDefaults(defineProps<Props>(), {
  title: 'YoChat',
  showTopBar: true,
  showBackButton: false,
  showMenu: true,
  showBottomNav: false,
  showFab: false,
  fabIcon: 'mdi-plus',
  fabColor: 'primary',
  navigationItems: () => [
    { title: '首页', value: 'home', icon: 'mdi-home', to: '/' },
    { title: '对话', value: 'chat', icon: 'mdi-chat', to: '/chat' },
    { title: '助手', value: 'assistants', icon: 'mdi-robot', to: '/assistants' },
    { title: '模型', value: 'models', icon: 'mdi-brain', to: '/models' }
  ],
  bottomNavItems: () => [
    { title: '对话', value: 'chat', icon: 'mdi-chat' },
    { title: '助手', value: 'assistants', icon: 'mdi-robot' },
    { title: '设置', value: 'settings', icon: 'mdi-cog' }
  ]
})

const emit = defineEmits<{
  back: []
  fabClick: []
  menuClick: [item: NavigationItem]
}>()

const router = useRouter()
const route = useRoute()
const { mobile } = useDisplay()
const settingStore = useSettingStore()

// 响应式状态
const drawer = ref(!mobile.value)
const currentTab = ref('chat')
const keyboardHeight = ref(0)

// 计算属性
const isMobile = computed(() => mobile.value || platformFeatures.isMobile)
const theme = computed(() => settingStore.getSetting('theme', 'light'))

const fabStyle = computed(() => ({
  bottom: isMobile.value && props.showBottomNav ? '88px' : '16px',
  right: '16px'
}))

// 方法
function toggleDrawer() {
  drawer.value = !drawer.value
}

function handleBack() {
  if (platformFeatures.isMobile) {
    // 移动端使用原生返回
    window.history.back()
  } else {
    // 桌面端使用路由返回
    router.back()
  }
  emit('back')
}

function handleNavigation(item: NavigationItem) {
  if (item.action) {
    item.action()
  } else if (item.to) {
    router.push(item.to)
  }
  
  // 移动端关闭抽屉
  if (isMobile.value) {
    drawer.value = false
  }
  
  emit('menuClick', item)
}

function handleBottomNavigation(item: NavigationItem) {
  currentTab.value = item.value
  handleNavigation(item)
}

function handleFabClick() {
  emit('fabClick')
}

// 键盘事件处理
function handleKeyboardShow(info: { keyboardHeight: number }) {
  keyboardHeight.value = info.keyboardHeight
  document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`)
  document.body.classList.add('keyboard-open')
}

function handleKeyboardHide() {
  keyboardHeight.value = 0
  document.documentElement.style.setProperty('--keyboard-height', '0px')
  document.body.classList.remove('keyboard-open')
}

// 生命周期
onMounted(async () => {
  // 初始化平台
  await apiAdapter.initialize()
  
  // 移动端键盘事件监听
  if (platformFeatures.supportsKeyboard) {
    const { Keyboard } = await import('@capacitor/keyboard')
    
    Keyboard.addListener('keyboardWillShow', handleKeyboardShow)
    Keyboard.addListener('keyboardDidHide', handleKeyboardHide)
  }
  
  // 设置当前标签页
  const currentRoute = route.path
  const matchedItem = props.bottomNavItems.find(item => 
    item.to && currentRoute.startsWith(item.to)
  )
  if (matchedItem) {
    currentTab.value = matchedItem.value
  }
})

onUnmounted(() => {
  // 清理键盘事件监听器
  if (platformFeatures.supportsKeyboard) {
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.removeAllListeners()
    })
  }
})
</script>

<style scoped>
.mobile-navbar {
  backdrop-filter: blur(10px);
}

.mobile-bottom-nav {
  backdrop-filter: blur(10px);
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keyboard-adjust {
  transition: padding-bottom 0.3s ease;
}

.keyboard-adjust.keyboard-open {
  padding-bottom: var(--keyboard-height, 0px);
}
</style>