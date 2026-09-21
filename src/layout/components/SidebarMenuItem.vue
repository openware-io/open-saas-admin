<template>
  <el-sub-menu v-if="item.children && item.children.length" :index="subIndex">
    <template #title>
      <el-icon><component :is="resolveIcon(item.icon)" /></el-icon>
      <span>{{ item.name }}</span>
    </template>
    <SidebarMenuItem
      v-for="child in item.children"
      :key="child.id || child.code || child.path"
      :item="child"
    />
  </el-sub-menu>
  <el-menu-item v-else :index="item.path || String(item.id)">
    <el-icon><component :is="resolveIcon(item.icon)" /></el-icon>
    <template #title>
      <!--
        客户待确认加项角标：只挂在「收银台」菜单项上（客户自助加项后门店必须一眼看到，
        否则容易出现「客人加了、服务员不知道」）。数字来自服务端聚合视图，确认/拒绝后立即更新。
      -->
      <span class="sidebar-item-title">
        <span>{{ item.name }}</span>
        <el-badge
          v-if="badgeCount > 0"
          :value="badgeCount"
          :max="99"
          type="danger"
          class="sidebar-item-badge"
        />
      </span>
    </template>
  </el-menu-item>
</template>

<script setup>
import { computed } from 'vue'
import { resolveIcon } from '@/utils/icon'
import { usePendingApprovalStore } from '@/stores/pendingApproval'

defineOptions({ name: 'SidebarMenuItem' })

const props = defineProps({
  item: { type: Object, required: true },
})

const subIndex = computed(() => String(props.item.id || props.item.code || props.item.path))

/** 收银台菜单项上挂「待确认加项」角标（路径与后端菜单一致：/business/orders）。 */
const CASHIER_PATH = '/business/orders'
const pendingStore = usePendingApprovalStore()
const badgeCount = computed(() => (
  props.item && props.item.path === CASHIER_PATH ? pendingStore.pendingCount : 0
))
</script>

<style scoped>
.sidebar-item-title { display: inline-flex; align-items: center; gap: 6px; }
.sidebar-item-badge { line-height: 1; }
.sidebar-item-badge :deep(.el-badge__content) { border: none; }
</style>
