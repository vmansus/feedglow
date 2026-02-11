# FeedGlow - 轻量级AI RSS阅读器

> 对标Folo，但大幅降低自托管成本

---

## 📌 项目概述

**FeedGlow** 是一个轻量级、自托管的AI RSS阅读器，目标是提供Folo 90%的功能，但部署成本降低到单个docker-compose。

**核心理念：** 基于成熟的Miniflux作为RSS引擎，在其上构建现代化的AI增强层和漂亮的前端。

---

## 🎯 功能清单

### 核心功能 (P0)
- [ ] RSS订阅管理（Miniflux驱动）
- [ ] 文章阅读（阅读模式、深色主题）
- [ ] AI文章摘要
- [ ] AI文章翻译
- [ ] 多端同步（Web + iOS）
- [ ] 已读/收藏/稍后读

### 扩展功能 (P1)
- [ ] RSSHub集成（Twitter/YouTube/Telegram）
- [ ] OPML导入导出
- [ ] 全文搜索
- [ ] 推送通知（iOS）
- [ ] PWA支持

### 高级功能 (P2)
- [ ] Newsletter订阅（Kill the Newsletter）
- [ ] Folo Lists导入器
- [ ] AI智能分类/打标签
- [ ] 离线阅读

---

## 🏗️ 技术架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                      客户端层                            │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐            │
│   │   Web   │    │ iOS App │    │   PWA   │            │
│   │ (Next.js)│   │(RN+Expo)│    │         │            │
│   └────┬────┘    └────┬────┘    └────┬────┘            │
└────────┼──────────────┼──────────────┼──────────────────┘
         │              │              │
         └──────────────┼──────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│            FeedGlow Server (Next.js)                    │
│  ┌────────────────────┴────────────────────────┐        │
│  │  • API Routes (REST)                        │        │
│  │  • AI处理层 (Vercel AI SDK)                 │        │
│  │  • 用户认证 (NextAuth)                      │        │
│  │  • Webhook接收 (Miniflux新文章)             │        │
│  └────────────────────┬────────────────────────┘        │
└───────────────────────┼─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ Miniflux │   │PostgreSQL│   │  RSSHub  │
  │  (RSS)   │   │   (DB)   │   │ (可选)   │
  └──────────┘   └──────────┘   └──────────┘
        │               │
        └───────┬───────┘
                ▼
        ┌──────────────┐
        │   AI APIs    │
        │ (OpenAI/     │
        │  Claude/     │
        │  Ollama)     │
        └──────────────┘
```

### 技术栈选型

| 层级 | 技术 | 理由 |
|------|------|------|
| **Web前端** | React + TypeScript | React Native代码复用 |
| **UI框架** | Tailwind + shadcn/ui | 现代、可定制 |
| **Web框架** | Next.js 14+ (App Router) | 全栈、SSR、API一体 |
| **iOS App** | React Native + Expo SDK 54 | 与Web共享80-90%代码 |
| **iOS UI** | Tamagui | 跨平台UI组件 |
| **状态管理** | Zustand + React Query | 轻量、类型安全 |
| **数据库** | PostgreSQL | Miniflux兼容 |
| **ORM** | Prisma 或 Drizzle | 类型安全 |
| **AI SDK** | Vercel AI SDK | 多provider统一接口 |
| **RSS引擎** | Miniflux | 成熟、轻量、API完善 |
| **扩展订阅** | RSSHub | Twitter/YouTube/TG等 |

### 代码共享策略

```
feedglow/
├── packages/
│   ├── shared/           # 100%共享
│   │   ├── types/        # TypeScript类型定义
│   │   ├── utils/        # 工具函数
│   │   ├── hooks/        # 业务hooks
│   │   └── api/          # API客户端
│   │
│   ├── ui/               # 80-90%共享
│   │   ├── components/   # 基础组件
│   │   └── themes/       # 主题配置
│   │
│   └── platform/         # 平台特定
│       ├── web/          # Web专用
│       └── mobile/       # 移动端专用
│
├── apps/
│   ├── web/              # Next.js Web应用
│   └── mobile/           # Expo iOS应用
│
└── docker/               # 部署配置
    └── docker-compose.yml
```

---

## 📦 部署架构

### Docker Compose (一键部署)

```yaml
version: '3.8'

