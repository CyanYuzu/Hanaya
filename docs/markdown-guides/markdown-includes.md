---
title: "Markdown File Includes"
published: 2026-08-28
description: "Build-time Markdown file and slice includes."
tags: [Markdown, Shirone]
category: Guides
draft: false
---

Shirone can include a local Markdown file or a safe slice of one.

<!-- @include: docs/markdown-guides/snippets/include-example.md#public-api -->

The full file and line-range forms are also supported:

```markdown
<!-- @include: docs/markdown-guides/snippets/include-example.md -->
<!-- @include: docs/markdown-guides/snippets/include-example.md{1-4} -->
<!-- @include: docs/markdown-guides/snippets/include-example.md{5-} -->
<!-- @include: docs/markdown-guides/snippets/include-example.md{-4} -->
```

Include comments inside fenced code remain literal.
