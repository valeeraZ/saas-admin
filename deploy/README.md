# 单集群 Kubernetes 部署

范围是一个 Kubernetes 集群、一个命名空间、每个应用进程一个副本。SDK 是构建依赖，不是在线服务。`saas-infrastructure` 管 PostgreSQL 和 Operator 托管的 Keycloak；`saas-platform` 管 Auth、撤销任务 worker、Admin 私有 API、Admin 控制台、Portal、迁移 Job 和会话清理 CronJob。两个 release 分开升级，应用回滚不删除数据库。

目标集群、域名、镜像仓库和数据库位置尚待提供。下列 `example.com` 和 context 均是占位配置，不能直接作为生产部署凭据。当前执行记录见 [VALIDATION.md](VALIDATION.md)。

## 前置条件

- Kubernetes 1.27+、Helm 3.16+、Ingress controller 和支持 ReadWriteOnce 的 StorageClass（使用内置数据库时）。
- 对应命名空间有 Keycloak **26.7.3** Operator 及其 `v2beta1` CRD；由集群管理员安装，固定版本，不启用自动升级。Chart 不偷偷安装集群级 CRD/RBAC。按照 [官方安装流程](https://www.keycloak.org/operator/installation)，版本选 `26.7.3` 而非网页展示的最新版。
- 三个公开 HTTPS 域名：Portal、Admin 控制台、Keycloak；它们可从浏览器和集群内 Pod 访问。公开证书 Secret `saas-public-tls` 的 SAN 覆盖三个域名；也可以改三个 Chart 字段使用各自证书。生产证书可由 cert-manager 或现有证书流程维护。
- 容器仓库以及四个不可变镜像：Auth、Admin API、Admin 控制台、Portal；构建架构与节点一致。镜像拉取凭据通过 `imagePullSecrets` 配置，不写入 values。
- SMTP STARTTLS 服务及发件人，用于注册验证和找回密码。

Keycloak 使用 PostgreSQL 持久化，Operator 本身不管理数据库，见[官方部署说明](https://www.keycloak.org/operator/basic-deployment)。集群内数据库是单实例，有重启恢复能力，没有数据库高可用保证。外部数据库由目标环境独立维护。

## 1. 构建镜像

在四个仓库对应目录执行，不需要构建期业务凭据：

```sh
# saas-auth
docker build -t REGISTRY/saas-auth:COMMIT .
# saas-admin
docker build -t REGISTRY/saas-admin:COMMIT .
docker build -f web/Dockerfile -t REGISTRY/saas-console:COMMIT .
# saas-portal
docker build -t REGISTRY/saas-portal:COMMIT .
```

推送由目标仓库授权与凭据决定。推送后读取 registry 返回的 digest，把值写成 `REGISTRY/name@sha256:...`。Chart 拒绝 `latest`、浮动 tag 和未填写的镜像。`auth` 和 `worker` 使用相同的 Auth digest。

Portal 镜像必须通过 `node server.ts` 启动，不能替换成 `next start`，否则会绕过应用响应保护入口。控制台镜像的构建上下文是 Admin 仓库根目录，包含 `web` 对根目录 `src` 的依赖。

## 2. 生成稳定私有配置

从 Admin 仓库执行，Python 使用 Auth 的虚拟环境：

```sh
/absolute/path/to/saas-auth/.venv/bin/python deploy/scripts/prepare.py \
  --output /secure/path/saas-stage \
  --namespace saas-stage \
  --portal-host portal.example.com \
  --console-host admin.example.com \
  --identity-host id.example.com \
  --app-dns-suffix apps.internal.example.com \
  --smtp-host smtp.example.com \
  --smtp-from no-reply@example.com \
  --ingress-class YOUR_INGRESS_CLASS
```

默认生成集群内 PostgreSQL 配置。使用外部 PostgreSQL 时另传 `--database-host`、`--database-ca /path/to/root-ca.pem`；由数据库管理员把生成的 `database-init.sql` 用在**新的空数据库实例**，或预建同名库/账号并把实际连接信息写入对应 Secrets。外部连接启用证书与主机名验证。外部数据库的用户、TLS 和 provider 兼容性必须在目标环境实测。

生成器输出私有目录（0700），文件 0600，拒绝覆盖已有目录。它不会创建 K8s 资源。`secrets.json` 含稳定的会话加密密钥、数据库凭据、服务凭据和签名私钥；不要提交 Git、打印、上传日志或反复生成覆盖。离线加密保存此目录，数据库恢复时还需要相同的会话/任务密钥。

编辑 `platform-values.json` 填写四个镜像 digest。编辑 `secrets.json` 中 `saas-oidc-clients` 的 `SMTP_USER`/`SMTP_PASSWORD`。不要在 values 存业务密钥。若 SMTP 不需要认证，明确修改 realm 中的 `smtpServer.auth` 后再导入。

内部 API 使用 TLS sidecar 和仅集群内可达的 ClusterIP；证书 SAN 为 `saas-auth.NAMESPACE.svc.cluster.local` 和 `saas-admin-api.NAMESPACE.svc.cluster.local`。默认集群 DNS 后缀必须为 `cluster.local`，其他后缀需同步修改生成器/Chart URL 和证书。生成内部 CA 有效期 365 天，服务证书 90 天；上线后应接入证书维护流程，在到期前更新 Secret 并滚动重启 TLS sidecar。Node 使用附加 CA，Python CA bundle 同时保留公共根证书。

## 3. 安装基础设施与身份配置

以下命令都明确指定 context 与 namespace，先确认这就是目标环境：

```sh
kubectl --context CONTEXT create namespace saas-stage
kubectl --context CONTEXT -n saas-stage apply -f /secure/path/saas-stage/secrets.json
# 通过目标环境证书流程创建 saas-public-tls；不要使用本地测试证书。
helm upgrade --install saas-infra deploy/charts/saas-infrastructure \
  --kube-context CONTEXT --namespace saas-stage \
  -f /secure/path/saas-stage/infrastructure-values.json --wait --timeout 10m
kubectl --context CONTEXT -n saas-stage wait keycloak/saas-keycloak \
  --for=condition=Ready --timeout=600s
kubectl --context CONTEXT -n saas-stage apply -f /secure/path/saas-stage/realm-import.json
kubectl --context CONTEXT -n saas-stage wait keycloakrealmimport/saas-platform-realm \
  --for=condition=Done --timeout=600s
```

如果使用 nginx Ingress，应用 Ingress 通常需要 `nginx.ingress.kubernetes.io/proxy-body-size: 9m` 和 `nginx.ingress.kubernetes.io/proxy-buffering: "off"`；按实际 controller 设置，并验证 Server Actions、RSC 和流式响应。Keycloak Ingress 必须覆盖而非信任任意外来转发头，见[反向代理要求](https://www.keycloak.org/server/reverseproxy)。9000 管理端口不公开。

Realm 不包含演示人类账号，不开放 password grant。Portal/控制台使用 code+PKCE；Auth introspection 与会话撤销 worker 使用各自的凭据。worker 的 `manage-users` 服务角色仅供服务器撤销上游会话，不进入 Portal/浏览器。

Keycloak 初次管理员凭据由 Operator 的 Secret 提供，通过受限运维渠道使用。在 realm 中创建真实管理员账号，获取其稳定 `sub`，更新 `saas-console` Secret 的 `ADMIN_UI_ALLOWED_SUBJECTS`（逗号分隔）。生成器默认留空，控制台拒绝未配置的身份。平台管理员应设置 MFA，并验证恢复流程。

RealmImport **只创建，不更新已有 realm**。更新 SMTP、回调、客户端凭据或身份策略应通过受控 Keycloak 管理流程同步；不能只修改 Kubernetes Secret 后假设已有 Keycloak 客户端自动更新。导入完成后删除该 RealmImport CR 以清理临时 Job；不要删除 Keycloak CR、CRD 或数据库。

## 4. 检查并部署应用

```sh
python3 deploy/scripts/preflight.py --context CONTEXT --namespace saas-stage \
  --values /secure/path/saas-stage/platform-values.json
helm upgrade --install saas deploy/charts/saas-platform \
  --kube-context CONTEXT --namespace saas-stage \
  -f /secure/path/saas-stage/platform-values.json \
  --atomic --wait --timeout 10m
helm test saas --kube-context CONTEXT --namespace saas-stage --logs
```

Auth、Admin、Portal 的迁移作为 `pre-install,pre-upgrade` Job 完成后才滚动应用。Secrets 和数据库在基础设施阶段已经存在，因此不依赖本次应用 release 的普通资源创建时序。失败的迁移阻止新应用上线；不要用 `--no-hooks` 跳过。Job 日志保留到下一次执行或 24 小时 TTL。

Admin 迁移账号独立于只读 API 和控制台账号；迁移后执行 `scripts/database-grants.ts`，API 无法读取控制台会话，控制台无建表权限。Auth/Portal 当前各自使用独立数据库 owner；进一步拆分 Auth/Portal schema owner 与运行账号属于权限收紧工作，当前不宣称完成。

启动探针等待 schema；readiness 查询各自数据库，liveness 不把数据库临时故障当成进程死亡。worker 是持续进程，失败退出后由 Deployment 重启，任务租约保证可重试；仍需监控队列积压。CronJob 每小时清理过期 Portal/控制台会话，只取得数据库凭据。

内部 API NetworkPolicy 限制到同命名空间平台调用方，且只开放 TLS 端口；需要 CNI 实际支持 NetworkPolicy。公开边界仅 Portal、Admin 控制台和 Keycloak。初版不建立 egress 默认拒绝规则，以免未知 DNS/SMTP/审核应用的出口被误封；目标环境可按实际出口列表收紧。

## 5. 集群验收

- 所有 Deployment、PostgreSQL（如启用）及 Keycloak Ready；`helm test` 的四个服务健康检查通过，内部 TLS 验证通过。
- 浏览器真实登录、注册验证邮件、找回、退出；管理员 OIDC、MFA 和恢复路径验证。
- 发布两个审核应用；无授权时接口拒绝；申请多角色、批准/拒绝、意见回显、导航刷新、实际应用访问和撤权拒绝全部重跑。
- 验证应用 SSR/RSC、Server Actions、资源、主题、中英文和移动端。应用后端需部署真实 SDK 应用并验证签名，不能用健康检查代替业务验收。
- 删除**测试环境**的一个无状态 Pod 后会话仍可用；重建 PostgreSQL Pod 后数据仍在。迁移重复执行无破坏。
- 备份在全新数据库中恢复成功；发布上一组镜像演练应用回滚；确认数据库 schema 兼容。

跨仓库的 `integration/local-rollout.py` 使用本机临时端口/数据库，不直接接入目标 K8s；其通过记录不能冒充上述集群验收。应使用目标域名的独立测试用户和审核应用记录浏览器证据。

## 6. 备份、恢复和升级

内置 PostgreSQL 的逻辑备份：

```sh
python3 deploy/scripts/backup.py --context CONTEXT --namespace saas-stage \
  --output /secure/backup/saas-YYYYMMDD-HHMM
```

输出角色定义和四个数据库 custom-format dump。每个文件先写 `.partial`，成功后改名；失败的备份目录不得视为完整备份。备份含角色密码 hash 和用户数据，应加密保存到集群外。四个 dump 依次完成，不保证跨库同一时间点；需要业务一致性恢复点时，维护窗口停止 Portal/Admin/Auth/worker/Keycloak 写入再备份，或使用具备一致性恢复设计的数据库方案。

恢复只在新建的隔离数据库中先演练：先恢复角色，再为四个数据库创建同名库并恢复对应 owner/ACL 与数据（`pg_restore --create -d postgres`）。保留原稳定 Secrets，验证登录、应用目录、审核历史和会话；记录恢复耗时与备份时间。不要在现有业务库上使用 `--clean`，不要删除现有 PVC。

应用升级前备份，先在验收环境验证新 schema 与旧应用兼容，然后更新 digest 执行 Helm upgrade。`helm rollback saas REVISION --wait` 只回滚应用资源，不反向执行数据库迁移。破坏性 schema 迁移、Keycloak 升降级必须独立评审与恢复演练；不能靠 Helm `--atomic` 保证数据库回退。

PVC 在缩容/卸载 StatefulSet 时保留；保留不是备份。不要把删除 namespace 当作普通卸载，namespace 删除仍会删除其中 PVC/Secrets。应用会话密钥、任务密钥、签名密钥的轮换需迁移/重签策略，不允许通过重跑生成器替换。

## 本地验证命令

```sh
/absolute/path/to/saas-auth/.venv/bin/python -m unittest discover -s deploy/tests -v
helm lint deploy/charts/saas-platform -f /secure/path/saas-stage/platform-values.json
helm lint deploy/charts/saas-infrastructure -f /secure/path/saas-stage/infrastructure-values.json
```

上述结构测试使用临时假 digest，只用于渲染，不拉取这些假镜像。目标环境只能使用真实已推送 digest。
