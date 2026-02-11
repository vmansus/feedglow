# 📧 FeedGlow 邮件订阅

订阅 Newsletter，邮件自动变成 Feed 文章。

## 架构

```
Newsletter 发件方
    ↓ 发邮件到 fg-xxx@mail.your-domain.com
Cloudflare Email Routing (免费)
    ↓ 转发给 Worker
Cloudflare Worker (免费)
    ↓ POST /api/newsletter/inbound
FeedGlow API
    ↓ 解析 + 清理 HTML + 存入数据库
用户在 FeedGlow 里阅读 📖
```

## 部署步骤

### 1. 准备 Cloudflare API Token

1. 打开 <https://dash.cloudflare.com/profile/api-tokens>
2. **Create Token** → 选模板 **"Edit Cloudflare Workers"**
3. 复制 token 备用

### 2. 生成 Webhook Secret

```bash
# 在服务器上执行
openssl rand -hex 32
```

记下这个值，后面要用两次。

### 3. 配置服务器环境变量

编辑 PM2 配置文件 (`ecosystem.config.cjs`)，在 `env` 里加两行：

```js
NEWSLETTER_WEBHOOK_SECRET: "你的webhook-secret",
NEWSLETTER_DOMAIN: "mail.你的域名.com"
```

重启 API：

```bash
pm2 delete feedglow-api
pm2 start ecosystem.config.cjs
pm2 save
```

### 4. 建数据库表

```bash
PGPASSWORD=你的密码 psql -h localhost -U feedglow feedglow -c "
CREATE TABLE IF NOT EXISTS fg_newsletter_addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  feed_id INTEGER NOT NULL REFERENCES fg_feeds(id) ON DELETE CASCADE,
  address VARCHAR(64) NOT NULL UNIQUE,
  sender_filter TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_newsletter_addr ON fg_newsletter_addresses(address);
"
```

> API 启动时也会自动建表，这步可以跳过。

### 5. 部署 Cloudflare Worker

```bash
cd cf-newsletter-worker

# 修改 wrangler.toml 里的 FEEDGLOW_API 为你的域名
# 默认: https://your-domain.com

# 部署
CLOUDFLARE_API_TOKEN="你的cf-token" npx wrangler deploy

# 设置 webhook secret (和第 2 步生成的一样)
echo "你的webhook-secret" | CLOUDFLARE_API_TOKEN="你的cf-token" npx wrangler secret put WEBHOOK_SECRET
```

### 6. 配置 Cloudflare Email Routing

1. 打开 <https://dash.cloudflare.com> → 选择你的域名
2. 左侧 **Email** → **Email Routing**
3. 点 **Enable Email Routing** (CF 会自动添加 MX 记录)
4. 切到 **Routing rules** 标签
5. 设置 **Catch-all** 规则：
   - Action: **Send to a Worker**
   - Destination: **feedglow-newsletter**
6. 保存

> **子域名注意**: 如果用 `mail.feedglow.xxx.com` 而不是主域名，可能需要手动添加 MX 记录：
> 
> | Type | Name | Content | Priority |
> |------|------|---------|----------|
> | MX | mail.feedglow | `route1.mx.cloudflare.net` | 69 |
> | MX | mail.feedglow | `route2.mx.cloudflare.net` | 12 |
> | MX | mail.feedglow | `route3.mx.cloudflare.net` | 47 |

## 使用

1. FeedGlow → Settings → **邮件订阅** tab
2. 点 **新建订阅**，输入名称 (如 "阮一峰科技周刊")
3. 复制生成的邮箱地址 (如 `fg-a7x3k9@mail.your-domain.com`)
4. 去 Newsletter 网站用这个邮箱订阅
5. 收到的邮件自动出现在 Feed 里，用 📧 图标标识

**高级功能**:
- **发件人过滤**: 只接受特定发件人的邮件，防垃圾
- **分类**: 可以把 newsletter 归到指定分类
- **Feed 类型筛选**: Sidebar 顶部类型栏选 "邮件" 只看 newsletter

## 排障

### Worker 没收到邮件
- CF Dashboard → Email Routing → Activity log 查看投递记录
- 确认 MX 记录指向 Cloudflare
- `npx wrangler tail` 看 Worker 实时日志

### 收到了但 FeedGlow 没显示
- 看 Worker 日志: `CLOUDFLARE_API_TOKEN="你的token" npx wrangler tail`
- 看 API 日志: `pm2 logs feedglow-api --lines 20`
- 确认两边的 WEBHOOK_SECRET 一致

### 想更换收件域名
1. 修改 `wrangler.toml` 里的 `FEEDGLOW_API`
2. 修改服务器 `ecosystem.config.cjs` 里的 `NEWSLETTER_DOMAIN`
3. 重新部署: `npx wrangler deploy`
4. 重启 API: `pm2 restart feedglow-api`
5. CF Dashboard 更新 Email Routing 规则

## 成本

全部免费：
- Cloudflare Email Routing: 免费
- Cloudflare Worker: 免费 (每天 10 万次请求)
- 无需额外服务器或第三方服务
