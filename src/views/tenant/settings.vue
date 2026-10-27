<template>
  <div class="admin-page tenant-settings-page">
    <div class="page-header">
      <div>
        <h2>租户设置</h2>
        <p class="subtle">维护租户品牌与门店级 Logo；图片由平台媒体服务统一存储。</p>
      </div>
      <el-button :loading="saving" @click="save">保存租户 Logo</el-button>
    </div>

    <el-alert
      v-if="!canManage"
      type="warning"
      :closable="false"
      show-icon
      title="当前账号没有修改租户品牌的权限（需要 tenant.tenant.manage），仅可查看。"
    />

    <section class="admin-card">
      <div class="section-head">
        <div>
          <h3>租户 Logo</h3>
          <p class="section-subtitle">用于租户后台/品牌展示；留空时使用产品默认图。</p>
        </div>
        <el-tag effect="plain">{{ context?.tenantId || '-' }}</el-tag>
      </div>
      <ImageUrlEditor
        v-model="logoUrl"
        label="租户 Logo"
        alt="租户 Logo 预览"
        :recommended-width="512"
        :recommended-height="512"
        :min-width="128"
        :min-height="128"
        :max-size-mb="1"
        aspect="1 / 1"
        :disabled="!canManage"
      />
    </section>

    <section class="admin-card">
      <div class="section-head">
        <div>
          <h3>门店 Logo</h3>
          <p class="section-subtitle">门店 Logo 按门店分别维护，入口在「门店」列表的 Logo 列。</p>
        </div>
        <el-button size="small" @click="router.push('/admin/tenant/stores')">前往门店列表</el-button>
      </div>
      <p class="help">建议使用正方形、透明背景的 PNG/WebP；门店 Logo 会用于门店工作台与服务入口。</p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ImageUrlEditor from '@/components/ImageUrlEditor.vue'
import { getTenantBranding, updateTenantBranding } from '@/api/tenantBranding'
import { hasPermission } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

const router = useRouter()
const contextStore = useContextStore()
const context = computed(() => contextStore.current)
const canManage = computed(() => hasPermission(context.value?.permissions, 'tenant.tenant.manage'))
const logoUrl = ref('')
const saving = ref(false)

async function load() {
  try {
    const branding = await getTenantBranding()
    logoUrl.value = branding?.logoUrl || ''
  } catch (error) {
    notifyAdminRequestError(error, '加载租户品牌失败')
  }
}

async function save() {
  if (!canManage.value) return
  saving.value = true
  try {
    const branding = await updateTenantBranding(logoUrl.value || '')
    logoUrl.value = branding?.logoUrl || ''
    ElMessage.success('租户 Logo 已更新')
  } catch (error) {
    notifyAdminRequestError(error, '保存租户 Logo 失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.tenant-settings-page { display: flex; flex-direction: column; gap: 18px; }
.section-subtitle { margin: 4px 0 0; color: #8492a6; font-size: 12px; }
.help { margin: 12px 0 0; color: #75849a; font-size: 12px; line-height: 1.7; }
</style>
