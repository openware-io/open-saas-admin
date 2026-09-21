# 运营上下文缓存与一致性契约

> 对应实现：`src/stores/context.js`、`src/stores/auth.js`、`src/router/index.js`、`src/layout/AdminLayout.vue`、
> `src/utils/sessionWatchdog.js`（会话/CSRF 看护）、`src/api/request.js`（接口层自愈 + 一次性硬恢复）
> 背景问题：**点任意菜单都先闪一次「请选择有权限的租户或门店后继续」空态，然后才加载页面。**

## 1. 问题成因

`router.beforeEach` 原本每次导航都 `await useContextStore().ensureContext(scope)`，
而 `ensureContext` 第一句就是 `current.value = null`，于是：

| 步骤 | 结果 |
| --- | --- |
| 每次导航的守卫 | `GET /admin/auth/session` + `GET /admin/contexts` + `POST /admin/context/select`（后者还会强制刷新 IAM 权限快照并重写 Redis 会话） |
| `current = null` | `AdminLayout` 的 `v-if` 成立 → **`<router-view v-else>` 被卸载**，提示条顶掉页面 |
| 解析完成 | `current` 回填，新页面才挂载 |

也就是说：鉴权过程被直接渲染成了界面。每次点击 = 4 次往返 + 一次整页卸载。

## 2. 现在的分层

```
导航守卫 ──(settled? 立即 next)──► 页面渲染        ← 交互路径上不再有网络
   └── 后台 revalidateInBackground()（30s 节流，只读一次会话）
             ├─ 会话没了            → 清状态 + 回登录页
             ├─ 服务端上下文 == 内存 → 快照过期才重选，否则什么都不做
             └─ 服务端上下文 != 内存 → 跟随服务端 + 整页重载（不混显两套数据）
```

- **冷启动阻塞一次**：`settled === false` 时（硬刷新 / 首次进后台 / 登录后）守卫仍会等待一次完整解析。
  这是必要的——否则页面会先打出一串 `401 SAAS_CONTEXT_REQUIRED`。
  失败也置 `settled = true`，避免「账号没有可用上下文」时每次导航都卡在鉴权上。
- **解析不清空 `current`**：解析成功前一直沿用旧上下文；只有服务端明确判定「没有可用上下文」
  （上下文被回收、候选为空、会话失效）才清空。
- **空态提示的口径**：`AdminLayout` 只在 `settled && !current` 时用提示条顶掉页面，
  即「已经确认过、确实没有可用上下文」，不再是「正在校验」。

## 3. 缓存不会放宽授权（一致性）

前端缓存的只有**界面状态**，授权结论永远由服务端给出。三层兜底：

1. **服务端是唯一权威**：签名 token 存在 Redis 会话里，由网关按会话下发；
   权限/租户越界一律由下游 `PermissionGuard` 与 MyBatis 租户拦截器 403/401 拦下。
2. **接口层自愈**（`src/api/request.js`）：遇到 `PERMISSION_DENIED` / `CONTEXT_FORBIDDEN` /
   `SAAS_CONTEXT_REQUIRED` / `SAAS_CONTEXT_INVALID` 时，用会话里的 `selectedContextId`
   重选一次上下文（换取新权限快照）并重试原请求一次；权限被收紧的老会话无需重新登录。
3. **节流校准**（`stores/context.js` 的 `revalidate`）：导航与窗口聚焦时比对

   ```
   服务端 session.selectedContextId  vs  contextIdOf(current)
   ```

   比对用的拼接规则与后端 `ContextController.Scope.parse` 一致（`utils/context.js#contextIdOf`）。
   发现「另一个标签页切了门店」时立刻跟随并整页重载——**同一浏览器多标签共用服务端会话，
   不跟着切就会出现「界面显示 A 门店、数据是 B 门店」**。

## 4. 可调的实时性参数

| 常量（`stores/context.js`） | 值 | 含义 |
| --- | --- | --- |
| `REVALIDATE_INTERVAL_MS` | 30s | 后台校准的最小间隔；期间导航/聚焦不重复请求 |
| `SNAPSHOT_FRESH_MS` | 5min | 权限快照保鲜期；超过就重选换新快照（token 本身 30 分钟有效） |

需要更实时：调小 `SNAPSHOT_FRESH_MS`（代价是 IAM 调用变多）。
需要更省：调大它——**正确性不受影响**，只是「角色刚被改」到「界面可见」的窗口变长，
期间越权仍会被第 2 层的 403 自愈路径立刻拦住。

## 4.1 会话看护（`utils/sessionWatchdog.js`）

页面放着不动十几分钟到几小时后回来「点什么都没反应」，坏掉的是**前端进程内的状态**：
模块级 `csrfToken`、`stores/*` 的单飞锁（`resolving`/`revalidating`）、页面级 `loading`。
后端证据（`gv_im_server`）：

