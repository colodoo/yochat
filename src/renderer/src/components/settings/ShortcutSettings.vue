<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingStore } from '../../stores/setting'

const settingStore = useSettingStore()
const loading = ref(false)
const shortcutToggle = ref('')

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
    shortcutToggle.value = settingStore.getSetting('shortcut_toggle') || 'CommandOrControl+Shift+Space'
  } catch (error) {
    console.error('加载设置失败:', error)
    emit('showSnackbar', '加载设置失败，请重试')
  } finally {
    loading.value = false
  }
}

// 更新快捷键设置
async function updateShortcut() {
  if (!shortcutToggle.value) return
  
  loading.value = true
  try {
    await settingStore.updateSetting('shortcut_toggle', shortcutToggle.value)
    emit('showSnackbar', '快捷键设置已更新，重启应用后生效')
  } catch (error) {
    console.error('更新快捷键失败:', error)
    emit('showSnackbar', '更新快捷键失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-list>
    <!-- 迷你窗口快捷键 -->
    <v-list-item>
      <template v-slot:prepend>
        <v-icon>mdi-keyboard</v-icon>
      </template>
      <v-list-item-title class="text-body-2">迷你窗口快捷键</v-list-item-title>
      <template v-slot:append>
        <v-text-field
          v-model="shortcutToggle"
          variant="outlined"
          density="compact"
          hide-details
          class="shortcut-input"
          @blur="updateShortcut"
          :loading="loading"
        ></v-text-field>
      </template>
    </v-list-item>
  </v-list>
</template>

<style scoped>
.shortcut-input {
  max-width: 200px;
}
</style>