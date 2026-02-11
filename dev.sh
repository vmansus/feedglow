#!/bin/bash
# FeedGlow Local Development Server
# Usage: ./dev.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# ====== Configuration ======
export DATABASE_URL="postgres://localhost:5432/feedglow"
export JWT_SECRET="fg_dev_secret_local"
export PORT="3001"
export NEXT_PUBLIC_API_URL="http://localhost:3001"
export REGISTRATION_MODE="open"
# ============================

# PostgreSQL PATH (Homebrew)
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

# Kill any existing processes on our ports
for port in $PORT 3000; do
  pid=$(lsof -ti:$port 2>/dev/null) && kill -9 $pid 2>/dev/null && echo "Killed old process on port $port"
done

echo "🔥 FeedGlow Dev Server Starting..."
echo "   DB: $DATABASE_URL"
echo "   API: http://localhost:$PORT"
echo "   Web: http://localhost:3000"
echo ""

# Ensure PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
  echo "📦 Starting PostgreSQL..."
  brew services start postgresql@17
  sleep 2
fi

# Create database if not exists
createdb feedglow 2>/dev/null || true

# Build API
echo "📦 Building API..."
cd "$REPO_DIR/apps/api"
pnpm tsup src/index.ts --format esm --silent --external playwright-extra --external puppeteer-extra-plugin-stealth

# Start API (background)
echo "🚀 Starting API..."
node dist/index.js &
API_PID=$!

# Start Web (unset PORT so Next.js uses default 3000)
echo "🚀 Starting Web..."
cd "$REPO_DIR/apps/web"
PORT=3000 npx next dev &
WEB_PID=$!

echo ""
echo "✅ All running! API(pid:$API_PID) Web(pid:$WEB_PID)"
echo "   Press Ctrl+C to stop all"

# Kill both processes on Ctrl+C
trap "echo ''; echo '🛑 Stopping...'; kill $API_PID $WEB_PID 2>/dev/null; exit 0" INT TERM

# Wait
wait
