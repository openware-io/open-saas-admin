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
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Location, ArrowDown } from '@element-plus/icons-vue'
import { useContextStore } from '@/stores/context'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { contextIdOf } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const router = useRouter()
const contextStore = useContextStore()
const authStore = useAuthStore()
const menuStore = useMenuStore()
const canSwitchWorkspace = computed(() => authStore.workspaces.includes('HEADQUARTERS'))

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
  if (item.businessType) parts.push(item.businessType)
  return parts.join(' / ') || item.contextId
}

async function handleSelect(contextId) {
  try {
    await contextStore.select(contextId)
    const selected = contextStore.current
    // 租户管理员切到门店时进入门店工作区；切回总部时进入租户经营总览。
    // 门店经理没有总部工作区，隐藏此选择器，不会走这里。
    if (canSwitchWorkspace.value) {
      // 租户管理员始终是 HEADQUARTERS 工作区；门店上下文只是数据范围。
      // 切到门店时进入该门店的业务首页，而不是切换成门店经理的 /store 工作区。
      authStore.setScope('TENANT')
      await menuStore.fetchMenus('TENANT')
      if (selected?.storeId && selected.storeId !== 0) {
        const target = selected.businessType === 'HOTEL'
          ? '/admin/tenant/hotel'
          : selected.businessType === 'KTV'
            ? '/admin/ktv/config'
            : '/admin/orders'
        await router.push(target)
        ElMessage.success(`已切换到门店：${selected.storeName || '当前门店'}`)
      } else {
        await router.push('/admin/tenant/overview')
        ElMessage.success('已回到租户总部')
      }
      return
    }
    ElMessage.success('已切换租户上下文')
    // 门店经理只有单店范围，保留刷新语义，让门店数据重新拉取。
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
