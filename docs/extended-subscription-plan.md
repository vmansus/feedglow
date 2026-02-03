# 扩展订阅技术方案

> 调研日期：2026-02-03

## 概述

本文档调研了 FeedGlow 扩展订阅能力的技术方案，包括 RSSHub 部署、Twitter/X 订阅、Newsletter 转 RSS、以及 Folo 导入器设计。

---

## 1. RSSHub 部署

### 1.1 Docker 部署方式（推荐）

**官方 docker-compose.yml 结构：**

```yaml
services:
  rsshub:
    image: diygod/rsshub  # 或 ghcr.io/diygod/rsshub
    restart: always
    ports:
      - '1200:1200'
    environment:
      NODE_ENV: production
      CACHE_TYPE: redis
      REDIS_URL: 'redis://redis:6379/'
      PUPPETEER_WS_ENDPOINT: 'ws://browserless:3000'
    depends_on:
      - redis
      - browserless

  browserless:
    image: browserless/chrome
    restart: always

  redis:
    image: redis:alpine
    restart: always
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

**镜像选择：**

| 镜像标签 | 说明 | Puppeteer 支持 |
|---------|------|---------------|
| `latest` | 最新版本 | ❌ |
| `chromium-bundled` | 内置 Chromium | ✅ |
| `{YYYY-MM-DD}` | 特定日期版本 | ❌ |
| `chromium-bundled-{YYYY-MM-DD}` | 特定日期 + Chromium | ✅ |

**支持架构：**
- linux/amd64
- linux/arm64

### 1.2 资源占用估算

| 组件 | 内存 | 磁盘 | 说明 |
|-----|------|------|------|
| RSSHub | 256-512MB | ~500MB | 基础版 |
| RSSHub + Chromium | 512MB-1GB | ~1.5GB | 需要 Puppeteer |
| Redis | 64-128MB | 按需 | 缓存 |
| Browserless | 512MB-1GB | ~1GB | 远程浏览器 |

**最小配置推荐：** 2GB RAM / 10GB 磁盘

### 1.3 关键环境变量

```bash
# 网络
PORT=1200
REQUEST_TIMEOUT=3000

# 缓存
CACHE_TYPE=redis
CACHE_EXPIRE=300          # 路由缓存 5 分钟
CACHE_CONTENT_EXPIRE=3600 # 内容缓存 1 小时
REDIS_URL=redis://redis:6379/

# 代理（可选）
PROXY_URI=http://proxy:port

# 访问控制（可选）
ACCESS_KEY=your_secret_key

# Puppeteer
PUPPETEER_WS_ENDPOINT=ws://browserless:3000
```

### 1.4 其他部署选项

| 方案 | 优点 | 缺点 |
|-----|------|------|
| **Vercel** | 免费、一键部署 | 无 Puppeteer、有限制 |
| **Cloudflare Workers** | 边缘部署、全球加速 | 需 Workers Paid（3MB 限制） |
| **Fly.io** | 灵活、支持 Upstash Redis | 免费额度有限 |
| **Zeabur** | 中文友好、一键部署 | 付费 |
| **Kubernetes (Helm)** | 企业级、HA 支持 | 复杂 |

---

## 2. Twitter/X 订阅方案

### 2.1 RSSHub Twitter 路由现状

**官方支持的路由：**
- `/twitter/user/:id` - 用户推文
- `/twitter/following/:id` - 用户关注
- `/twitter/likes/:id` - 用户点赞
- `/twitter/list/:id/:name` - 列表推文
- `/twitter/search/:keyword` - 搜索结果
- `/twitter/trends` - 热门趋势

**⚠️ 重要限制：**
Twitter/X 已大幅限制 API 访问，RSSHub 的 Twitter 路由需要：

1. **账号登录凭据**（推荐使用非重要账号）
2. 新账号或异地登录可能被限制

### 2.2 所需配置

```bash
# 必需
TWITTER_USERNAME=your_username
TWITTER_PASSWORD=your_password

# 可选
TWITTER_PHONE_OR_EMAIL=your_phone_or_email

# 双因素认证（如启用）
TWITTER_AUTHENTICATION_SECRET=xxxxxxxxxxxxxxxx
```

**Cookie 获取方式：**
1. 登录 Twitter 网页版
2. 打开开发者工具 → Network
3. 找到请求头中的 Cookie
4. 提取 `auth_token` 和 `ct0` 值

### 2.3 替代方案

#### 方案 A: Nitter（开源 Twitter 前端）

**优点：**
- 无需 JavaScript
- 内置 RSS 支持
- 隐私保护

**缺点：**
- ⚠️ **2024 年后需要真实账号的 session token**
- 公共实例不稳定
- Twitter 持续封禁

**部署方式：**
```bash
docker run -v $(pwd)/nitter.conf:/src/nitter.conf \
  -d --network host zedeus/nitter:latest
