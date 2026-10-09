# 课本与讲义

课本内容使用独立的 `textbook` Content Collection，导航入口由 `textbooksConfig.enable` 控制。内容仓目录采用“一本书一个文件夹、每章一份 Markdown”的结构：

```text
content/textbook/<书名>/
├── metadata.md
├── 声明.md
├── 第一章 标题.md
└── 第二章 标题.md
```

`metadata.md` 只包含 frontmatter，不要添加正文。它控制书名、简介、封面、日期、分类、标签、草稿状态和书本级 Markdown class。封面 `image` 可以留空，之后填写外链。

```yaml
---
title: 高等代数
description: 作者与出版社
image:
category: Textbook
order: -1
published: 2026-10-09
updated: 2026-10-09
tags: []
draft: false
cssclass: elegantbook
---
```

同文件夹中除 `metadata.md` 外的 `.md` 文件都会作为章节；章节标题默认使用文件名。frontmatter 的 `order` 是可带小数的数值，用于章节目录排序；负值章节仍可通过直链访问，但不会出现在目录中。未填写时默认为 `0`。例如 `引言.md` 使用 `order: 0`，`第一章 标题.md` 使用 `order: 1`，插在第一章与第二章之间的内容可使用 `order: 1.5`。章节 frontmatter 可省略，也可用 `title`、`draft`、`order` 或 `cssclass/cssclasses` 覆盖书本默认值。书本目录生成章节目录页，章节页提供桌面侧栏目录。

`cssclass: elegantbook` 与 Obsidian 的 `cssclasses: [elegantbook]` 都会为该文章或章节加载移植的 ElegantBook 页面和 callout 样式。支持的 `> [!eb-theorem]`、`> [!eb-proof]-` 等写法见 [Markdown 扩展](./markdown-extensions.md)。
