<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="brand-panel">
        <div class="brand-top">
          <div class="brand-mark"><el-icon :size="26"><OfficeBuilding /></el-icon></div>
          <div>
            <strong>统一管理后台</strong>
            <span>IM + SaaS OPERATIONS</span>
          </div>
        </div>

        <div class="brand-copy">
          <p class="eyebrow">ONE ENTRY · THREE WORKSPACES</p>
          <h1>一个入口，<br /><em>连接平台、租户与门店</em></h1>
          <p class="lead">按账号角色进入对应工作台，业务边界与权限在同一条链路上收敛。</p>
        </div>

        <div class="role-grid">
          <article class="role-card">
            <span class="role-index">01</span>
            <h3>平台管理</h3>
            <p>租户、平台角色与支付方式</p>
          </article>
          <article class="role-card">
            <span class="role-index">02</span>
            <h3>租户管理</h3>
            <p>总部、门店、人员与经营数据</p>
          </article>
          <article class="role-card">
            <span class="role-index">03</span>
            <h3>门店管理</h3>
            <p>预约、收银、订单与库存</p>
          </article>
        </div>

        <footer class="brand-foot">
          <span class="status-dot"></span>
          IM + SaaS 统一身份 · 权限随角色生效
        </footer>
      </section>

      <section class="form-panel">
        <div class="form-inner">
          <div class="form-heading">
            <p class="eyebrow">WELCOME BACK</p>
            <h2>登录管理后台</h2>
          </div>

          <el-form ref="formRef" :model="form" :rules="rules" @keyup.enter="handleLogin">
            <div class="field-label">账号</div>
            <el-form-item prop="username">
              <el-input v-model="form.username" placeholder="请输入账号" size="large" :prefix-icon="User" />
            </el-form-item>

            <div class="field-label">密码</div>
            <el-form-item prop="password">
              <el-input v-model="form.password" placeholder="请输入密码" type="password" size="large"
                :prefix-icon="Lock" show-password />
            </el-form-item>

            <div class="field-label">登录有效时间</div>
            <el-form-item>
              <el-select v-model="form.ttlHours" size="large" style="width: 100%">
                <el-option label="2 小时（推荐）" :value="2" />
                <el-option label="1 天" :value="24" />
                <el-option label="7 天" :value="168" />
                <el-option label="30 天" :value="720" />
              </el-select>
            </el-form-item>

            <el-form-item class="submit-item">
              <el-button type="primary" size="large" :loading="loading" class="login-button" @click="handleLogin">
                登 录
                <el-icon class="button-arrow"><ArrowRight /></el-icon>
              </el-button>
            </el-form-item>
          </el-form>

          <div class="form-meta">
            <span class="meta-dot"></span>
            使用后台账号密码登录，按已授予的角色进入对应后台。
          </div>
          <div class="form-security">
            <el-icon :size="14"><Lock /></el-icon>
            会话由服务端安全保存，角色权限实时生效
          </div>
        </div>
      </section>
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
import { ArrowRight, OfficeBuilding, User, Lock } from '@element-plus/icons-vue'
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

function scopeForWorkspace(result) {
  if (result?.defaultWorkspace === 'STORE') return 'STORE'
  if (result?.defaultWorkspace === 'HEADQUARTERS') return 'TENANT'
  return 'PLATFORM'
}
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
    authStore.setAuth(res.user, scopeForWorkspace(res), res)
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
    authStore.setAuth(res.user, scopeForWorkspace(res), res)
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
  min-height: 100vh;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 32px;
  background:
    radial-gradient(circle at 12% 12%, rgba(19, 185, 129, 0.18), transparent 32%),
    radial-gradient(circle at 82% 16%, rgba(59, 130, 246, 0.16), transparent 30%),
    linear-gradient(145deg, #08141f 0%, #0d2233 52%, #07121b 100%);
}

.login-shell {
  width: min(1180px, 100%);
  min-height: 680px;
  display: grid;
  grid-template-columns: minmax(0, 1.22fr) minmax(390px, 0.78fr);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.45);
}

.brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 34px;
  padding: 48px 52px 34px;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 92% 4%, rgba(45, 212, 191, 0.25), transparent 30%),
    radial-gradient(circle at 12% 92%, rgba(59, 130, 246, 0.16), transparent 35%),
    linear-gradient(145deg, #0a1b2b 0%, #102e40 58%, #0a1b29 100%);
}

.brand-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.26;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(180deg, #000 0%, transparent 80%);
}

.brand-panel::after {
  content: '';
  position: absolute;
  top: -150px;
  right: -120px;
  width: 380px;
  height: 380px;
  border: 1px solid rgba(94, 234, 212, 0.18);
  border-radius: 50%;
  box-shadow: 0 0 0 42px rgba(94, 234, 212, 0.04), 0 0 0 84px rgba(94, 234, 212, 0.025);
}

.brand-top,
.brand-copy,
.role-grid,
.brand-foot {
  position: relative;
  z-index: 1;
}

.brand-top {
  display: flex;
  align-items: center;
  gap: 13px;
}

