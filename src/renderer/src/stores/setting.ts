import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingStore = defineStore('setting', () => {
  // 状态
  const settings = ref<Record<string, string>>({})
  const loading = ref(false)

  // 加载所有设置
  async function loadSettings() {
    try {
      loading.value = true
      const result = await window.api.settings.getAll()
      settings.value = result
    } catch (error) {
      console.error('加载设置失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 获取设置值
  function getSetting(key: string, defaultValue: string = '') {
    return settings.value[key] || defaultValue
  }

  // 更新设置
  async function updateSetting(key: string, value: string) {
    try {
      loading.value = true
      await window.api.settings.update(key, value)
      settings.value[key] = value
    } catch (error) {
      console.error(`更新设置 ${key} 失败:`, error)
    } finally {
      loading.value = false
    }
  }

  // 切换主题
async function toggleTheme(theme?: string) {
  if (theme) {
    await updateSetting('theme', theme)
    return theme
  } else {
    const currentTheme = getSetting('theme', 'light')
    const newTheme = currentTheme === 'light' ? 'dark' : 'light'
    await updateSetting('theme', newTheme)
    return newTheme
  }
}

  return {
    settings,
    loading,
    loadSettings,
    getSetting,
    updateSetting,
    toggleTheme
  }
})