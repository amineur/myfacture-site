#!/bin/sh
# Qonto sync cron - runs every hour between 8h and 19h (Paris time)
# Called from entrypoint.sh in background

SYNC_URL="http://localhost:3000/api/sync/qonto"
INTERVAL=300  # Check every 5 minutes, but only sync during business hours

# Wait for server to be ready
sleep 30

echo "🔄 Qonto auto-sync started (hourly 8h-19h Europe/Paris)"

LAST_SYNC_HOUR=-1

while true; do
    # Get current hour in Paris timezone
    CURRENT_HOUR=$(TZ="Europe/Paris" date +%H | sed 's/^0//')
    CURRENT_MIN=$(TZ="Europe/Paris" date +%M | sed 's/^0//')

    # Only sync between 8h and 19h, once per hour (at the top of the hour, within first 5 min)
    if [ "$CURRENT_HOUR" -ge 8 ] && [ "$CURRENT_HOUR" -le 19 ] && [ "$CURRENT_HOUR" -ne "$LAST_SYNC_HOUR" ] && [ "$CURRENT_MIN" -lt 5 ]; then
        echo "🔄 [$(TZ='Europe/Paris' date)] Running Qonto sync (hour: ${CURRENT_HOUR}h)..."

        wget -q -O /dev/null "$SYNC_URL" 2>&1
        RESULT=$?

        if [ $RESULT -eq 0 ]; then
            echo "✅ [$(TZ='Europe/Paris' date)] Qonto sync completed"
        else
            echo "❌ [$(TZ='Europe/Paris' date)] Qonto sync failed (exit code: $RESULT)"
        fi

        LAST_SYNC_HOUR=$CURRENT_HOUR
    fi

    sleep $INTERVAL
done
