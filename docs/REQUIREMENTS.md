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
| AI 翻译 | 翻译文章到中文 | - |
| OPML 导入导出 | 标准格式迁移订阅 | 139c129 |
| 全文抓取 | 从原始 URL 获取完整内容 | 9d076c6 |

### 进行中 🚧

| 功能 | 描述 | 负责人 | 状态 |
|------|------|--------|------|
| API Key 配置页 | 在设置页面配置 AI API key | - | 需求确认 |

### 待开发 📋

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 全文搜索 | 搜索文章标题和内容 | P1 |
| PWA 支持 | 离线访问、推送通知 | P1 |
| iOS App | React Native 原生应用 | P1 |
| 智能标签 | AI 自动生成文章标签 | P2 |
| 阅读统计 | 阅读时长、文章数量统计 | P3 |

---

## 📝 详细需求

### API Key 配置页

**背景**：
目前 AI 功能（摘要、翻译）的 API key 是通过环境变量配置的，需要改服务器配置。
用户希望能在 Web 界面直接配置 API key，方便自托管用户使用。

**功能描述**：
1. 在 Settings 页面添加 "AI Configuration" 区域
2. 支持配置以下 Provider：
   - OpenAI (API Key)
   - Anthropic Claude (API Key)
   - DeepSeek (API Key)
   - 自定义 OpenAI 兼容 API (Base URL + API Key)
   - Ollama (本地，只需 Base URL)
3. API Key 加密存储在数据库（用户级别）
4. 支持测试连接功能
5. 选择默认使用的 Provider

**UI 设计**：
```
┌─────────────────────────────────────────┐
│ AI Configuration                        │
├─────────────────────────────────────────┤
│ Provider: [DeepSeek ▾]                  │
│                                         │
│ API Key: [••••••••••••••••] [Test]     │
│                                         │
│ ☑ Use for summaries                    │
│ ☑ Use for translation                  │
│                                         │
│ [Save Configuration]                    │
└─────────────────────────────────────────┘
```

**API 设计**：
```
GET    /api/settings/ai          # 获取配置（脱敏）
PUT    /api/settings/ai          # 更新配置
POST   /api/settings/ai/test     # 测试连接
```

**数据模型**：
```typescript
interface AISettings {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom';
  apiKey?: string;        // 加密存储
  baseUrl?: string;       // 自定义/Ollama
  model?: string;         // 可选指定模型
  enableSummary: boolean;
  enableTranslation: boolean;
}
```

**安全考虑**：
- API Key 使用 AES-256 加密存储
- 前端显示时脱敏（只显示前4后4位）
- 每个用户独立配置

---

## 🔗 相关文档

- [iOS 开发计划](./ios-development-plan.md)
- [订阅方案设计](./extended-subscription-plan.md)

---

*最后更新: 2026-02-03*
