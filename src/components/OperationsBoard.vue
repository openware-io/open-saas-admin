<template>
  <section class="admin-page operations-board">
    <div class="page-header board-header">
      <div class="board-title-wrap">
        <span class="live-dot" />
        <div>
          <h2>{{ title }}</h2>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="board-header-actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="stats.length" class="board-stats" :style="statsGridStyle">
      <component
        :is="stat.clickable === false ? 'div' : 'button'"
        v-for="stat in stats"
        :key="stat.key || stat.label"
        class="stat-tile"
        :class="[
          stat.tone,
          {
            active: stat.filterValue != null && activeStat === stat.filterValue,
            clickable: stat.clickable !== false,
          },
        ]"
        :type="stat.clickable === false ? undefined : 'button'"
        @click="selectStat(stat)"
      >
        <span class="stat-icon" :class="stat.tone">
          <el-icon v-if="stat.icon"><component :is="stat.icon" /></el-icon>
        </span>
        <span class="stat-copy">
          <small>{{ stat.label }}</small>
          <strong>{{ stat.value }}<em v-if="stat.suffix">{{ stat.suffix }}</em></strong>
        </span>
      </component>
    </div>

    <div class="admin-card board-workspace" v-loading="loading">
      <div class="board-toolbar">
        <div class="toolbar-left">
          <el-input
            :model-value="search"
            clearable
            :placeholder="searchPlaceholder"
            class="board-search"
            @update:model-value="$emit('update:search', $event)"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <div v-if="tabs.length" class="board-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              class="board-tab"
              :class="{ active: activeTab === tab.value }"
              @click="$emit('update:activeTab', tab.value)"
            >{{ tab.label }}</button>
          </div>
          <slot name="toolbar-left-extra" />
        </div>

        <div class="toolbar-right">
          <div v-if="filters.length" class="status-filters">
            <button
              v-for="item in filters"
              :key="item.value"
              type="button"
              class="status-filter"
              :class="[item.tone || item.value, { active: activeFilter === item.value }]"
              @click="$emit('update:activeFilter', item.value)"
            ><span v-if="item.dot !== false && item.value !== 'all'" class="filter-dot" />{{ item.label }}</button>
          </div>
          <slot name="toolbar-right-extra" />
          <div v-if="showViewSwitch" class="view-switch">
            <el-tooltip content="卡片视图" placement="top">
              <button type="button" :class="{ active: viewMode === 'grid' }" @click="$emit('update:viewMode', 'grid')">
                <el-icon><Grid /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="列表视图" placement="top">
              <button type="button" :class="{ active: viewMode === 'list' }" @click="$emit('update:viewMode', 'list')">
                <el-icon><List /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </div>
      </div>

      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Grid, List, Search } from '@element-plus/icons-vue'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  search: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索' },
  stats: { type: Array, default: () => [] },
  statsColumns: { type: Number, default: 0 },
  activeStat: { type: [String, Number], default: '' },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: [String, Number], default: '' },
  filters: { type: Array, default: () => [] },
  activeFilter: { type: [String, Number], default: '' },
  viewMode: { type: String, default: 'grid' },
  showViewSwitch: { type: Boolean, default: true },
})

const emit = defineEmits([
  'update:search',
  'update:activeTab',
  'update:activeFilter',
  'update:viewMode',
  'stat-click',
])

const statsGridStyle = computed(() => ({
  '--board-stat-columns': props.statsColumns || props.stats.length,
}))

function selectStat(stat) {
  if (stat.clickable === false) return
  if (stat.filterValue != null) emit('update:activeFilter', stat.filterValue)
  emit('stat-click', stat)
}
</script>

<style scoped>
.operations-board {
  --board-green: #21a876;
  --board-red: #e2545f;
  --board-orange: #e98a2d;
  --board-blue: #3478f6;
  --board-purple: #7658c9;
}
.board-title-wrap,
.board-header-actions,
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  /* 与 .board-toolbar 同理：允许换行并允许子项收缩，长名称/多筛选不横向溢出。 */
  flex-wrap: wrap;
  row-gap: 8px;
  min-width: 0;
}
.board-title-wrap { gap: 13px; }
.board-title-wrap p {
  width: auto;
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--board-green);
  box-shadow: 0 0 0 5px rgba(33, 168, 118, .12);
  flex: none;
}
.board-header-actions { gap: 10px; }

