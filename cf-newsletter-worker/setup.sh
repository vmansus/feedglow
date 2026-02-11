#!/bin/bash
# ================================================
# FeedGlow 邮件订阅 - Cloudflare Worker 一键部署
# ================================================
#
# 使用方法:
#   chmod +x setup.sh && ./setup.sh
#
# 前提条件:
#   - 已安装 Node.js
#   - 域名在 Cloudflare (your-domain.com)
#   - Cloudflare 账号已登录 (wrangler 会引导登录)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBHOOK_SECRET="7b6b7b9e9704a668e78167df6dc8da6d0cd303701e207e6b88f69484d996faa8"

echo ""
echo "📧 FeedGlow Newsletter Worker 部署"
echo "=================================="
echo ""

# Step 1: Check wrangler
if ! command -v wrangler &> /dev/null; then
    echo "📦 安装 wrangler..."
    npm install -g wrangler
fi

# Step 2: Deploy worker
echo "🚀 部署 Worker 到 Cloudflare..."
cd "$SCRIPT_DIR"
wrangler deploy

# Step 3: Set webhook secret
echo ""
echo "🔑 设置 Webhook Secret..."
echo "$WEBHOOK_SECRET" | wrangler secret put WEBHOOK_SECRET

echo ""
echo "✅ Worker 部署完成！"
echo ""
echo "================================================"
echo "⚠️  还需要在 Cloudflare Dashboard 手动操作："
echo "================================================"
echo ""
echo "1. 打开: https://dash.cloudflare.com"
echo "2. 选择域名: your-domain.com (或 your-domain.com)"
echo "3. 左侧菜单 → Email → Email Routing"
echo "4. 点击 'Enable Email Routing' (如果还没启用)"
echo "5. 到 'Routing rules' 标签页"
echo "6. 添加 Catch-all 规则:"
echo "   - Action: 'Send to a Worker'"
echo "   - Worker: 'feedglow-newsletter'"
echo ""
echo "完成后，在 FeedGlow Settings → 邮件订阅 创建地址即可！"
echo ""
