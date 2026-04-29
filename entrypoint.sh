#!/bin/sh
set -e

echo "🚀 Starting Next.js server in standalone mode..."

# Start Qonto auto-sync in background (every 6 hours)
if [ -f ./cron-sync.sh ]; then
    sh ./cron-sync.sh &
    echo "🔄 Auto-sync scheduler started in background"
fi

exec node server.js
