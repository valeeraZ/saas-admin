# 已确认的平台约束

状态：用户已确认；身份契约候选以 saas-auth 的 codex/auth-01-contracts 分支为准（本地提交 aff26f4，尚未发布）。不复制 Auth OpenAPI 作为独立事实源。

- 平台托管，交付 Helm 与 CI/CD；开放注册。
- 采用平台托管 Keycloak，接受 Kubernetes Operator 运维；Auth 拥有稳定用户映射、组织、成员、邀请和业务角色，供应商拥有认证凭据。
- 允许外部开发者提交应用，平台审核并控制上线；每次版本更新均重新审核。
- 业务应用前端共用域名，以可自定义 suffix 挂载。路径不是浏览器隔离边界，获准应用共享同源信任。
- 后端逐请求验证用户、组织、角色和应用开通/权益。禁止仅凭浏览器 organization_id 或隐藏导航授权。
- SDK 已合并，统一 @saas-platform/* 与通用 SaaS 命名。源仓库不改动，公共包不发布。

身份服务尚未实现。首发 SAML、部署地区和邮件供应商未明确；这些不能被写成已交付能力。

## 本仓库下一步

ADMIN-01 可先定义应用目录、部署、installation/entitlement 和持久工作流。组织创建事件只触发 Admin provisioning，不把 readiness 写回 Auth 作为第二份业务事实。重复事件按 eventId 去重，序列缺口通过 Auth 受限 organizations:read 快照恢复。

审核记录须绑定不可变应用版本/镜像摘要与 reviewer，部署只能选择批准摘要；开发者不能持有生产发布凭据。suffix 校验禁止保留路径、嵌套冲突和跨组织混淆。平台保留 /api、/auth、/admin、/_next、/settings、/organizations。

访问条件为当前 Auth 成员角色 AND 有效 installation/entitlement AND READY deployment。故障缓存可保留路由，不能扩大授权。Schema/状态机仍待 ADMIN-01 实施，不声称已有 Registry 服务。