```

**Session Token 获取：**
参考 [Creating session tokens](https://github.com/zedeus/nitter/wiki/Creating-session-tokens)

#### 方案 B: Twitter API v2（付费）

| 套餐 | 价格 | 推文读取量 |
|-----|------|-----------|
| Free | $0 | 极少（仅写入） |
| Basic | $100/月 | 10,000/月 |
| Pro | $5,000/月 | 1,000,000/月 |

**结论：** 成本过高，不推荐

#### 方案 C: 第三方服务

| 服务 | 可靠性 | 成本 |
|-----|--------|------|
| **RSS.app** | ⭐⭐⭐ | 付费 |
| **FetchRSS** | ⭐⭐ | 免费/付费 |
| **Feedity** | ⭐⭐ | 付费 |

### 2.4 推荐方案

**短期（快速上线）：**
1. 使用 RSSHub 自建实例 + 非重要 Twitter 账号
2. 配置代理避免 IP 封禁
3. 监控账号状态，准备备用账号

**长期（稳定运行）：**
1. 自建 Nitter 实例 + 账号池
2. 或评估 RSS.app 等付费服务

---

## 3. Newsletter 转 RSS

### 3.1 Kill the Newsletter 分析

**官网：** https://kill-the-newsletter.com

**工作原理：**
1. 创建一个 Feed → 获得专属邮箱地址 + Atom Feed URL
2. 用该邮箱订阅 Newsletter
3. 收到的邮件自动转为 Feed 条目

**特点：**
- ✅ 免费开源
- ✅ 简单易用
- ❌ 无法回复邮件确认
- ❌ 部分 Newsletter 屏蔽此域名
- ❌ 旧条目会被删除（大小限制）
- ❌ Feed 不可分享（含邮箱标识）

**自建部署：**
```bash
# 参考官方指南
# https://github.com/leafac/kill-the-newsletter
# https://github.com/radically-straightforward/radically-straightforward/blob/main/guides/deployment.md
```

**技术栈：** Node.js + SQLite + 邮件服务器

### 3.2 自建方案调研

#### 方案 A: 邮件转发 + 解析

**架构：**
```
Newsletter → 个人邮箱 → 邮件过滤器 → 转发到处理服务 → RSS Feed
```

**RSSHub 内置支持：**
```bash
# 配置 IMAP 邮箱
EMAIL_CONFIG_xxx_gmail_com="password=xxx&host=imap.gmail.com&port=993"
```

路由：`/mail/imap/:mailbox?`

**优点：**
- 使用现有邮箱
- 可回复确认

**缺点：**
- 需配置邮件过滤规则
- 密码管理复杂

#### 方案 B: 自建 Kill the Newsletter

**所需组件：**
1. 域名 + MX 记录
2. 邮件服务器（Postfix/Haraka）
3. Node.js 应用
4. 数据库存储

**资源需求：**
- VPS: 1GB RAM / 20GB 磁盘
- 域名（用于邮箱地址）

#### 方案 C: 第三方服务

| 服务 | 特点 | 限制 |
|-----|------|------|
| **Kill the Newsletter** | 官方免费 | 大小限制、可能被屏蔽 |
| **Notifier for Newsletters** | Chrome 插件 | 浏览器依赖 |
| **Mailbrew** | 综合服务 | 付费 |
| **Stoop Inbox** | 专用 App | 移动端依赖 |

### 3.3 推荐方案

**轻量级（大多数用户）：**
- 使用 Kill the Newsletter 官方服务
- 或 RSSHub 的邮件路由（需配置）

**企业级（自建）：**
- Fork Kill the Newsletter
- 自建邮件服务器
- 支持多用户和持久存储

---

## 4. Folo 导入器设计

### 4.1 Folo 概述

**Folo**（原 Follow）是新一代 AI 阅读器：
- 开源（AGPL-3.0）
- 多平台（Web/iOS/Android/Desktop）
- 支持分享订阅列表

**官方链接：**
- Web: https://app.folo.is
- GitHub: https://github.com/RSSNext/Folo

### 4.2 分享链接格式分析

**Folo 分享链接格式：**
```
https://app.folo.is/share/lists/{listId}
https://app.folo.is/share/feeds/{feedId}
https://app.folo.is/share/subscriptions/{userId}
```

**可能的数据结构（需进一步验证）：**
```json
{
  "listId": "xxx",
  "name": "Tech News",
  "description": "...",
  "feeds": [
    {
      "id": "feed-xxx",
      "title": "Hacker News",
      "url": "https://hnrss.org/frontpage",
      "siteUrl": "https://news.ycombinator.com",
      "category": "Tech"
    }
  ]
}
```

### 4.3 爬取/解析方案

**方案 A: 直接 API 调用（推荐）**

```typescript
// Folo 可能的公开 API
interface FoloShareAPI {
  getList(listId: string): Promise<FoloList>;
  getFeeds(userId: string): Promise<FoloFeed[]>;
}

