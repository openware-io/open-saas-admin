<template>
  <!--
    取消订单 / 取消预约的「原因必填」弹窗。
    不用 ElMessageBox.prompt：该服务组件在真机上点「确认取消」不关闭、不报错、也不发请求，
    而且每点一次都在 body 里留下一个不可交互的残留节点（堆叠后运营点到的是死弹窗）。
    这里改成应用内 el-dialog + 受控 textarea + 明确的行内提示与提交中状态。
  -->
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="440px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <p class="cancel-reason-tip">{{ message }}</p>
    <el-input
      ref="inputRef"
      v-model="reason"
      type="textarea"
      :rows="2"
      :maxlength="maxLength"
      show-word-limit
      :placeholder="placeholder"
      :disabled="loading"
    />
    <p v-if="showError" class="cancel-reason-error">{{ errorMessage }}</p>
    <template #footer>
      <el-button :disabled="loading" @click="close">返回</el-button>
      <el-button type="primary" :loading="loading" @click="submit">确认取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { CANCEL_REASON_MAX_LENGTH, normalizeCancelReason } from '@/utils/cancelAction'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '取消订单' },
  message: {
    type: String,
    default: '取消后会释放该订单占用的包厢，操作会记入操作日志。请填写取消原因（必填）：',
  },
  placeholder: { type: String, default: '如：客户取消' },
  /** 提交中：按钮转圈并禁止重复提交/关闭。 */
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const maxLength = CANCEL_REASON_MAX_LENGTH
const reason = ref('')
const inputRef = ref(null)
/** 只有「点过确认取消」才把行内错误显示出来，避免一打开就报红。 */
const touched = ref(false)

const errorMessage = computed(() => normalizeCancelReason(reason.value).message)
const showError = computed(() => touched.value && !!errorMessage.value)

// 每次打开都从空白开始：不带出上一次的原因，也不残留错误提示。
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    reason.value = ''
    touched.value = false
    await nextTick()
    inputRef.value?.focus?.()
  },
)

function close() {
  if (props.loading) return
  emit('update:modelValue', false)
}

function submit() {
  const { ok, reason: normalized, message } = normalizeCancelReason(reason.value)
  touched.value = true
  if (!ok) {
    // 校验不过：只提示，绝不发出取消请求（与后端 CANCEL_REASON_REQUIRED 同口径）。
    return
  }
  emit('confirm', normalized || undefined)
}
</script>

<style scoped>
.cancel-reason-tip {
  margin: 0 0 12px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.cancel-reason-error {
  margin: 8px 0 0;
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
