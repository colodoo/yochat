<script setup lang="ts">
import { ref, computed } from 'vue'
import GeneralSettings from '../components/settings/GeneralSettings.vue'
import McpSettings from '../components/settings/McpSettings.vue'
import ShortcutSettings from '../components/settings/ShortcutSettings.vue'
import AboutSettings from '../components/settings/AboutSettings.vue'
import { Settings, Puzzle, Keyboard, Info } from 'lucide-vue-next'

const snackbar = ref(false)
const snackbarText = ref('')
const activeTab = ref(0)



// 显示提示信息
function showSnackbar(text: string) {
  snackbarText.value = text
  snackbar.value = true
}



// 计算标签页标题
const tabTitles = computed(() => [
  { title: '常规设置', icon: Settings },
  { title: 'MCP配置', icon: Puzzle },
  { title: '快捷键', icon: Keyboard },
  { title: '关于', icon: Info }
])
</script>

<template>
  <div class="settings-container">
    <div class="d-flex settings-layout">
      <!-- 左侧标签页 -->
      <div class="settings-tabs">
        <v-list density="compact" nav>
          <v-list-item
            v-for="(tab, index) in tabTitles"
            :key="index"
            :value="index"
            :active="activeTab === index"
            @click="activeTab = index"
            class="text-body-2"
          >
            <template v-slot:prepend>
              <component :is="tab.icon" :size="16" />
            </template>
            <v-list-item-title>{{ tab.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </div>
      
      <!-- 右侧内容区 -->
      <div class="settings-content">
        <v-card flat class="h-100 w-100">
          <v-card-title class="text-h6 mb-2">{{ tabTitles[activeTab].title }}</v-card-title>
          
          <v-card-text>
            <v-window v-model="activeTab">
              <!-- 常规设置 -->
              <v-window-item :value="0">
                <GeneralSettings @show-snackbar="showSnackbar" />
              </v-window-item>
              <!-- MCP配置 -->
              <v-window-item :value="1">
                <McpSettings @show-snackbar="showSnackbar" />
              </v-window-item>
              <!-- 快捷键 -->
              <v-window-item :value="2">
                <ShortcutSettings @show-snackbar="showSnackbar" />
              </v-window-item>
              <!-- 关于 -->
              <v-window-item :value="3">
                <AboutSettings @show-snackbar="showSnackbar" />
              </v-window-item>
            </v-window>
          </v-card-text>
        </v-card>
      </div>
    </div>
    
    <!-- 提示消息 -->
  <v-snackbar v-model="snackbar" :timeout="3000">
    {{ snackbarText }}
    <template v-slot:actions>
      <v-btn color="primary" variant="text" @click="snackbar = false">关闭</v-btn>
    </template>
  </v-snackbar>
  

  

  </div>
</template>

<style scoped>
.settings-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.settings-layout {
  height: 100%;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.settings-tabs {
  width: 200px;
  border-right: 1px solid rgba(0, 0, 0, 0.12);
  background-color: rgba(var(--v-theme-surface-variant), 0.1);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
}

/* 优化图标和文字间距 */
.settings-tabs .v-list-item {
  padding-left: 16px;
  padding-right: 16px;
}

.settings-tabs .v-list-item :deep(.v-list-item__prepend) {
  margin-right: 12px;
}

.settings-tabs .v-list-item :deep(.v-list-item__prepend > .v-icon) {
  margin-right: 0;
}

/* 适配小屏幕 */
@media (max-width: 600px) {
  .settings-layout {
    flex-direction: column;
  }
  
  .settings-tabs {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  }
  
  .settings-content {
    max-height: calc(100vh - 150px);
  }
}
</style>