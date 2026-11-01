# Kubernetes 部署准备验证 — 2026-10-26

结论：部署包、镜像与本地部署约束验证通过；尚未向目标集群安装服务，也未完成目标域名的浏览器验收。本机 context 为 `orbstack`，不能据此推断它就是用户的目标环境。

## 已完成

| 检查 | 结果 |
| --- | --- |
| 两个 Helm Chart lint / 渲染 | 通过 |
| Kubernetes API server dry-run | 应用内置资源通过；未创建资源 |
| Keycloak / RealmImport CR | 官方固定 26.7.3 `v2beta1` schema 校验通过 |
| 部署契约测试 | 8 项通过：凭据隔离、无演示账号、TLS/Ingress 边界、迁移顺序、探针/非 root、固定 digest、PVC 保留、拒绝覆盖凭据 |
| 生成 Realm 的真实 Keycloak 回归 | 3 项通过：code+PKCE/token exchange/撤销、注册/验证邮件/找回、授权码单次使用 |
| 四个生产 Docker 镜像 | Auth、Admin API、Admin 控制台、Portal 全部构建成功 |
| 镜像启动 | 四个镜像在 UID 10001、只读根文件系统、移除 capabilities 的约束下均启动并通过 readiness |
| PostgreSQL 容器安全设置 | UID 70、只读根目录及独立可写数据/运行卷启动通过 |
| 迁移 | Auth、Admin、Portal 镜像内迁移及重复执行通过 |
| 数据库权限 | Admin API 可读业务目录，不可读会话、不可写；控制台可读会话、不可建表 |
| 内部 TLS | 实际 Nginx sidecar 非 root、只读根目录启动；两个 API 的 CA 和 DNS SAN 校验通过 |
| 数据库故障恢复 | 停库后 Portal readiness=503、liveness=200；重启后 readiness=200 |
| 备份恢复 | 角色与四个 custom-format dump 恢复到全新 PostgreSQL，四库标记数据保留 |
| 回归检查 | Portal 13 项、Admin API 6 项、控制台 5 项通过；类型、格式和新增 Python 静态检查通过 |

Realm 回归仅在临时副本加入测试用户、回环回调和本地 SMTP 捕获；提交的生成器没有演示人类账号。外部 PostgreSQL 的 CA/driver/provider 分支尚未连接真实实例，不作通过声明。

## 验证中修复的问题

1. 控制台构建依赖根目录 TypeScript 类型，构建阶段需要根目录开发依赖。
2. PostgreSQL 初始化时先开放临时 Unix socket，探针改为 TCP `127.0.0.1`，避免迁移过早开始。
3. Next.js/SWC 需要可写且可加载原生库的缓存目录，HOME/XDG/SWC 缓存配置到 `/tmp`。K8s 使用默认可执行的 `emptyDir`，Docker 测试显式使用 `tmpfs:exec` 匹配该语义。
4. Nginx 的 client/proxy/fastcgi/uwsgi/scgi 临时目录全部配置到 `/tmp`，避免只读根文件系统启动失败。

另有一次 npm registry ECONNRESET，重试相同锁定依赖后构建成功。未通过放宽 TLS 或允许 root 运行来规避。

## 本机证据

私有目录：`/private/tmp/saas-k8s-validation`。

- `container-result.json`：容器、迁移、权限、TLS、停库恢复全部 passed，cleanupSucceeded=true。
- `restore-result.json`：备份恢复 passed，cleanupSucceeded=true。
- `realm-oidc-result.json`：生成 Realm 的真实 OIDC 回归 passed，cleanupSucceeded=true。
- `server-dry-run.log`：Kubernetes server dry-run。
- `*-image.log`：镜像构建日志；`portal-tests.log` 等为回归结果。

临时 Secret、Realm 和原始执行日志可能包含测试凭据，不对外发布。CI 已增加镜像构建与部署契约测试；远端 CI 尚未执行。

## 目标环境仍待完成

明确 context/namespace、三个域名、Ingress/证书、镜像 registry、数据库位置、SMTP 和真实管理员 subject 后，按 [部署说明](README.md) 安装。使用真实 registry digest，并完成 `helm test`、目标域名的申请/审批/访问/撤权、Pod 重启、应用回滚、恢复和管理员 MFA 验收。

本地恢复不代表生产 RPO/RTO，目标环境仍需记录备份位置、调度和恢复耗时。单实例 PostgreSQL 不提供数据库高可用。