services:
  # PostgreSQL数据库
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: feedglow
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: feedglow
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "feedglow"]
      interval: 10s

  # Miniflux RSS引擎
  miniflux:
    image: miniflux/miniflux:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://feedglow:${DB_PASSWORD}@postgres/feedglow?sslmode=disable
      RUN_MIGRATIONS: 1
      CREATE_ADMIN: 1
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: ${MINIFLUX_PASSWORD}
      POLLING_FREQUENCY: 15
      WEBHOOK_URL: http://feedglow:3000/api/webhook/miniflux
    ports:
      - "8080:8080"

  # FeedGlow主服务
  feedglow:
    build: .
    depends_on:
      - postgres
      - miniflux
    environment:
      DATABASE_URL: postgres://feedglow:${DB_PASSWORD}@postgres/feedglow
      MINIFLUX_URL: http://miniflux:8080
      MINIFLUX_API_KEY: ${MINIFLUX_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    ports:
      - "3000:3000"

  # RSSHub (可选)
  rsshub:
    image: diygod/rsshub:chromium-bundled
    environment:
      NODE_ENV: production
      CACHE_TYPE: memory
    ports:
      - "1200:1200"
    profiles:
      - extended

volumes:
  postgres_data:
```

### 资源需求

| 配置 | RAM | 磁盘 | 适合场景 |
|------|-----|------|----------|
| 最小 | 2GB | 20GB | 个人使用，<100订阅 |
| 推荐 | 4GB | 50GB | 重度使用，含RSSHub |

---

## 🔄 数据流

### 新文章处理流程

```
1. Miniflux刷新RSS
        │
        ▼
2. 发现新文章 → Webhook通知FeedGlow
        │
        ▼
3. FeedGlow接收Webhook
        │
        ▼
4. 调用AI生成摘要/翻译（可配置自动或手动）
        │
        ▼
5. 存储AI结果到数据库
        │
        ▼
6. 用户打开App → 获取文章+AI摘要
```

### AI处理策略

```typescript
// 用户可配置的AI处理策略
interface AIConfig {
  autoSummarize: boolean;      // 自动摘要
  autoTranslate: boolean;      // 自动翻译
  translateTo: string;         // 翻译目标语言
  provider: 'openai' | 'claude' | 'ollama';
  model: string;               // 具体模型
  ollamaEndpoint?: string;     // 本地Ollama地址
}
```

---

## 📱 iOS App规格

### 技术栈
- Expo SDK 54 + React Native 0.81
- Expo Router (导航)
- Tamagui (UI组件)
- expo-sqlite (离线存储)
- react-native-mmkv (KV缓存)
- expo-notifications (推送)

### 功能列表

**v1.0 (MVP)**
- [ ] 登录/账号绑定
- [ ] Feed列表浏览
- [ ] 文章阅读（含AI摘要）
- [ ] 下拉刷新
- [ ] 深色模式

**v1.1**
- [ ] 推送通知
- [ ] 离线阅读
- [ ] 分享功能

**v1.2**
- [ ] Widget
- [ ] 手势操作
- [ ] 快捷指令

### App Store要求
- iOS 15.1+ 最低支持
- 隐私政策URL
- 后台刷新用途声明
- 无障碍支持

---

## 🔌 第三方集成

### Miniflux API (核心)

| 能力 | 用途 |
|------|------|
| `GET /v1/feeds` | 获取订阅列表 |
| `GET /v1/entries` | 获取文章（支持丰富过滤） |
| `PUT /v1/entries/{id}` | 更新文章（存AI摘要） |
| `POST /v1/discover` | 发现新订阅源 |
| Webhook | 新文章实时通知 |

### RSSHub (扩展订阅)

| 平台 | 路由示例 |
|------|----------|
| Twitter/X | `/twitter/user/:id` |
| YouTube | `/youtube/channel/:id` |
| Telegram | `/telegram/channel/:id` |
| Bilibili | `/bilibili/user/video/:uid` |

### AI Provider (可切换)

```typescript
// Vercel AI SDK统一接口
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { ollama } from 'ollama-ai-provider';

const providers = {
  openai: openai('gpt-4o'),
  claude: anthropic('claude-sonnet-4-20250514'),
  ollama: ollama('llama3'),
};
```

---

## 📅 开发计划

### Phase 1: 基础MVP (2周)
- [ ] 项目骨架搭建 (monorepo)
- [ ] Miniflux集成
- [ ] 基础Web UI
- [ ] 文章列表/阅读
- [ ] Docker Compose部署

### Phase 2: AI功能 (1周)
- [ ] AI摘要生成
- [ ] AI翻译
- [ ] 多Provider支持
- [ ] 用户配置界面

### Phase 3: iOS App (2周)
- [ ] Expo项目初始化
- [ ] 核心页面实现
- [ ] 离线存储
- [ ] TestFlight发布

### Phase 4: 扩展功能 (1周)
- [ ] RSSHub集成
- [ ] Folo导入器
- [ ] 推送通知

### Phase 5: 打磨发布 (1周)
- [ ] UI/UX优化
- [ ] 性能优化
- [ ] 文档完善
- [ ] 开源发布

**总计: 约7周**

---

## 📁 相关文档

调研报告已保存在:
- `reports/folo-technical-analysis.md` - Folo架构分析
- `feedglow/docs/ios-development-plan.md` - iOS开发方案
- `feedglow/docs/extended-subscription-plan.md` - RSSHub扩展方案

---

## 🤝 分工建议

适合并行开发的模块:

| 模块 | 依赖 | 可并行 |
|------|------|--------|
| Web前端UI | 无 | ✅ |
| Miniflux集成层 | 无 | ✅ |
| AI处理模块 | 无 | ✅ |
| iOS App | 需API定义 | ⚠️ 需先定义API |
| Docker部署 | 需各服务 | ⚠️ 最后整合 |

建议分工:
1. **Agent A**: Web前端 + UI组件
2. **Agent B**: 后端API + Miniflux集成 + AI处理
3. **Agent C**: iOS App
4. **整合**: Docker部署 + 测试

---

## 📝 注意事项

### AGPL-3.0 (Folo许可证)
- ❌ 不能复制Folo代码
- ❌ icons/mgc图标不能使用
- ✅ 可借鉴架构设计、API设计
- ✅ 可使用相同开源依赖

### Twitter/X订阅挑战
- 需要账号池 + 代理轮换
- 建议作为可选功能
- 优先支持其他平台

---

*文档版本: 1.0*
*创建时间: 2026-02-03*
*创建者: Eve (OpenClaw)*
