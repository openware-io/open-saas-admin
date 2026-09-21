<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <el-icon :size="40" color="#409eff"><OfficeBuilding /></el-icon>
        <h1>SaaS 管理后台</h1>
        <p>IM 后台 · 平台运营后台 · 租户后台</p>
        <p class="sub">统一登录入口</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" @keyup.enter="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="账号" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" placeholder="密码" type="password" size="large"
            :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item label="登录有效时间">
          <el-select v-model="form.ttlHours" size="large" style="width: 100%">
            <el-option label="2 小时（推荐）" :value="2" />
            <el-option label="1 天" :value="24" />
            <el-option label="7 天" :value="168" />
            <el-option label="30 天" :value="720" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="handleLogin"
            style="width: 100%">
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-tip">
        使用后台账号密码登录，按已授予的角色进入对应后台。
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { useContextStore } from '@/stores/context'
import { useBackend } from '@/composables/useBackend'
import { ssoLogin, login } from '@/api/admin'
import { OfficeBuilding, User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { resolveAdminErrorMessage } from '@/utils/adminErrorMessage'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const menuStore = useMenuStore()
const contextStore = useContextStore()
const { routeAfterLogin } = useBackend()

const formRef = ref()
const loading = ref(false)
const form = reactive({ username: '', password: '', ttlHours: 2 })
const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  await formRef.value?.validate()
  loading.value = true
  try {
    // 服务端设置 HttpOnly 会话 Cookie；前端仅缓存展示信息。
    const res = await login(form.username, form.password, form.ttlHours)
    authStore.setAuth(res.user, 'PLATFORM')
    // 新账号登录时清除旧租户上下文界面状态。
    contextStore.clear()
    await menuStore.fetchBackends()
    await routeAfterLogin(menuStore.backends)
    ElMessage.success('登录成功')
  } catch (err) {
    console.error('Login failed', err)
    ElMessage.error('登录失败：' + resolveAdminErrorMessage(err, '账号或密码错误'))
  } finally {
    loading.value = false
  }
}

// 门户 SSO：读取一次性授权码并在交换后立刻从 URL 清除。
onMounted(async () => {
  const raw = route.query.sso_ticket
  const ssoTicket = Array.isArray(raw) ? raw[0] : raw
  if (!ssoTicket) return
  loading.value = true
  try {
    const res = await ssoLogin(ssoTicket)
    authStore.setAuth(res.user, 'PLATFORM')
    // 新账号登录时清除旧租户上下文界面状态。
    contextStore.clear()
    await menuStore.fetchBackends()
    await routeAfterLogin(menuStore.backends)
    const query = { ...route.query }
    delete query.sso_ticket
    await router.replace({ path: route.path, query })
    ElMessage.success('SSO 免登录成功')
  } catch (err) {
    console.error('SSO login failed', err)
    authStore.clearLocalState()
    ElMessage.error('SSO 登录失败：' + resolveAdminErrorMessage(err, '请使用账号登录'))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1d1e2c 0%, #2c3e50 50%, #1a1a2e 100%);
}

.login-card {
  width: 420px;
  padding: 40px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header h1 {
  margin: 12px 0 8px;
  font-size: 24px;
  color: #303133;
}

.login-header p {
  color: #909399;
  font-size: 14px;
}

.login-header .sub {
  margin-top: 2px;
  font-size: 13px;
  color: #b0b3b8;
}

.login-tip {
  text-align: center;
  color: #c0c4cc;
  font-size: 12px;
  margin-top: 8px;
  line-height: 1.6;
}
</style>
