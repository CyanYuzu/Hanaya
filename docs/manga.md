# 漫画栏目与独立阅读器

在 Hanaya-Storages 的 `config/manga.yaml` 设置 `enable: true`。每部作品只需要一个 `content/manga/<作品ID>.md`，全部章节和图片外链放在同一文件的 YAML frontmatter 中。正文是作品简介，使用现有 Markdown 渲染。

可以复制内容仓库的 `Templates/漫画作品.md` 到 `content/manga/` 后修改；模板不会自动发布。完整最小格式：

```yaml
---
book_id: my-work
title: 作品名
author: 作者
description: 简介
published: 2026-10-16
reading_direction: rtl
draft: false
cover: https://你的图片域名/my-work/cover.webp
chapters:
  - id: chapter-1
    title: 第1话
    pages:
      - https://你的图片域名/my-work/01/001.jpg
      - src: https://你的图片域名/my-work/01/002.jpg
        width: 1600
        height: 2400
  - id: chapter-2
    title: 第2话
    published: 2026-10-17
    reading_direction: ltr
    pages:
      - https://你的图片域名/my-work/02/001.webp
---
作品简介。
```

- 图片必须是可直接访问、长期有效的 HTTPS 图片链接。支持 URL 查询参数（例如 CDN 转换参数），不接受带账号密码、片段或脚本的 URL。不要填写控制台页面地址或会过期的签名链接。
- 页序严格采用 `pages` 数组顺序；章节采用 `chapters` 顺序。作品 ID 与章节 ID 使用英文字母、数字、下划线、连字符，同一作品的章节 ID 不能重复。
- 图片可写为链接，也可写为 `src / width / height`。建议提供真实宽高，使连续滚动占位准确、减少布局跳动；省略时先按 3:4 占位，图片加载后修正。每章最多 10000 页。章节日期、阅读方向未填时继承作品。
- `draft: true` 隐藏整个作品。封面可省略，不需要另外创建章节 Markdown 或 JSON 清单。
- 图片由你上传、管理和删除；博客构建仅验证元数据，不下载图片，也不保管存储桶密钥。外链需允许普通浏览器直接读取，阅读器图片不发送 Referer。

访问 `/manga/` → 作品目录 → 章节。章节在同站独立阅读页打开，占满视口，保留 Shirone 的主题、Material 3 Expressive 控件和设计令牌。这里没有博客侧栏、横幅或嵌入框架。

阅读设置提供单页、双页、连续滚动、左右阅读方向、适宽/适高及缩放。支持页码跳转、上一话/下一话、键盘方向键/PageUp/PageDown/Home/End、触屏滑动、双指缩放和本机阅读进度。点击单/双页画面中间隐藏工具栏，Esc 恢复；浏览器支持时可以进一步进入全屏。连续滚动保持系统纵向触摸滚动。

单/双页仅挂载当前显示的图片，额外预取下一页。连续滚动通过 IntersectionObserver 在当前位置附近最多保留五张图片，其他页仅保留占位，所有显示图片带原生懒加载。离开的图片由浏览器自行决定 HTTP 缓存；不承诺离线缓存整章。章节元数据来自构建时 Markdown，阅读时无需额外的清单请求。

提交并推送内容仓库后，现有 Actions 会通知主题仓库重新构建、部署。新增章节无需操作 VPS。若图片替换后仍显示旧图，使用新图片文件名/版本参数并更新 Markdown，或清除你自己的 CDN 缓存。

验证：`node --test tests/manga-reader.test.mjs`、`pnpm astro check`、`pnpm build`。浏览器测试使用未发布的临时内容夹具（PowerShell）：

```powershell
pnpm content:sync
node tests/fixtures/manga-content.mjs prepare
$env:MANGA_READER_TEST = "1"
# 默认使用系统 Chrome；本机未安装 Chrome 时可指定已安装的 Edge：
$env:PLAYWRIGHT_CHANNEL = "msedge"
npx playwright test tests/site/manga.spec.ts
node tests/fixtures/manga-content.mjs clean
```

测试复用仓库的单 worker 和自动开发服务器，图片请求用确定性夹具替换，不访问真实存储桶。清理临时夹具后再执行生产构建。没有设置 `MANGA_READER_TEST=1` 时，此测试文件跳过，避免在普通站点测试中写入假作品。

漫画图片无需经过独立后端、OCR 工程、定时渲染或第三方书库。现有 BookOrbit 服务与数据不参与本栏目。

2026-10-16 验证：5 项单元测试、Edge 阅读器 5 项交互/手机视口/亮暗无障碍测试通过；现有首页亮暗无障碍 2 项通过；Astro 检查 0 错误、0 警告、0 提示；生产构建与字体预算检查通过。原子组件清单检查通过。全站 Markdown/skills 引用检查仍存在原有指南文件缺失，不能据此宣称完整 CI 全绿。手机检查使用浏览器视口模拟，未替代 Android/Safari 实机测试；你新存储桶的实际外链尚未提供，生产中没有发布测试作品。
