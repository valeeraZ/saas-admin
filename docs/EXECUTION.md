# 执行清单

## ADMIN-01 固定控制后台契约与四仓库集成规则

依赖 AUTH-01 的稳定身份/租户边界；可先完成 Registry 与 workflow 设计。

基线： https://github.com/valeeraZ/portal-multiapps/tree/8cdc9ae56381dcbde8b8d3c965a75a918897896c

## 验收标准

- [ ] 定义 AppDefinition、AppDeployment、TenantAppInstallation、Entitlement 及状态机
- [ ] 发布 Registry 目录/路由/管理 API 与事件 schema，浏览器响应禁止包含 frontendTarget
- [ ] Auth 拥有租户/成员/角色，Admin 拥有开通/权益；写清访问判断和停用传播策略
- [ ] 设计持久幂等、租约、检查、重试、审计和 outbox；不持久保存浏览器 token
- [ ] 建立 integration 版本组合规范与跨服务故障验收矩阵

完成时提交实现、执行过的验证及剩余限制；不得把模拟服务验收写成真实服务验收。

## ADMIN-02 迁入管理流程并实现真实 Registry 与 worker

依赖 ADMIN-01、Auth 最小服务身份/角色 API；Web 消费经验证的 SDK 产物。

基线： https://github.com/valeeraZ/portal-multiapps/tree/8cdc9ae56381dcbde8b8d3c965a75a918897896c

## 验收标准

- [ ] 迁入原 Portal app/admin、app/api/admin、lib/admin 并适配独立部署
- [ ] Registry/流程/任务持久化；启动无需 fixture；真实健康、Shell、静态资源检查
- [ ] 双副本重复提交、提交成功响应丢失、进程重启、Auth 中断均可恢复；未 READY 不激活
- [ ] 管理 API 验证平台/租户管理员权限与 CSRF；SSRF 及跨租户测试通过
- [ ] 本仓库 integration 固定镜像版本联调 Portal/Auth/Admin、PostgreSQL 与测试邮件服务

完成时提交实现、执行过的验证及剩余限制；不得把模拟服务验收写成真实服务验收。

## ADMIN-03 完成租户应用开通与订阅权益

依赖 ADMIN-02、Auth 租户事件。先应用开通，再按已确定的商业规则接入支付提供方。

基线： https://github.com/valeeraZ/portal-multiapps/tree/8cdc9ae56381dcbde8b8d3c965a75a918897896c

## 验收标准

- [ ] 租户初始化、开通/停用、角色配置与套餐权益闭环
- [ ] 试用/席位/取消/欠费规则明确并可测试；不自行保存支付卡信息
- [ ] 重复和乱序 webhook 幂等处理并支持对账恢复
- [ ] 两个租户使用同一示例应用权限与数据隔离；租户删除流程可恢复

完成时提交实现、执行过的验证及剩余限制；不得把模拟服务验收写成真实服务验收。

## GitHub Issues

- [ADMIN-01 固定控制后台契约与四仓库集成规则](https://github.com/valeeraZ/saas-admin/issues/1)
- [ADMIN-02 迁入管理流程并实现真实 Registry 与 worker](https://github.com/valeeraZ/saas-admin/issues/2)
- [ADMIN-03 完成租户应用开通与订阅权益](https://github.com/valeeraZ/saas-admin/issues/3)