.board-stats {
  display: grid;
  grid-template-columns: repeat(var(--board-stat-columns), minmax(118px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.stat-tile {
  min-width: 0;
  min-height: 70px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  gap: 11px;
  color: var(--el-text-color-primary);
  text-align: left;
  box-shadow: 0 2px 10px rgba(31, 41, 61, .035);
  transition: border-color .18s, box-shadow .18s, transform .18s;
}
.stat-tile.clickable { cursor: pointer; }
.stat-tile.clickable:hover,
.stat-tile.active {
  transform: translateY(-1px);
  border-color: #b9d1fb;
  box-shadow: 0 7px 18px rgba(42, 72, 120, .08);
}
.stat-copy { min-width: 0; }
.stat-tile small {
  display: block;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  margin-bottom: 4px;
  white-space: nowrap;
}
.stat-tile strong { font-size: 20px; line-height: 1; white-space: nowrap; }
.stat-tile em { margin-left: 3px; color: var(--el-text-color-placeholder); font-size: 10px; font-style: normal; font-weight: 400; }
.stat-icon {
  width: 35px;
  height: 35px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  flex: none;
  font-size: 17px;
  color: #4368b0;
  background: #edf3ff;
}
.stat-icon.idle,
.stat-icon.success,
.stat-icon.succeeded { color: #16895f; background: #eaf8f2; }
.stat-icon.serving,
.stat-icon.failed { color: #d54854; background: #fff0f1; }
.stat-icon.checkout,
.stat-icon.pending { color: #d57417; background: #fff4e7; }
.stat-icon.reserved,
.stat-icon.total { color: #2e6dcc; background: #ebf3ff; }
.stat-icon.cleaning,
.stat-icon.amount,
.stat-icon.average { color: #6848bb; background: #f0ebff; }
.stat-icon.cancelled { color: #68707e; background: #eceff3; }

.board-workspace {
  padding: 0;
  overflow: hidden;
  min-height: 520px;
}
.board-toolbar {
  min-height: 58px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 工具栏可换行：搜索/筛选项变多或名称很长时换行而不是横向溢出（房型名可能很长）。 */
  flex-wrap: wrap;
  row-gap: 8px;
  flex-wrap: wrap;
}
.toolbar-left,
.toolbar-right { gap: 10px; min-width: 0; }
.board-search { width: 240px; }
.board-tabs,
.status-filters,
.view-switch { display: flex; align-items: center; }
.board-tabs {
  padding: 3px;
  gap: 2px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  max-width: 430px;
  overflow-x: auto;
}
.board-tab,
.status-filter,
.view-switch button {
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  cursor: pointer;
}
.board-tab {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.board-tab.active {
  color: var(--el-color-primary);
  background: var(--el-bg-color);
  box-shadow: 0 1px 5px rgba(31, 41, 61, .1);
  font-weight: 600;
}
.status-filters { gap: 2px; }
.status-filter {
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 15px;
  font-size: 12px;
}
.status-filter:hover { background: var(--el-fill-color-light); }
.status-filter.active { color: var(--el-color-primary); border-color: #c6dafd; background: #eff5ff; }
.filter-dot { width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; display: inline-block; background: var(--el-color-primary); }
.status-filter.idle .filter-dot,
.status-filter.success .filter-dot,
.status-filter.succeeded .filter-dot { background: var(--board-green); }
.status-filter.serving .filter-dot,
.status-filter.failed .filter-dot { background: var(--board-red); }
.status-filter.checkout .filter-dot,
.status-filter.pending .filter-dot { background: var(--board-orange); }
.status-filter.reserved .filter-dot { background: var(--board-blue); }
.status-filter.cleaning .filter-dot,
.status-filter.amount .filter-dot { background: var(--board-purple); }
.status-filter.cancelled .filter-dot { background: #9aa2af; }
.view-switch { border: 1px solid var(--el-border-color); border-radius: 7px; padding: 2px; }
.view-switch button { width: 29px; height: 28px; border-radius: 5px; display: grid; place-items: center; }
.view-switch button.active { color: var(--el-color-primary); background: var(--el-fill-color-light); }

@media (max-width: 1500px) {
  .board-stats { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 1180px) {
  .board-toolbar { align-items: flex-start; }
  .toolbar-left,
  .toolbar-right { flex-wrap: wrap; }
}
@media (max-width: 720px) {
  .board-stats { grid-template-columns: repeat(2, 1fr); }
  .toolbar-left,
  .toolbar-right { width: 100%; }
  .board-search { width: 100%; }
  .board-tabs,
  .status-filters { max-width: 100%; overflow-x: auto; }
  .view-switch { margin-left: auto; }
  .board-title-wrap p { display: block; }
}
</style>
