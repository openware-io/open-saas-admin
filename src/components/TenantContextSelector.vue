<template>
  <el-dropdown v-if="contextStore.items.length" trigger="click" @command="handleSelect">
    <span class="ctx-selector" :title="currentLabel">
      <el-icon><Location /></el-icon>
      <span class="ctx-label">{{ currentLabel }}</span>
      <el-icon><ArrowDown /></el-icon>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item in contextStore.items"
          :key="item.contextId"
          :command="item.contextId"
          :disabled="item.contextId === currentContextId"
        >
          <span>{{ itemLabel(item) }}</span>
          <el-tag v-if="item.contextId === currentContextId" size="small" type="success" class="ctx-tag">当前</el-tag>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Location, ArrowDown } from '@element-plus/icons-vue'
import { useContextStore } from '@/stores/context'
import { contextIdOf } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const contextStore = useContextStore()

// 由当前上下文反推 contextId（tenantId:organizationId:storeId，空段为 null）。
// 与 stores/context.js 的后台校准共用 utils/context 的同一份拼接规则。
const currentContextId = computed(() => contextIdOf(contextStore.current))

const currentLabel = computed(() => {
  if (!currentContextId.value) return '选择租户/门店'
  const item = contextStore.items.find((i) => i.contextId === currentContextId.value)
  return item ? itemLabel(item) : '未命名上下文'
})

function itemLabel(item) {
  const parts = []
  if (item.tenantName) parts.push(item.tenantName)
  if (item.organizationName) parts.push(item.organizationName)
  if (item.storeName) parts.push(item.storeName)
  return parts.join(' / ') || item.contextId
}

async function handleSelect(contextId) {
  try {
    await contextStore.select(contextId)
    ElMessage.success('已切换租户上下文')
    // 切换后重载，让各业务页按新上下文重新拉取数据
    setTimeout(() => window.location.reload(), 300)
  } catch (e) {
    notifyAdminRequestError(e, '切换上下文失败')
  }
}
</script>

<style scoped>
.ctx-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--el-text-color-primary);
  font-size: 14px;
  outline: none;
}

.ctx-label {
  max-width: min(240px, 45vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctx-tag {
  margin-left: 8px;
}
</style>
