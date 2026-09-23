# open-saas-admin

GV Chat SaaS 管理后台（平台运营后台 / 租户后台），Vue 3 + Element Plus + Vite。

## 功能概览

- 平台运营管理（资源 / 订单 / 账单）
- 租户管理与入驻流程
- KTV / 门店等业务资源配置
- 员工与权限管理

## 技术栈

Vue 3 · Element Plus · Pinia · Vue Router · Vite · Vitest

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm run dev:ack    # 连接 ACK 远端后端的开发模式
npm run build      # 生产构建
npm run test       # 单元测试（Vitest）
npm run check      # 测试 + 构建 + 依赖审计
```

环境变量模板见 `.env.example`。

## 目录结构

```
src/          业务源码
docs/         设计文档
public/       静态资源
Dockerfile    容器镜像构建
nginx.conf    容器内 Nginx 配置
```

## 许可证

[Apache License 2.0](LICENSE)，由 [openware-io](https://github.com/openware-io) 维护。
