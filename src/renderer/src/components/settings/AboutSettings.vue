<script setup lang="ts">
import { Info, Github } from 'lucide-vue-next'

// 打开GitHub链接
function openGitHubLink() {
  (window as any).electron.ipcRenderer.send('open-external-link', 'https://github.com/colodoo/yochat')
}
</script>

<template>
  <v-list>
    <v-list-item>
      <template v-slot:prepend>
        <Info :size="20" />
      </template>
      <v-list-item-title class="text-body-2">YoChat</v-list-item-title>
      <v-list-item-subtitle class="text-caption">版本 0.1.0</v-list-item-subtitle>
    </v-list-item>
    
    <v-list-item>
      <template v-slot:prepend>
        <Github :size="20" />
      </template>
      <v-list-item-title class="text-body-2">
        <a href="#" @click.prevent="openGitHubLink">
          GitHub 仓库
        </a>
      </v-list-item-title>
    </v-list-item>
  </v-list>
</template>