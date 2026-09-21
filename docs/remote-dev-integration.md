# 远程前端开发联调接入规范（SaaS Admin）

> 目标：让“另一台电脑的前端开发者，本地起 dev server 连到目标环境的后端（本机 Kind / ACK dev / 生产）”成为**长期、便捷、各环境一致**的流程，而不是临时豁免。
> 适用前端：`gv_saas_admin`（本文件）、`gv_saas_mobile`（同构，见其仓库 vite 配置）。

## 1. “无权限 / 登录失效”的根因（排查顺序）

前端登录态走 **HttpOnly Cookie**（SaaS 后台：`saas_admin_session`；SaaS 移动端：`__Host-saas_c/b_session`）。远程联调出现“无权限/已过期”基本来自两类原因：

1. **Cookie 未落地**（最常见）
   - 会话 Cookie 带 `Secure`(+`SameSite=Lax`)。浏览器从 **http://其他电脑IP** 直接访问/跨源请求时，`Secure` Cookie 不会被存储；跨站 XHR 下 `Lax` 也不会随请求发送 → 后端看不到会话 → 401/403。
   - 直接跨源（你本机 5173 直连对方 http://IP:30002）还叠加 CORS：网关默认只放行 `http://localhost:5173` 等固定来源（可用 `IM_GATEWAY_ALLOWED_ORIGINS` 环境变量扩展），且 http 下无法用 SameSite=None 方案。
2. **账号缺少该环境的后台/租户授权**
   - SaaS 运营后台账号在 `platform-admin-service.saa_admin_account` 表（种子：`admin`=SUPER_ADMIN 平台级；`a380-admin`=A380 租户运营）。菜单/接口按 `AdminRole` + tenant IAM 角色绑定过滤；账号存在但无角色绑定/无上下文 → 界面提示无权限。

## 2. 推荐模式（长期、ACK 一致）：前端本地 Vite 代理（同源）

前端开发者在**自己电脑**跑 dev server，浏览器只访问 `http://localhost:5173`（localhost 被视为可信来源，Secure Cookie 可正常落；Vite 代理会帮你去掉 `Secure` 再下发给 http localhost），由 Vite 把 `/api` 转发到目标后端。同源无 CORS、无跨站 Cookie 问题，各环境只是改一个目标地址。

在 `gv_saas_admin` 新建 `.env.local`（不入库；提交 `.env.local.example` 示例）：

```bash
# 浏览器侧：全部走同源 /api，由 Vite 代理转发
VITE_API_BASE_URL=/api
# 联调目标后端（二选一/按环境切换）：
#   本机 Kind 网关：  http://<你的局域网IP>:30002   （例 http://192.168.31.91:30002）
#   ACK dev 后端：    https://api.dev.example.com
#   生产：            https://api.example.com
VITE_API_PROXY_TARGET=http://192.168.31.91:30002
# IM 管理后台跳转基址（另一个 PC Admin 前端，按需）：
VITE_IM_ADMIN_BASE_URL=http://192.168.31.91:30080
VITE_APP_VERSION=2.0.0
```

启动：`npm run dev` → 浏览器打开 `http://localhost:5173`，登录即可。
ACK/生产联调与上完全一致，仅把 `VITE_API_PROXY_TARGET` 换成对应 https 域名（vite `secure:true` 会校验证书，内网测试证书需导入信任）。

后端侧前提（本机 Kind 场景）：网关等端口已在局域网可达（本机防火墙已放行 30002/30080/30081/30082/30083，监听 0.0.0.0）；无需改后端 CORS——代理模式下后端只看到 Vite 转发请求（同源语义）。

## 3. 若确实要“直连跨源”（不推荐，仅 https 有意义）

- 后端：`IM_GATEWAY_ALLOWED_ORIGINS` 追加开发者实际来源（例 `https://dev-a.example.com`）。
- Cookie：跨站携带需要 `SameSite=None; Secure` → 会话 Cookie 策略需按环境可配置（后续如需要可做环境化开关：默认保持 Lax/Secure，仅显式开启的开发/联调配置允许 None）。
- 传输必须 https（http 下 None+Secure 无法落）。
- 结论：除非有强理由，不要用直连跨源；代理模式即官方推荐路径（`.env.ack` 已是该模式）。

## 4. 联调账号与授权

- 平台/全局：种子账号 `admin`（SUPER_ADMIN）。
- A380 租户运营：种子账号 `a380-admin`（TENANT_ADMIN，platform_account_id=100）。
- 口令：以团队默认/`.env`-外共享为准，**不写入仓库**；遗忘或需重置：为 `saa_admin_account.password_hash` 写 BCrypt(10) 哈希（`UPDATE saa_admin_account SET password_hash=? WHERE username='admin';`）或走“员工/运营人员”开通流程自动建号并绑定角色。
- 新同事专用：建议由平台管理员在 SaaS Admin “员工/运营人员”里开通（identity 建 EMPLOYEE → `saa_admin_account` → tenant `iam_user_role` 绑定），而不是复制管理员口令。
- 若登录成功仍“无权限”：多半是**上下文/角色绑定缺失**——`/api/v1/admin/contexts` 为空时选择页即无权限；给该平台账号在 tenant-service 绑定对应租户/门店角色后再刷新。

## 5. 验收与排查速查（在开发者机器）

```bash
# 1) 页面能打开且 dev 代理生效
curl -i -s http://localhost:5173/api/v1/admin/auth/csrf | head
# 2) 登录
curl -i -s -c jar -X POST http://localhost:5173/api/v1/admin/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"<口令>"}'
# 看 Set-Cookie 是否出现 saas_admin_session（Vite 已去 Secure，http localhost 可落）
# 3) 会话
curl -s -b jar http://localhost:5173/api/v1/admin/auth/session
# 4) 上下文（无权限常见点）
curl -s -b jar http://localhost:5173/api/v1/admin/contexts
```
返回 401/403/空列表时，对照 §1 两类根因定位。

## 6. 与现有 ACK 流程的一致性

- `gv_saas_admin/.env.ack` 已示范同款代理模式（`VITE_API_BASE_URL=/api` + `VITE_API_PROXY_TARGET=https://api.dev.example.com`）。
- 本规范仅把“目标地址”参数化；前端代码与后端零改动即可复用于 本机 Kind → ACK dev → 生产。
- 服务端侧的长期增强项（按需）：① 会话 Cookie 的 Secure/SameSite 策略环境化开关；② CORS 来源清单继续由 `IM_GATEWAY_ALLOWED_ORIGINS` 管理；③ 若同一后端要服务多个租户开发账号，走 §4 开通流程与角色绑定。

## 7. 落点
- 本文档：`gv_saas_admin/docs/remote-dev-integration.md`
- 示例环境：`gv_saas_admin/.env.local.example`
- 关联：`gv_saas_mobile` 同构（C/B 走 `__Host-saas_c/b_session`，同样优先代理模式；其本地联调目标为同一网关 30002）。
