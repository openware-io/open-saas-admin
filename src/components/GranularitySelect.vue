<template>
  <el-select
    :model-value="modelValue"
    :style="{ width }"
    :disabled="disabled"
    :placeholder="placeholder"
    @change="onChange"
  >
    <el-option v-for="option in GRANULARITY_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
  </el-select>
</template>

<script setup>
/**
 * 报表**统计粒度**选择器（日 / 周 / 月 / 年）—— 各报表页共用同一个控件与词表。
 *
 * 存在的理由与 `DateRangeFilter.vue` 相同：粒度是六个报表 tab 的公共筛选条件，各 tab 自己写一份
 * `el-select` 就会出现「一边传 DAY、一边传 day」「某页忘了传 → 后端按天而页面写着按周」这类
 * 静默口径漂移。这里统一：
 *  - 取值只允许 `@/constants/terms` 的 `GRANULARITY_OPTIONS`（DAY/WEEK/MONTH/YEAR）；
 *  - 界面上只出现中文（按天/按周/按月/按年），不出现英文码；
 *  - 改粒度**不发请求**，由页面的「查询」按钮统一触发并把明细分页复位到第 1 页
 *    （与其它筛选条件同一节奏，避免筛到一半的中间态被请求出去）。
 *
 * 周起点（周一）、跨月/跨年周的归属、营业日切点都在服务端一处实现（`ReportTimeBuckets`），
 * 桶标签由响应里的 `row.bucket.label` 给出，本组件与页面都**不**自己推算周数。
 */
import { GRANULARITY_DEFAULT, GRANULARITY_OPTIONS } from '@/constants/terms'

const props = defineProps({
  /** 当前粒度：`DAY`（缺省）/ `WEEK` / `MONTH` / `YEAR`。 */
  modelValue: { type: String, default: GRANULARITY_DEFAULT },
  /** 控件宽度：与页面其它筛选控件统一。 */
  width: { type: String, default: '120px' },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '统计粒度' },
})

const emit = defineEmits(['update:modelValue', 'change'])

function onChange(value) {
  emit('update:modelValue', value)
  emit('change', value)
}
</script>
