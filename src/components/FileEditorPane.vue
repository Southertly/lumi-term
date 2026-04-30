<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '../stores/editorStore';

const editorStore = useEditorStore();

const activeFile = computed(() => editorStore.activeFile);

const updateContent = (event: Event) => {
  editorStore.updateActiveContent((event.target as HTMLTextAreaElement).value);
};
</script>

<template>
  <section class="file-editor-pane" aria-label="文件编辑器">
    <div class="editor-tabs" role="tablist" aria-label="打开的文件">
      <div
        v-for="file in editorStore.files"
        :key="file.path"
        class="editor-tab"
        :class="{ active: file.path === editorStore.activePath }"
        role="presentation"
      >
        <button
          type="button"
          class="editor-tab-switch"
          role="tab"
          :aria-selected="file.path === editorStore.activePath"
          :aria-label="`切换到 ${file.name}`"
          @click="editorStore.setActiveFile(file.path)"
        >
          <span class="editor-tab-icon" aria-hidden="true"></span>
          <span class="editor-tab-name">{{ file.name }}</span>
          <span v-if="file.loading" class="editor-loading">加载中</span>
          <span v-if="editorStore.isDirty(file.path)" class="editor-dirty" aria-label="未保存">●</span>
          <span v-if="file.saving" class="editor-saving">保存中</span>
          <span v-if="file.error" class="editor-tab-error" aria-label="保存失败">!</span>
        </button>
        <button
          type="button"
          class="editor-tab-close"
          :aria-label="`关闭 ${file.name}`"
          @click.stop="editorStore.closeFile(file.path)"
        >×</button>
      </div>
    </div>

    <div v-if="activeFile" class="editor-toolbar">
      <span class="editor-path" :title="activeFile.path">{{ activeFile.path }}</span>
      <span class="editor-status">
        <span v-if="activeFile.error" class="editor-error">{{ activeFile.error }}</span>
        <span v-else-if="activeFile.loading">加载中…</span>
        <span v-else-if="activeFile.saving">保存中…</span>
        <span v-else-if="activeFile.dirty">未保存</span>
        <span v-else>已保存</span>
      </span>
      <button
        type="button"
        class="editor-save-button"
        aria-label="保存当前文件"
        :disabled="activeFile.saving || !activeFile.dirty"
        @click="editorStore.saveActiveFile()"
      >保存</button>
    </div>

    <textarea
      v-if="activeFile && !activeFile.loading"
      class="editor-textarea"
      spellcheck="false"
      :value="activeFile.content"
      @input="updateContent"
    />

    <div v-else-if="activeFile?.loading" class="editor-empty">
      正在打开 {{ activeFile.name }}…
    </div>

    <div v-else-if="editorStore.openError" class="editor-empty error">
      {{ editorStore.openError }}
    </div>
  </section>
</template>

<style scoped>
.file-editor-pane {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  overflow: hidden;
}

.editor-tabs {
  height: 36px;
  flex: 0 0 36px;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 8px;
  background: var(--ui-bg);
  border-bottom: 1px solid var(--ui-border);
  overflow-x: auto;
  overflow-y: hidden;
}

.editor-tab {
  max-width: 220px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ui-border);
  border-bottom-color: transparent;
  border-radius: 7px 7px 0 0;
  background: color-mix(in srgb, var(--ui-bg-light) 88%, #000 12%);
  color: var(--ui-fg-muted);
  font: inherit;
  font-size: 12px;
}

.editor-tab.active {
  background: var(--ui-bg-light);
  color: var(--ui-fg);
}

.editor-tab-switch {
  min-width: 0;
  height: 100%;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 4px 0 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.editor-tab-icon {
  width: 10px;
  height: 12px;
  flex: 0 0 10px;
  border: 1px solid currentColor;
  border-radius: 2px;
  opacity: 0.7;
}

.editor-tab-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.editor-dirty {
  color: var(--ui-fg);
  font-size: 10px;
}

.editor-loading,
.editor-saving,
.editor-tab-error {
  color: var(--ui-fg-muted);
  font-size: 10px;
}

.editor-tab-error {
  color: var(--ui-fg);
  font-weight: 700;
}

.editor-tab-close {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-fg-muted);
  cursor: pointer;
}

.editor-tab-close:hover {
  background: var(--ui-hover);
  color: var(--ui-fg);
}

.editor-toolbar {
  height: 30px;
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-fg-muted);
  font-size: 11px;
}

.editor-path {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.editor-status {
  flex-shrink: 0;
}

.editor-error {
  color: var(--ui-fg);
}

.editor-save-button {
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  color: var(--ui-fg);
  cursor: pointer;
}

.editor-save-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.editor-textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 0;
  outline: none;
  padding: 14px 18px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  font: 13px/1.6 Consolas, "Cascadia Code", monospace;
}

.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  color: var(--ui-fg-muted);
  font-size: 13px;
}

.editor-empty.error {
  color: var(--ui-fg);
}
</style>
