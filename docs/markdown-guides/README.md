# Markdown 使用指南

本目录保存主题自有的 Markdown 使用指南及其示例素材，从原有示例文章迁移而来。它不属于文章内容挂载点，不会自动发布为博客文章，也不会被个人内容仓同步覆盖或裁剪。

各语法的使用指南入口以 [语法清单](../../src/plugins/markdown/manifest.json) 的 `docs` 为准；处理链规范见 [Markdown 扩展](../markdown-extensions.md)。修改、移动指南时，请同步更新清单和相关技能引用，并运行 `pnpm check:manifest`。

指南中 `src/content/posts/` 等路径描述的是写作和构建时的文章目录；使用独立内容仓时，在其 `content/posts/` 中写作，再由 `CONTENT_DIR` 和 `content:sync` 物化。示例 frontmatter、媒体和代码树路径应按自己的内容调整。
