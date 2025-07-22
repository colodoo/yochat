<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { FileText, Plus, Trash2 } from 'lucide-vue-next'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

interface Note {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

// 响应式数据
const notes = ref<Note[]>([])
const loading = ref(false)
const searchQuery = ref('')
const showDeleteDialog = ref(false)
const selectedNote = ref<Note | null>(null)
const isCreatingNew = ref(false)

// 编辑表单
const editForm = ref({
  title: '',
  content: ''
})

// 计算属性：过滤后的笔记列表
const filteredNotes = computed(() => {
  if (!searchQuery.value) return notes.value
  const query = searchQuery.value.toLowerCase()
  return notes.value.filter(note => 
    note.title.toLowerCase().includes(query) || 
    note.content.toLowerCase().includes(query)
  )
})

// 加载所有笔记
async function loadNotes() {
  try {
    loading.value = true
    const result = await window.api.notes.getAll()
    notes.value = result
    // 如果没有选中笔记且有笔记存在，选中最新的笔记
    if (!selectedNote.value && notes.value.length > 0) {
      selectNote(notes.value[0])
    }
  } catch (error) {
    console.error('加载笔记失败:', error)
  } finally {
    loading.value = false
  }
}

// 选择笔记
function selectNote(note: Note) {
  selectedNote.value = note
  editForm.value = { title: note.title, content: note.content }
  isCreatingNew.value = false
}

// 创建新笔记
function createNewNote() {
  selectedNote.value = null
  editForm.value = { title: '', content: '' }
  isCreatingNew.value = true
}

// 打开删除确认对话框
function openDeleteDialog(note: Note) {
  selectedNote.value = note
  showDeleteDialog.value = true
}

// 保存笔记（创建或更新）
async function saveNote() {
  if (!editForm.value.title.trim() || !editForm.value.content.trim()) {
    return
  }
  
  try {
    if (isCreatingNew.value) {
      // 创建新笔记
      const newNoteId = await window.api.notes.create(editForm.value.title, editForm.value.content)
      await loadNotes()
      // 选中新创建的笔记
      const newNote = notes.value.find(note => note.id === newNoteId)
      if (newNote) {
        selectNote(newNote)
      }
    } else if (selectedNote.value) {
      // 更新现有笔记
      await window.api.notes.update(selectedNote.value.id, editForm.value.title, editForm.value.content)
      await loadNotes()
      // 重新选中更新后的笔记
      const updatedNote = notes.value.find(note => note.id === selectedNote.value?.id)
      if (updatedNote) {
        selectNote(updatedNote)
      }
    }
  } catch (error) {
    console.error('保存笔记失败:', error)
  }
}

// 删除笔记
async function deleteNote() {
  if (!selectedNote.value) return
  
  try {
    await window.api.notes.delete(selectedNote.value.id)
    showDeleteDialog.value = false
    await loadNotes()
  } catch (error) {
    console.error('删除笔记失败:', error)
  }
}

// 格式化日期
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('zh-CN')
}

// 组件挂载时加载笔记
onMounted(() => {
  loadNotes()
})
</script>

