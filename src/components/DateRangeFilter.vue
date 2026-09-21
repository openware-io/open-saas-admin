<template>
  <div class="date-range-filter">
    <el-date-picker
      v-model="inner"
      :type="type"
      :value-format="valueFormat"
      :range-separator="rangeSeparator"
      :start-placeholder="startPlaceholder"
      :end-placeholder="endPlaceholder"
      :clearable="clearable"
      :disabled="disabled"
      :unlink-panels="true"
      :style="{ width }"
      @change="onChange"
    />
    <el-button v-if="showClear" link type="primary" class="date-range-clear" :disabled="empty" @click="clear">
      清除
    </el-button>
  </div>
</template>

<script setup>
/**
 * 后台列表**统一的时间区间筛选控件**。
 *
 * 语义与 `@/utils/dateRange` 完全一致（该模块是唯一实现，本组件只做交互与提示）：
 *  - 默认空 = 不筛；
 *  - 选完后**不发请求**，由页面「查询」按钮统一触发并把页码复位到 1（与其它筛选条件同一节奏）；
 *  - 「清除」清空区间（页面的「重置」按钮也会一并清空）；
 *  - `from > to` 立即提示 `起始时间不能晚于结束时间`，并 emit `invalid`，页面据此**不发起请求**。
 *
 * `v-model` 的值就是 `el-date-picker` 原生数组（`['2026-09-01', '2026-09-30']`），
 * 页面把它原样交给 `dateRangeParams()` 序列化，不做二次转换。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  DATE_RANGE_FORMAT,
  DATE_RANGE_PLACEHOLDERS,
  DATE_TIME_RANGE_FORMAT,
  emptyDateRange,
  normalizeDateRange,
} from '@/utils/dateRange'

const props = defineProps({
  /** 区间值：`['2026-09-01', '2026-09-30']`，空区间为 `null` 或 `[null, null]`。 */
  modelValue: { type: [Array, Object], default: null },
  /** 与 el-date-picker 一致：`daterange`（默认，只到日）或 `datetimerange`（到秒）。 */
  type: { type: String, default: 'daterange' },
  /** 控件宽度：各页统一，个别窄栏可覆盖。 */
  width: { type: String, default: '260px' },
  rangeSeparator: { type: String, default: '至' },
  startPlaceholder: { type: String, default: DATE_RANGE_PLACEHOLDERS[0] },
  endPlaceholder: { type: String, default: DATE_RANGE_PLACEHOLDERS[1] },
  clearable: { type: Boolean, default: true },
  showClear: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change', 'invalid', 'clear'])

const inner = ref(toArray(props.modelValue))

watch(
  () => props.modelValue,
  (value) => {
    // 外部（查询/重置）改了值要同步回控件；值等价时不重建引用，避免打断用户正在选的面板。
    if (!sameValue(inner.value, toArray(value))) inner.value = toArray(value)
  },
)

const valueFormat = computed(() => (props.type === 'datetimerange' ? DATE_TIME_RANGE_FORMAT : DATE_RANGE_FORMAT))
const empty = computed(() => normalizeDateRange(inner.value).empty)

function onChange(value) {
  const normalized = normalizeDateRange(value)
  emit('update:modelValue', toArray(value))
  if (!normalized.valid) {
    ElMessage.warning(normalized.message)
    emit('invalid', normalized)
    return
  }
  emit('change', { value: toArray(value), from: normalized.from, to: normalized.to })
}

function clear() {
  inner.value = emptyDateRange()
  emit('update:modelValue', null)
  emit('clear')
}

/** 归一化成 `[from, to]`：`null` / 单值 / 对象形态都收敛成两元数组。 */
function toArray(value) {
  if (Array.isArray(value)) {
    const [from, to] = value
    return [from ?? null, to ?? null]
  }
  if (value && typeof value === 'object') return [value.from ?? null, value.to ?? null]
  return emptyDateRange()
}

function sameValue(left, right) {
  return left.length === right.length && left.every((item, index) => (item ?? null) === (right[index] ?? null))
}
</script>

<style scoped>
.date-range-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.date-range-clear {
  padding: 0;
}
</style>
