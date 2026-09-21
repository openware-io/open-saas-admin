<template>
  <div class="item-images">
    <el-upload
      ref="uploadRef"
      v-model:file-list="fileList"
      list-type="picture-card"
      :limit="9"
      multiple
      accept="image/jpeg,image/png,image/webp"
      :disabled="disabled"
      :http-request="doUpload"
      :on-success="handleSuccess"
      :on-error="handleError"
      :on-exceed="handleExceed"
      :on-preview="handlePreview"
      class="item-images__upload"
    >
      <el-icon><Plus /></el-icon>
      <template #file="{ file }">
        <div class="image-cell">
          <img class="image-cell__thumb" :src="file.url" alt="图片" />
          <span v-if="isMain(file)" class="image-cell__badge">主图</span>
          <div class="image-cell__actions">
            <el-button v-if="!isMain(file)" link type="primary" size="small" @click.stop="setMain(file)">设为主图</el-button>
            <el-button link type="danger" size="small" @click.stop="removeFile(file)">删除</el-button>
          </div>
        </div>
      </template>
    </el-upload>
    <p class="item-images__tip">最多 9 张，支持 JPG/PNG/WebP（单张 ≤ 10MB）；「主图」用于列表与点单端展示。</p>
    <el-dialog v-model="previewVisible" title="图片预览" width="min(560px, 92vw)" append-to-body>
      <img class="item-images__preview" :src="previewUrl" alt="图片预览" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { uploadImage } from '@/api/media'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const props = defineProps({
  // 已保存/待保存的图片 URL 列表
  images: { type: Array, default: () => [] },
  // 主图 URL，必须属于 images
  mainImage: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:images', 'update:mainImage'])

const uploadRef = ref()
const fileList = ref([])
const previewVisible = ref(false)
const previewUrl = ref('')
let seed = 0

function fileUrl(file) {
  return file.response?.url || file.url || ''
}

function isMain(file) {
  return !!props.mainImage && fileUrl(file) === props.mainImage
}

// 外部（打开弹窗/切换记录）→ 组件：把 URL 列表还原为 picture-card 文件列表
watch(() => [props.images, props.mainImage], () => {
  const urls = Array.isArray(props.images) ? props.images : []
  const current = fileList.value.filter((file) => file.status === 'success').map(fileUrl)
  if (current.length === urls.length && current.every((url, index) => url === urls[index])) return
  fileList.value = urls.map((url) => ({
    // uid 用负数与 el-upload 自增 uid 区分，避免与正在上传的文件冲突
    uid: -(++seed),
    name: url.split('/').pop() || url,
    status: 'success',
    url,
    response: { url },
  }))
}, { immediate: true })

// 组件 → 外部：文件列表任何变化（上传成功/删除/设为主图）都回写 URL 列表与主图
watch(fileList, () => {
  const urls = fileList.value.filter((file) => file.status === 'success').map(fileUrl).filter(Boolean)
  const main = urls.includes(props.mainImage) ? props.mainImage : (urls[0] || '')
  emit('update:images', urls)
  emit('update:mainImage', main)
}, { deep: true })

async function doUpload(options) {
  // 返回的 Promise resolve 后 el-upload 会写入 file.response（失败则移出列表）
  return uploadImage(options.file)
}

function handleSuccess(response, file) {
  // 覆盖 blob 预览地址：CSP img-src 'self' data: 不允许 blob:，必须换成后端返回的同源
  // /api/v1/media-public/... 地址（原样使用，不拼域名）
  const url = response?.url
  if (url) {
    if (String(file.url || '').startsWith('blob:')) URL.revokeObjectURL(file.url)
    file.url = url
  }
  ElMessage.success('图片已上传')
}

function handleError(error) {
  notifyAdminRequestError(error, '图片上传失败')
}

function handleExceed() {
  ElMessage.warning('最多上传 9 张图片')
}

function handlePreview(file) {
  previewUrl.value = fileUrl(file)
  previewVisible.value = true
}

function setMain(file) {
  const url = fileUrl(file)
  if (!url) return
  emit('update:mainImage', url)
  ElMessage.success('已设为主图')
}

function removeFile(file) {
  if (String(file.url || '').startsWith('blob:')) URL.revokeObjectURL(file.url)
  fileList.value = fileList.value.filter((item) => item.uid !== file.uid)
}
</script>

<style scoped>
.item-images__tip {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.image-cell {
  position: relative;
  width: 100%;
  height: 100%;
}
.image-cell__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.image-cell__badge {
  position: absolute;
  top: 0;
  left: 0;
  padding: 1px 6px;
  font-size: 11px;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 6px 0 6px 0;
}
.image-cell__actions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.45);
}
.image-cell__actions :deep(.el-button) {
  color: #fff;
  margin: 0;
}
.item-images__preview {
  width: 100%;
  display: block;
  border-radius: 6px;
}
</style>