.brand-mark {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(94, 234, 212, 0.35);
  border-radius: 13px;
  color: #5eead4;
  background: rgba(94, 234, 212, 0.08);
}

.brand-top strong {
  display: block;
  font-size: 17px;
  letter-spacing: 0.02em;
}

.brand-top span {
  display: block;
  margin-top: 4px;
  color: rgba(204, 251, 241, 0.56);
  font-size: 10px;
  letter-spacing: 0.16em;
}

.brand-copy {
  max-width: 560px;
}

.eyebrow {
  margin: 0 0 14px;
  color: #5eead4;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.brand-copy h1 {
  margin: 0;
  color: #f4fffd;
  font-size: clamp(30px, 3.5vw, 46px);
  font-weight: 700;
  line-height: 1.22;
  letter-spacing: -0.03em;
}

.brand-copy h1 em {
  color: #5eead4;
  font-style: normal;
}

.brand-copy .lead {
  max-width: 470px;
  margin: 18px 0 0;
  color: rgba(209, 250, 245, 0.68);
  font-size: 14px;
  line-height: 1.8;
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.role-card {
  min-height: 118px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);
  backdrop-filter: blur(10px);
}

.role-index {
  display: inline-block;
  margin-bottom: 16px;
  color: rgba(94, 234, 212, 0.7);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.role-card h3 {
  margin: 0 0 7px;
  color: #f0fffc;
  font-size: 14px;
}

.role-card p {
  margin: 0;
  color: rgba(204, 251, 241, 0.58);
  font-size: 11px;
  line-height: 1.6;
}

.brand-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(204, 251, 241, 0.55);
  font-size: 11px;
}

.status-dot,
.meta-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: #2dd4bf;
  box-shadow: 0 0 0 4px rgba(45, 212, 191, 0.1);
}

.form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 46px;
  background: #fff;
}

.form-inner {
  width: 100%;
  max-width: 356px;
}

.form-heading .eyebrow {
  margin-bottom: 12px;
  color: #13b981;
}

.form-heading {
  margin-bottom: 28px;
}

.form-heading h2 {
  margin: 0;
  color: #17212b;
  font-size: 25px;
  letter-spacing: -0.02em;
}

.field-label {
  margin: 0 0 8px;
  color: #536273;
  font-size: 12px;
  font-weight: 600;
}

.form-inner :deep(.el-form-item) {
  margin-bottom: 18px;
}

.form-inner :deep(.el-input__wrapper),
.form-inner :deep(.el-select__wrapper) {
  min-height: 44px;
  border-radius: 10px;
  background: #f5f8fa;
  box-shadow: 0 0 0 1px #e1e8ed inset;
}

.form-inner :deep(.el-input__wrapper.is-focus),
.form-inner :deep(.el-select__wrapper.is-focused) {
  background: #fff;
  box-shadow: 0 0 0 1px #13b981 inset, 0 0 0 3px rgba(19, 185, 129, 0.1);
}

.form-inner :deep(.el-input__inner) {
  color: #1f2d3d;
  font-size: 14px;
}

.form-inner :deep(.el-form-item__error) {
  padding-top: 4px;
  font-size: 11px;
}

.form-inner :deep(.submit-item) {
  margin-top: 4px;
  margin-bottom: 0;
}

.login-button {
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  background: linear-gradient(100deg, #13b981 0%, #0ea371 100%);
  box-shadow: 0 10px 22px rgba(19, 185, 129, 0.22);
}

.login-button:hover {
  background: linear-gradient(100deg, #0ea371 0%, #0b8f62 100%);
}

.button-arrow {
  margin-left: 5px;
  vertical-align: -2px;
  font-size: 13px;
}

.form-meta {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #eef2f5;
  color: #8a98a5;
  font-size: 11px;
  line-height: 1.65;
}

.form-security {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: #b0bbc5;
  font-size: 10px;
}

@media (max-width: 980px) {
  .login-page {
    padding: 18px;
    place-items: start center;
  }

  .login-shell {
    grid-template-columns: 1fr;
    min-height: 0;
    margin: 18px 0;
  }

  .brand-panel {
    gap: 24px;
    padding: 30px 28px;
  }

  .brand-copy h1 {
    font-size: 31px;
  }

  .role-grid {
    gap: 8px;
  }

  .role-card {
    min-height: auto;
    padding: 12px;
  }

  .role-index {
    margin-bottom: 10px;
  }

  .form-panel {
    padding: 34px 28px 40px;
  }
}

@media (max-width: 560px) {
  .login-page {
    padding: 0;
  }

  .login-shell {
    margin: 0;
    border-radius: 0;
    border: 0;
  }

  .brand-panel {
    padding: 24px 22px 26px;
  }

  .role-grid {
    grid-template-columns: 1fr;
  }

  .role-card {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .role-index {
    margin: 0;
  }

  .role-card p {
    margin-left: auto;
    text-align: right;
  }

  .form-panel {
    padding: 30px 22px 36px;
  }
}
</style>
