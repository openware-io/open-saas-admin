# SaaS admin security contract

The admin UI is a presentation layer only. Authentication, authorization, tenant isolation, and PII access decisions are enforced by the BFF and downstream services.

- Login and SSO exchange create an HttpOnly, Secure, SameSite session cookie; `/api/v1/admin/auth/session` is the route guard source of truth and `/api/v1/admin/auth/logout` revokes it.
- `GET /api/v1/admin/auth/csrf` supplies a short-lived token. The BFF validates `Origin` and `X-CSRF-Token` for every state-changing request.
- Selecting a tenant context stores it in the server session. Do not trust client-supplied `X-Tenant-Context`, tenant IDs, account IDs, permissions, prices, or payment totals.
- Every downstream query applies the authenticated tenant/organization/store scope and validates explicit resource ownership. PII responses require an independently checked `member.pii.view` permission.
- Financial mutations recompute amounts server-side, enforce lifecycle version checks, require persisted idempotency keys, and create immutable audit records.
