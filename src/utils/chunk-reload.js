/**
 * 发版后的「陈旧 chunk」自救。
 *
 * 背景（运营实测）：后台是 SPA，页面长时间开着时若前台发了新版，旧 `index.html` 记着的
 * 带哈希 chunk 已被新构建替换，点左侧菜单做**路由懒加载**就会 404，控制台报
 * `Failed to fetch dynamically imported module`，而界面上表现为**「点菜单没反应」**。
 * nginx 已把 `index.html` 设为 no-store、`/assets/` 设为 immutable，但仍救不了
 * 「部署前就打开、部署后还在用」的那个标签页——只能在客户端兜住这类失败。
 *
 * 处理：识别到 chunk 加载失败就**自动刷新一次**（刷新后拿到新 index.html 与新 chunk），
 * 并用 sessionStorage 做 10 秒防抖，避免真·网络故障时陷入无限刷新。
 */

const RELOAD_KEY = 'admin:chunk-reload-at'
const RELOAD_DEBOUNCE_MS = 10000

/** 浏览器对「动态 import 失败」的几种措辞（Chrome / Safari / Firefox 各有说法）。 */
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

export function isChunkLoadError(error) {
  return CHUNK_ERROR_PATTERN.test(String(error?.message || error || ''))
}

/** 刷新一次拿新版本；10 秒内重复触发只刷一次。返回是否真的触发了刷新。 */
export function reloadOnceForNewVersion(storage = window.sessionStorage, reload = () => window.location.reload()) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY) || 0)
    if (last && Date.now() - last < RELOAD_DEBOUNCE_MS) return false
    storage.setItem(RELOAD_KEY, String(Date.now()))
  } catch (e) {
    // 隐私模式下 sessionStorage 不可用：退化为直接刷新（宁可多刷一次也别留死页面）
  }
  reload()
  return true
}

/** 装上守卫：路由懒加载失败（router.onError）与其它动态 import 失败（unhandledrejection）都兜住。 */
export function installChunkReloadGuard(router) {
  if (router && typeof router.onError === 'function') {
    router.onError((error) => {
      if (isChunkLoadError(error)) reloadOnceForNewVersion()
    })
  }
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event?.reason)) reloadOnceForNewVersion()
  })
}
