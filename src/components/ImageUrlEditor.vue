<template>
  <div class="image-url-editor">
    <div class="image-url-editor__preview" :style="{ aspectRatio: aspect }">
      <img v-if="displayUrl" :src="displayUrl" :alt="alt" />
      <div v-else class="image-url-editor__empty">
        <el-icon><Picture /></el-icon>
        <span>未设置图片</span>
      </div>
    </div>

    <div class="image-url-editor__body">
      <div class="image-url-editor__title">
        <strong>{{ label }}</strong>
        <el-tag v-if="modelValue" size="small" type="success" effect="plain">已自定义</el-tag>
        <el-tag v-else size="small" type="info" effect="plain">{{ defaultUrl ? '使用默认图' : '未设置' }}</el-tag>
      </div>
      <p class="image-url-editor__tip">{{ constraintText }}</p>
      <div class="image-url-editor__actions">
        <input ref="fileInput" class="image-url-editor__file" type="file" :accept="accept" @change="onFile" />
        <el-button size="small" type="primary" :loading="uploading" :disabled="disabled" @click="pick">
          {{ modelValue ? '更换图片' : '上传图片' }}
        </el-button>
        <el-button v-if="modelValue" size="small" :disabled="disabled || uploading" @click="clear">恢复默认</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import { uploadImage } from '@/api/media'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '图片' },
  alt: { type: String, default: '图片预览' },
  defaultUrl: { type: String, default: '' },
  accept: { type: String, default: 'image/jpeg,image/png,image/webp' },
  maxSizeMb: { type: Number, default: 2 },
  aspect: { type: String, default: '1 / 1' },
  recommendedWidth: { type: Number, default: 512 },
  recommendedHeight: { type: Number, default: 512 },
  minWidth: { type: Number, default: 128 },
  minHeight: { type: Number, default: 128 },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const fileInput = ref()
const uploading = ref(false)
const displayUrl = computed(() => props.modelValue || props.defaultUrl)
const constraintText = computed(() => {
  const size = `${props.recommendedWidth}×${props.recommendedHeight}`
  return `支持 JPG/PNG/WebP，单张 ≤ ${props.maxSizeMb}MB；建议 ${size}，最小 ${props.minWidth}×${props.minHeight}，比例偏差 ≤ 5%。`
})

function pick() {
  if (props.disabled || uploading.value) return
  fileInput.value?.click()
}

function clear() {
  if (props.disabled) return
  emit('update:modelValue', '')
  ElMessage.success(props.defaultUrl ? '已恢复默认图片' : '已清除自定义图片')
}

function validateFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    ElMessage.error('只支持 JPG、PNG、WebP 图片')
    return false
  }
  if (file.size > props.maxSizeMb * 1024 * 1024) {
    ElMessage.error(`图片不能超过 ${props.maxSizeMb}MB`)
    return false
  }
  return true
}

function validateDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const width = image.naturalWidth
      const height = image.naturalHeight
      if (width < props.minWidth || height < props.minHeight) {
        reject(new Error(`图片尺寸不能小于 ${props.minWidth}×${props.minHeight}`))
        return
      }
      const expected = props.recommendedWidth / props.recommendedHeight
      const actual = width / height
      if (Math.abs(actual - expected) > expected * 0.05) {
        reject(new Error(`图片比例需接近 ${props.recommendedWidth}:${props.recommendedHeight}`))
        return
      }
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('图片无法读取，请更换文件'))
    }
    image.src = objectUrl
  })
}

async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !validateFile(file)) return
  try {
    await validateDimensions(file)
  } catch (error) {
    ElMessage.error(error.message)
    return
  }
  uploading.value = true
  try {
    const uploaded = await uploadImage(file)
    emit('update:modelValue', uploaded?.url || '')
    ElMessage.success('图片已上传')
  } catch (error) {
    notifyAdminRequestError(error, '图片上传失败')
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.image-url-editor { display: flex; align-items: flex-start; gap: 16px; }
.image-url-editor__preview {
  width: 180px; min-width: 180px; overflow: hidden; border: 1px solid #e3eaf3; border-radius: 10px;
  background: #f6f8fb; display: grid; place-items: center;
}
.image-url-editor__preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.image-url-editor__empty { display: flex; flex-direction: column; align-items: center; gap: 5px; color: #a4afbf; font-size: 11px; }
.image-url-editor__empty .el-icon { font-size: 24px; }
.image-url-editor__body { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding-top: 2px; }
.image-url-editor__title { display: flex; align-items: center; gap: 8px; }
.image-url-editor__title strong { color: #2f3e55; font-size: 13px; }
.image-url-editor__tip { margin: 0; max-width: 520px; color: #8492a6; font-size: 12px; line-height: 1.6; }
.image-url-editor__actions { display: flex; gap: 8px; }
.image-url-editor__file { display: none; }
</style>
