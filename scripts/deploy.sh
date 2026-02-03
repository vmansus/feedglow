#!/bin/bash
# FeedGlow Deploy Script
# Run on production server: ./scripts/deploy.sh

set -e

echo "🚀 FeedGlow Deployment Starting..."

cd ~/feedglow

# Pull latest code
echo "📥 Pulling latest code..."
git fetch origin
git checkout develop
git pull origin develop

# Install pnpm if not exists
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Build shared packages
echo "🔨 Building shared packages..."
pnpm --filter @feedglow/shared build
pnpm --filter @feedglow/ui build

# Build API
echo "🔨 Building API..."
pnpm --filter @feedglow/api build

# Build Web
echo "🔨 Building Web..."
pnpm --filter @feedglow/web build

# Restart services with PM2
echo "🔄 Restarting services..."
if command -v pm2 &> /dev/null; then
    pm2 restart feedglow-api || pm2 start apps/api/dist/index.js --name feedglow-api
    pm2 restart feedglow-web || pm2 start npm --name feedglow-web -- --prefix apps/web start
else
    echo "⚠️  PM2 not installed. Install with: npm install -g pm2"
    echo "Starting services manually..."
    
    # Kill existing processes
    pkill -f "feedglow-api" || true
    pkill -f "next-server" || true
    
    # Start API (background)
    cd apps/api
    MINIFLUX_URL=http://localhost:8080 \
    MINIFLUX_API_KEY=$(grep MINIFLUX_API_KEY ../docker/.env | cut -d= -f2) \
    PORT=3001 \
    nohup node dist/index.js > /tmp/feedglow-api.log 2>&1 &
    
    # Start Web (background)
    cd ../web
    NEXT_PUBLIC_API_URL=http://localhost:3001 \
    PORT=3000 \
    nohup npm start > /tmp/feedglow-web.log 2>&1 &
    
    cd ../..
fi

echo "✅ Deployment complete!"
echo ""
echo "Services:"
echo "  - API:  http://localhost:3001"
echo "  - Web:  http://localhost:3000"
echo "  - Miniflux: http://localhost:8080"
