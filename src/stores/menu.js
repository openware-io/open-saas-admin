import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBackends, getMenus } from '@/api/admin'

export const useMenuStore = defineStore('menu', () => {
  const backends = ref([])
  const backendsLoading = ref(false)
  const menus = ref([])
  const loading = ref(false)
  const error = ref('')

  async function fetchBackends() {
    backendsLoading.value = true
    try {
      backends.value = await getBackends()
    } catch (e) {
      backends.value = []
      error.value = e?.message || '获取后台列表失败'
    } finally {
      backendsLoading.value = false
    }
  }

  async function fetchMenus(scope) {
    loading.value = true
    error.value = ''
    try {
      menus.value = await getMenus(scope)
    } catch (e) {
      menus.value = []
      error.value = e?.message || '获取菜单失败'
    } finally {
      loading.value = false
    }
  }

  // 返回菜单树的第一个叶子 path，用于进入后台后跳转
  function firstLeafPath() {
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.children && n.children.length) {
          const found = walk(n.children)
          if (found) return found
        } else if (n.path) {
          return n.path
        }
      }
      return ''
    }
    return walk(menus.value)
  }

  return { backends, backendsLoading, menus, loading, error, fetchBackends, fetchMenus, firstLeafPath }
})