<template>
  <div class="notes-container">
    <!-- 左侧笔记列表 -->
    <div class="notes-sidebar">
      <!-- 侧边栏头部 -->
      <div class="sidebar-header">
        <div class="sidebar-title">
          <FileText :size="20" class="mr-2" />
          <span class="text-h6">笔记</span>
        </div>
        <v-btn
          size="small"
          color="primary"
          variant="text"
          @click="createNewNote"
          icon
        >
          <Plus :size="18" />
        </v-btn>
      </div>
      
      <!-- 搜索框 -->
      <div class="sidebar-search">
        <v-text-field
          v-model="searchQuery"
          placeholder="搜索笔记..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          class="search-input"
        />
      </div>

      <!-- 笔记列表 -->
      <div class="notes-list">
        <div v-if="!loading && filteredNotes.length > 0" class="note-items">
          <div
            v-for="note in filteredNotes"
            :key="note.id"
            class="note-item"
            :class="{ 'note-item-active': selectedNote?.id === note.id }"
            @click="selectNote(note)"
          >
            <div class="note-item-header">
              <h4 class="note-item-title">{{ note.title }}</h4>
              <v-btn
                size="x-small"
                color="error"
                variant="text"
                icon
                @click.stop="openDeleteDialog(note)"
                class="note-delete-btn"
              >
                <Trash2 :size="14" />
              </v-btn>
            </div>
            <p class="note-item-content">
              {{ note.content.substring(0, 80) }}{{ note.content.length > 80 ? '...' : '' }}
            </p>
            <div class="note-item-date">
              {{ formatDate(note.createdAt) }}
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!loading && filteredNotes.length === 0" class="sidebar-empty">
          <FileText :size="32" class="empty-icon" />
          <p class="empty-text">
            {{ searchQuery ? '未找到匹配的笔记' : '还没有笔记' }}
          </p>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="sidebar-loading">
          <v-progress-circular indeterminate color="primary" size="24" />
          <p class="loading-text">加载中...</p>
        </div>
      </div>
    </div>

    <!-- 右侧编辑器区域 -->
    <div class="editor-area">
      <div v-if="selectedNote || isCreatingNew" class="editor-content">
        <!-- 编辑器头部 -->
        <div class="editor-header">
          <v-text-field
            v-model="editForm.title"
            placeholder="笔记标题"
            variant="plain"
            hide-details
            class="editor-title-input"
          />
          <div class="editor-actions">
            <v-btn
              color="primary"
              @click="saveNote"
              :disabled="!editForm.title.trim() || !editForm.content.trim()"
              prepend-icon="mdi-content-save"
            >
              保存
            </v-btn>
          </div>
        </div>
        
        <!-- Markdown编辑器 -->
        <div class="editor-body">
          <MdEditor
            v-model="editForm.content"
            :height="'100%'"
            :preview="true"
            :toolbars="[
              'bold', 'underline', 'italic', 'strikeThrough', '-',
              'title', 'sub', 'sup', 'quote', 'unorderedList', 'orderedList', 'task', '-',
              'codeRow', 'code', 'link', 'image', 'table', '-',
              'revoke', 'next', '=', 'pageFullscreen', 'fullscreen', 'preview', 'previewOnly'
            ]"
            :placeholder="'开始编写您的笔记...'"
            language="zh-CN"
            :theme="'light'"
            :preview-theme="'default'"
            :code-theme="'atom'"
          />
        </div>
      </div>
      
      <!-- 未选中状态 -->
      <div v-else class="editor-empty">
        <FileText :size="64" class="empty-icon" />
        <h3 class="empty-title">选择一个笔记开始编辑</h3>
        <p class="empty-subtitle">从左侧列表中选择笔记，或创建一个新笔记</p>
        <v-btn
          color="primary"
          @click="createNewNote"
          prepend-icon="mdi-plus"
          class="mt-4"
        >
          创建新笔记
        </v-btn>
      </div>
    </div>



    <!-- 删除确认对话框 -->
    <v-dialog v-model="showDeleteDialog" max-width="400px">
      <v-card>
        <v-card-title class="text-h6">
          <Trash2 :size="20" class="mr-2" />
          确认删除
        </v-card-title>
        <v-card-text>
          确定要删除笔记 "{{ selectedNote?.title }}" 吗？此操作无法撤销。
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="grey"
            variant="text"
            @click="showDeleteDialog = false"
          >
            取消
          </v-btn>
          <v-btn
            color="error"
            @click="deleteNote"
          >
            删除
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.notes-container {
  height: 100vh;
  display: flex;
  flex-direction: row;
  background-color: #f5f5f5;
}

.notes-sidebar {
  width: 350px;
  background: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  background: white;
}

.sidebar-title {
  display: flex;
  align-items: center;
  font-weight: 600;
  color: #1976d2;
}

.sidebar-search {
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
}

.notes-list {
  flex: 1;
  overflow-y: auto;
}

.note-items {
  padding: 8px 0;
}

.note-item {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.note-item:hover {
  background-color: #f8f9fa;
}

.note-item-active {
  background-color: #e3f2fd;
  border-right: 3px solid #1976d2;
}

.note-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.note-item-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: #333;
  flex: 1;
  margin-right: 8px;
}

.note-delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.note-item:hover .note-delete-btn {
  opacity: 1;
}

.note-item-content {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
  margin: 0 0 8px 0;
}

.note-item-date {
  font-size: 11px;
  color: #999;
}

.sidebar-empty,
.sidebar-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  color: #ccc;
  margin-bottom: 16px;
}

.empty-text {
  color: #666;
  margin: 0;
}

.loading-text {
  color: #666;
  margin: 8px 0 0 0;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  height: 100vh;
}

.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-header {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e0e0e0;
  background: white;
}

.editor-title-input {
  flex: 1;
  margin-right: 16px;
}

.editor-title-input :deep(.v-field__input) {
  font-size: 18px;
  font-weight: 600;
}

.editor-actions {
  flex-shrink: 0;
}

.editor-body {
  flex: 1;
  padding: 0 24px 24px 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
}

.editor-empty .empty-icon {
  color: #ccc;
  margin-bottom: 24px;
}

.empty-title {
  color: #333;
  margin: 0 0 8px 0;
  font-weight: 500;
}

.empty-subtitle {
  color: #666;
  margin: 0 0 24px 0;
}

/* 深度选择器用于修改 md-editor-v3 的样式 */
:deep(.md-editor) {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  height: 100% !important;
  display: flex;
  flex-direction: column;
}

:deep(.md-editor-toolbar) {
  border-bottom: 1px solid #e0e0e0;
  background-color: #fafafa;
  flex-shrink: 0;
}

:deep(.md-editor-content) {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* 编辑器样式优化 */
:deep(.md-editor-input-wrapper),
:deep(.md-editor-preview-wrapper) {
  font-size: 14px;
  line-height: 1.6;
  flex: 1;
  overflow: auto;
}

/* 滚动条样式 */
.notes-list::-webkit-scrollbar {
  width: 6px;
}

.notes-list::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.notes-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.notes-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>