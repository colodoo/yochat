<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingStore } from '../../stores/setting'
import { Palette, Type, Power, RefreshCw, Globe } from 'lucide-vue-next'

const settingStore = useSettingStore()
const loading = ref(false)
const themeMode = ref('')
const fontSize = ref('')
const autoStart = ref(false)
const autoUpdate = ref(true)
const proxyEnabled = ref(false)
const proxyAddress = ref('127.0.0.1:7890')

// 定义事件
const emit = defineEmits<{
  showSnackbar: [text: string]
}>()

// 初始化数据
onMounted(async () => {
  await loadSettings()
})

// 加载设置
async function loadSettings() {
  loading.value = true
  try {
    await settingStore.loadSettings()
    themeMode.value = settingStore.getSetting('theme') || 'light'
    fontSize.value = settingStore.getSetting('font_size') || 'medium'
    autoStart.value = settingStore.getSetting('auto_start') === 'true'
    autoUpdate.value = settingStore.getSetting('auto_update') !== 'false'
    proxyEnabled.value = settingStore.getSetting('proxy_enabled') === 'true'
    proxyAddress.value = settingStore.getSetting('proxy_address') || '127.0.0.1:7890'
  } catch (error) {
    console.error('加载设置失败:', error)
    emit('showSnackbar', '加载设置失败，请重试')
  } finally {
    loading.value = false
  }
}

// 切换主题
async function updateTheme() {
  loading.value = true
  try {
    await settingStore.toggleTheme(themeMode.value)
    emit('showSnackbar', `已切换到${themeMode.value === 'light' ? '浅色' : '深色'}主题`)
  } catch (error) {
    console.error('切换主题失败:', error)
    emit('showSnackbar', '切换主题失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新字体大小
async function updateFontSize() {
  loading.value = true
  try {
    await settingStore.updateSetting('font_size', fontSize.value)
    document.documentElement.setAttribute('data-font-size', fontSize.value)
    emit('showSnackbar', '字体大小设置已更新')
  } catch (error) {
    console.error('更新字体大小失败:', error)
    emit('showSnackbar', '更新字体大小失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新自动启动设置
async function updateAutoStart() {
  loading.value = true
  try {
    await settingStore.updateSetting('auto_start', autoStart.value.toString())
    emit('showSnackbar', `已${autoStart.value ? '开启' : '关闭'}开机自启动`)
  } catch (error) {
    console.error('更新自动启动设置失败:', error)
    emit('showSnackbar', '更新自动启动设置失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新自动更新设置
async function updateAutoUpdate() {
  loading.value = true
  try {
    await settingStore.updateSetting('auto_update', autoUpdate.value.toString())
    emit('showSnackbar', `已${autoUpdate.value ? '开启' : '关闭'}自动更新`)
  } catch (error) {
    console.error('更新自动更新设置失败:', error)
    emit('showSnackbar', '更新自动更新设置失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新代理启用设置
async function updateProxyEnabled() {
  loading.value = true
  try {
    await settingStore.updateSetting('proxy_enabled', proxyEnabled.value.toString())
    emit('showSnackbar', `已${proxyEnabled.value ? '开启' : '关闭'}网络代理`)
  } catch (error) {
    console.error('更新代理设置失败:', error)
    emit('showSnackbar', '更新代理设置失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新代理地址设置
async function updateProxyAddress() {
  loading.value = true
  try {
    await settingStore.updateSetting('proxy_address', proxyAddress.value)
    emit('showSnackbar', '代理地址已更新')
  } catch (error) {
    console.error('更新代理地址失败:', error)
    emit('showSnackbar', '更新代理地址失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-list>
    <!-- 主题设置 -->
    <v-list-item>
      <template v-slot:prepend>
        <Palette :size="20" />
      </template>
      <v-list-item-title class="text-body-2">主题模式</v-list-item-title>
      <template v-slot:append>
        <v-switch
          v-model="themeMode"
          :label="themeMode === 'dark' ? '深色' : '浅色'"
          true-value="dark"
          false-value="light"
          hide-details
          density="compact"
          @update:model-value="updateTheme"
          :loading="loading"
        ></v-switch>
      </template>
    </v-list-item>
    
    <!-- 字体大小设置 -->
    <v-list-item>
      <template v-slot:prepend>
        <Type :size="20" />
      </template>
      <v-list-item-title class="text-body-2">字体大小</v-list-item-title>
      <template v-slot:append>
        <v-select
          v-model="fontSize"
          :items="[{title: '小', value: 'small'}, {title: '中', value: 'medium'}, {title: '大', value: 'large'}, {title: '特大', value: 'x-large'}]"
          item-title="title"
          item-value="value"
          variant="outlined"
          density="compact"
          hide-details
          class="font-size-select"
          @update:model-value="updateFontSize"
          :loading="loading"
        ></v-select>
      </template>
    </v-list-item>
    
    <!-- 自动启动设置 -->
    <v-list-item>
      <template v-slot:prepend>
        <Power :size="20" />
      </template>
      <v-list-item-title class="text-body-2">开机自启动</v-list-item-title>
      <template v-slot:append>
        <v-switch
          v-model="autoStart"
          hide-details
          density="compact"
          @update:model-value="updateAutoStart"
          :loading="loading"
        ></v-switch>
      </template>
    </v-list-item>
    
    <!-- 自动更新设置 -->
    <v-list-item>
      <template v-slot:prepend>
        <RefreshCw :size="20" />
      </template>
      <v-list-item-title class="text-body-2">自动更新</v-list-item-title>
      <template v-slot:append>
        <v-switch
          v-model="autoUpdate"
          hide-details
          density="compact"
          @update:model-value="updateAutoUpdate"
          :loading="loading"
        ></v-switch>
      </template>
    </v-list-item>
    
    <!-- 网络代理设置 -->
    <v-list-item>
      <template v-slot:prepend>
        <Globe :size="20" />
      </template>
      <v-list-item-title class="text-body-2">网络代理</v-list-item-title>
      <v-list-item-subtitle class="text-caption">用于解决国内网络访问问题</v-list-item-subtitle>
      <template v-slot:append>
        <v-switch
          v-model="proxyEnabled"
          hide-details
          density="compact"
          @update:model-value="updateProxyEnabled"
          :loading="loading"
        ></v-switch>
      </template>
    </v-list-item>
    
    <!-- 代理地址设置 -->
    <v-list-item v-if="proxyEnabled">
      <template v-slot:prepend>
        <div style="width: 20px;"></div>
      </template>
      <v-list-item-title class="text-body-2">代理地址</v-list-item-title>
      <template v-slot:append>
        <v-text-field
          v-model="proxyAddress"
          variant="outlined"
          density="compact"
          hide-details
          placeholder="127.0.0.1:7890"
          class="proxy-address-input"
          @blur="updateProxyAddress"
          :loading="loading"
        ></v-text-field>
      </template>
    </v-list-item>
  </v-list>
</template>

<style scoped>
.font-size-select {
  max-width: 200px;
}

.proxy-address-input {
  max-width: 200px;
}
</style>