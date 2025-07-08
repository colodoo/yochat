<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingStore } from '../../stores/setting'

const settingStore = useSettingStore()
const loading = ref(false)
const themeMode = ref('')
const fontSize = ref('')
const autoStart = ref(false)
const autoUpdate = ref(true)

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
</script>

<template>
  <v-list>
    <!-- 主题设置 -->
    <v-list-item>
      <template v-slot:prepend>
        <v-icon>mdi-theme-light-dark</v-icon>
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
        <v-icon>mdi-format-size</v-icon>
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
        <v-icon>mdi-power</v-icon>
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
        <v-icon>mdi-update</v-icon>
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
  </v-list>
</template>

<style scoped>
.font-size-select {
  max-width: 200px;
}
</style>