- 网关 `SaasSessionAuthenticationFilter` 只把会话里的签名上下文**透传**成 `X-Tenant-Context`，过期由下游发现；
- 签名上下文 token 只有 **30 分钟**有效期（`AdminTenantContextTokenSigner`），而后台会话默认 **2 小时**；
- 领域服务的 `TenantContextFilter` 对过期上下文直接 `sendError(401, "Invalid tenant context")`——**没有 `code`**；
- 后台服务的 CSRF 是「每个会话一枚、`GET /admin/auth/csrf` 覆盖式重发」（`SaaAdminSessionStore.issueCsrfToken`），
  会话没了时该接口抛异常 → `500 INTERNAL_ERROR`。

因此前端必须自己看护，参数都在 `utils/sessionWatchdog.js`：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `SESSION_WATCH_INTERVAL_MS` | 4min | 前台可见时轮询 `GET /admin/auth/session`；有效则刷新 CSRF **并做一次后台校准换新上下文 token**；失效则清态 + 提示 + 跳登录 |
| `HIDDEN_RESUME_THRESHOLD_MS` | 10min | 隐藏/挂起（含系统休眠导致定时器间隔被拉长）超过它回到前台，先做会话校验，再 `recoverAfterIdle` 失效并重拉上下文快照 |
| `LOCK_WATCHDOG_MS` | 20s | `ensureContext`/`revalidate` 的单飞锁上界：Promise 永不落地时释放锁并给出可重试的中文失败，绝不让导航/重试按钮永久等待 |

回到前台的自愈只做「服务端上下文与本地不一致 → 整页 reload」；
网络不可用、确实没有可用上下文都**不** reload（空态已提供「重新选择上下文 / 重新登录」两个自助入口）。

接口层的三处兜底（`api/request.js`）：

1. `403 CSRF_TOKEN_INVALID`：换新 token 重试一次；
2. `401`/`403` 的上下文类失败，**以及无 `code` 的 401**（下游判定签名上下文过期）：用会话里的 `selectedContextId`
   重选上下文换新 token 再重试一次——旧实现只认已知错误码，于是 30 分钟后的第一次操作被误判成「登录过期」，
   清态 + 踢回登录页（运营的体感就是「放一会儿就全站点了没反应，刷新才好」）；
3. 自愈重试都用完仍失败（CSRF/上下文类）→ 一次性硬恢复：清本地态 + 中文提示 + `window.location.reload()`，
   `sessionStorage` 里记时间戳，**60 秒内只允许自动刷新一次**（`HARD_RECOVERY_WINDOW_MS`）。

鉴权错误码语义（不要改坏）：

| 场景 | code | 前端行为 |
| --- | --- | --- |
| 会话确实没了 | `SAAS_SESSION_REQUIRED` / `ADMIN_SESSION_MISSING` / `ADMIN_SESSION_INVALID` | 清登录展示态 + 跳登录页 |
| 上下文没选 / 已过期（有 code） | `SAAS_CONTEXT_REQUIRED` / `SAAS_CONTEXT_INVALID` | **不登出**，中文提示 + 重选上下文重试 |
| 上下文过期（下游无 code 的 401） | （无） | **不登出**，重选上下文重试，失败才一次性硬恢复 |
| 账号确实没权限 | `PERMISSION_DENIED` | 不登出、不刷新，重选上下文重试一次 + 中文提示 |

## 5. 回归测试

`src/stores/context.test.js`：

- 解析期间不清空已有上下文（挡住「闪空态」回归）；
- `settled` 的成功与失败两种结局；
- 校准的节流、零请求快路径、跨标签页跟随、快照过期重选；
- 校准期间运营自己切上下文时本次校准作废（不能把用户的选择覆盖回去）；
- 会话失效 / 会话读取失败时的清空与保留策略；
- 回到前台自愈（快照失效重拉 / 换上下文才 reload / 网络异常不 reload）；
- 单飞锁超时释放（Promise 永不落地时导航与重试按钮不会永久等待）。

`src/stores/auth.test.js`：登录态在同一 SPA 会话内只问服务端一次。

`src/utils/sessionWatchdog.test.js`：有效→刷新 CSRF、失效→清态跳登录、隐藏暂停、回前台超阈值才校验、
定时器间隔被拉长（页面被冻结/系统休眠）等价自愈、网络抖动不登出、`withTimeout` 有界。

`src/api/request.test.js`：网络失败的中文提示与 GET 单次自动重试、CSRF 换新与单飞、
无 code 的 401 自愈（线上根因回归）、会话失效仍然跳登录、硬恢复 60 秒窗口。
