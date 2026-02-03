#!/bin/bash
# Auto-deploy script for FeedGlow
# Checks for updates and deploys if changes found

cd ~/feedglow

# Fetch latest
git fetch origin develop 2>/dev/null

# Check if there are changes
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/develop)

if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0  # No changes
fi

echo "[$(date)] Changes detected, deploying..."

# Pull changes
git pull origin develop

# Install deps if needed
pnpm install --frozen-lockfile 2>/dev/null || true

# Build
pnpm build --filter=@feedglow/web 2>&1 | tail -5

# Restart
pm2 restart feedglow-web --update-env

echo "[$(date)] Deployed!"
