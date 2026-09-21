import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { SESSION_EXPIRED_EVENT } from './utils/runtime-events'
import { installChunkReloadGuard } from './utils/chunk-reload'
// Element Plus 样式按需引入（unplugin-vue-components）只会处理模板里出现的组件；
// ElMessage / ElMessageBox / ElNotification 是以函数方式调用的服务组件，解析器不会为它们注入样式。
// 缺少样式时这些提示没有 position: fixed，会以 static 布局落在 body 末尾（视口之外），
// 表现为「点击保存/开通后没有任何反应」。因此必须在这里显式引入它们的样式。
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-notification.css'
import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// 发版后旧页面点菜单会懒加载已删除的 chunk（控制台 Failed to fetch dynamically imported module），
// 表现是「点菜单没反应」；识别到就自动刷新一次拿新版本（详见 utils/chunk-reload.js）。
installChunkReloadGuard(router)

// 接口层判定会话失效后，作废导航守卫缓存的登录态（见 utils/runtime-events.js）。
window.addEventListener(SESSION_EXPIRED_EVENT, () => useAuthStore().invalidateSession())
