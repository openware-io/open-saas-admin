# open-saas-admin

[中文](README.md) | [English](README.en.md)

SaaS admin console (platform operations and tenant admin), built with Vue 3 + Element Plus + Vite.

## Features

- Platform operations (resources, orders, billing)
- Tenant management and onboarding
- KTV/store business configuration
- Staff and permissions

## Stack

Vue 3 · Element Plus · Pinia · Vue Router · Vite · Vitest

## Local development

```bash
npm install
npm run dev        # dev server
npm run dev:ack    # dev mode against the ACK backend
npm run build      # production build
npm run test       # unit tests (Vitest)
npm run check      # tests + build + dependency audit
```

See `.env.example` for environment variables.

## Layout

```text
src/          application source
docs/         design documents
public/       static assets
Dockerfile    container image
nginx.conf    in-container Nginx config
```

## License

[Apache License 2.0](LICENSE), maintained by [openware-io](https://github.com/openware-io).
