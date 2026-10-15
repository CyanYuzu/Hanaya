# 漫画阅读与独立图片服务

MangaConfig.enable 默认 false，关闭时不生成漫画栏目。通过内容仓 config/manga.yaml 启用；source 和 npm 模式共用配置类型、集合 schema 及阅读器。正式内容只保存 Markdown 元数据，OCR、翻译工程、字体和凭据不进入内容仓。

```yaml
enable: true
imageOrigins:
  - https://roaster.cyanyuzu.work
```

imageOrigins 默认 []，只填写明确允许的 HTTPS origin，不包含路径。current.json 和版本 manifest 始终从本站 /manga-media/ 读取；清单中的外部图片只接受白名单 origin、成品图目录、哈希 PNG、无凭据/查询/片段的 HTTPS URL。原图和去字图不能作为阅读器页。缓存清单保留完整图片 URL，媒体索引连接失败时可使用已校验的正式版本。图片按页或有限邻页加载，无 CBZ。

该站点的存储可见性由服务端/存储桶管理；本文的阅读白名单不改变源桶权限。发布端必须在全部图片上传并可读后才原子替换 current，修订单页可复用其他图片 URL。

验证：node --test tests/manga-reader.test.mjs；npx.cmd astro check；pnpm.cmd build。跨域实际图片、Swup、缓存回退、单页修订与亮暗宽窄无障碍验收由 CyanRoaster 的独立原创夹具完成，夹具不提交到主题或内容 Git。
