# FeedGlow 需求文档

> 功能需求和开发进度跟踪

---

## 🎯 核心功能

### 已完成 ✅

| 功能 | 描述 | PR/Commit |
|------|------|-----------|
| Feed 管理 | 添加/删除/分类 RSS 源 | - |
| 文章阅读 | 列表、详情、标记已读 | - |
| 收藏功能 | Star/Unstar 文章 | - |
| AI 摘要 | 使用 LLM 生成文章摘要 | - |
| AI 翻译 | 翻译文章到中文 | 7e1ecd7 |
| OPML 导入导出 | 标准格式迁移订阅 | 139c129 |
| 全文抓取 | 从原始 URL 获取完整内容 | 9d076c6 |
| API Key 配置页 | Settings 页面配置 AI API key | ce37e10 |
| Feed 图标 | 获取订阅源图标 | a0ed11b |
| 文章缩略图 | 提取文章封面图 | a0ed11b |

### 进行中 🚧

| 功能 | 描述 | 负责人 | 状态 |
|------|------|--------|------|
| UI/UX 优化 | 过渡动画、骨架屏、三栏布局 | Eve | 前端开发中 |

### 待开发 📋

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 全文搜索 | 搜索文章标题和内容 | P1 |
| PWA 支持 | 离线访问、推送通知 | P1 |
| iOS App | React Native 原生应用 | P1 |
| 键盘快捷键 | j/k 导航、m 标记已读等 | P1 |
| 智能标签 | AI 自动生成文章标签 | P2 |
| 阅读统计 | 阅读时长、文章数量统计 | P3 |

---

## 📝 已完成需求详情

### API Key 配置页 ✅

**后端** (Chad):
- `GET /api/settings/ai` - 获取配置（脱敏）
- `PUT /api/settings/ai` - 更新配置
- `POST /api/settings/ai/test` - 测试连接
- AES-256-GCM 加密存储
- 支持 OpenAI / Claude / DeepSeek / Ollama / Custom

**前端** (已完成):
- Settings 页面 AI Configuration 区域
- Provider 选择、API Key 输入
- 测试连接、保存配置

### Feed 图标 & 缩略图 ✅

**API**:
- `GET /api/feeds/:id/icon` - 返回 Feed 图标 (data URL)
- `GET /api/entries/:id/thumbnail` - 提取文章缩略图
- `GET /api/entries/:id/images` - 提取所有图片

**缩略图提取优先级**:
1. 图片附件 (enclosures)
2. 内容中第一个 img 标签
3. srcset 高清图

---

## 🔗 相关文档

- [iOS 开发计划](./ios-development-plan.md)
- [订阅方案设计](./extended-subscription-plan.md)

---

*最后更新: 2026-02-03*