// 实现
async function importFromFolo(shareUrl: string) {
  const listId = extractListId(shareUrl);
  const response = await fetch(`https://api.folo.is/lists/${listId}`);
  return response.json();
}
```

**方案 B: 页面解析（备选）**

```typescript
// 使用 Puppeteer 抓取页面
async function scrapeFoloPage(url: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);
  
  // 等待数据加载
  await page.waitForSelector('[data-feeds]');
  
  // 提取数据
  const feeds = await page.evaluate(() => {
    // 解析 DOM 或内嵌 JSON
  });
  
  return feeds;
}
```

**方案 C: OPML 导出**

Folo 可能支持 OPML 导出，可直接使用：

```typescript
// 如果支持 OPML
const opmlUrl = `https://app.folo.is/export/opml/${listId}`;
const opml = await fetch(opmlUrl).then(r => r.text());
const feeds = parseOPML(opml);
```

### 4.4 FeedGlow 导入器 API 设计

**端点设计：**

```typescript
// POST /api/import/folo
interface FoloImportRequest {
  shareUrl: string;      // Folo 分享链接
  targetGroupId?: string; // 目标分组
  skipDuplicates?: boolean;
}

interface FoloImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  feeds: ImportedFeed[];
  errors?: string[];
}
```

**实现流程：**

```typescript
// services/import/folo.ts
export class FoloImporter {
  async import(shareUrl: string): Promise<FoloList> {
    // 1. 解析链接类型
    const linkType = this.parseLinkType(shareUrl);
    
    // 2. 获取数据
    const data = await this.fetchData(shareUrl, linkType);
    
    // 3. 转换格式
    const feeds = this.normalizeFeeds(data);
    
    // 4. 验证 Feed 可用性
    const validFeeds = await this.validateFeeds(feeds);
    
    return validFeeds;
  }
  
  private parseLinkType(url: string): 'list' | 'feed' | 'user' {
    if (url.includes('/share/lists/')) return 'list';
    if (url.includes('/share/feeds/')) return 'feed';
    return 'user';
  }
}
```

**数据模型：**

```typescript
interface FoloFeed {
  id: string;
  title: string;
  url: string;         // RSS/Atom URL
  siteUrl?: string;    // 网站主页
  description?: string;
  category?: string;
  icon?: string;
}

interface FoloList {
  id: string;
  name: string;
  description?: string;
  author?: {
    name: string;
    avatar?: string;
  };
  feeds: FoloFeed[];
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 5. 实施计划

### Phase 1: RSSHub 集成（1-2 周）

1. [ ] 部署 RSSHub Docker 实例
2. [ ] 配置 Redis 缓存
3. [ ] 测试基础路由
4. [ ] 实现 RSSHub 路由代理

### Phase 2: Twitter 订阅（2-3 周）

1. [ ] 配置 Twitter 账号凭据
2. [ ] 测试 RSSHub Twitter 路由
3. [ ] 实现账号池管理
4. [ ] 评估 Nitter 作为备选

### Phase 3: Newsletter 支持（1-2 周）

1. [ ] 集成 Kill the Newsletter
2. [ ] 或实现邮件转发方案
3. [ ] 用户邮箱绑定功能

### Phase 4: Folo 导入器（1-2 周）

1. [ ] 分析 Folo API
2. [ ] 实现导入器服务
3. [ ] 添加批量导入 UI

---

## 6. 资源需求总结

| 组件 | 内存 | 磁盘 | 月成本估算 |
|-----|------|------|-----------|
| RSSHub + Redis | 1GB | 5GB | $5-10 |
| Browserless（可选）| 1GB | 2GB | +$5 |
| Nitter（可选）| 512MB | 2GB | +$5 |
| Newsletter 服务（可选）| 512MB | 10GB | +$5 |

**最小推荐配置：** 2GB RAM / 20GB 磁盘 / ~$15/月

---

## 7. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|-----|--------|------|---------|
| Twitter 账号被封 | 高 | 高 | 账号池、轮换 IP |
| Folo API 变更 | 中 | 中 | 版本监控、适配层 |
| Newsletter 被屏蔽 | 中 | 低 | 多邮箱方案 |
| RSSHub 路由失效 | 低 | 中 | 监控 + 自动告警 |

---

## 附录

### A. 参考链接

- [RSSHub 文档](https://docs.rsshub.app)
- [RSSHub GitHub](https://github.com/DIYgod/RSSHub)
- [Nitter GitHub](https://github.com/zedeus/nitter)
- [Kill the Newsletter](https://kill-the-newsletter.com)
- [Folo GitHub](https://github.com/RSSNext/Folo)

### B. 相关配置示例

```yaml
# docker-compose.yml (完整版)
services:
  rsshub:
    image: diygod/rsshub:chromium-bundled
    restart: always
    ports:
      - '1200:1200'
    environment:
      NODE_ENV: production
      CACHE_TYPE: redis
      REDIS_URL: 'redis://redis:6379/'
      TWITTER_USERNAME: ${TWITTER_USERNAME}
      TWITTER_PASSWORD: ${TWITTER_PASSWORD}
      ACCESS_KEY: ${RSSHUB_ACCESS_KEY}
    depends_on:
      - redis

  redis:
    image: redis:alpine
    restart: always
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```
