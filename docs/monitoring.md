# Monitoring Vibe

## Health endpoint
`GET /health` — returns DB status + latency.

## Key metrics to track
- WhatsApp messages processed/min (WhatsappInbox.processedAt count)
- Agent response latency (AuraAIUsage.latencyMs p95)
- Matching latency (MatchSession.latencyMs p95)
- Outbox queue depth (WhatsappOutbox WHERE status=PENDING)
- Error rate (WhatsappOutbox WHERE status=FAILED)
- Token consumption (AuraAIUsage daily aggregates)

## Alerts
- Outbox queue > 100 pending messages
- Agent latency p95 > 10s
- Evolution API state != "open"
- Daily token cost > threshold

## Backup
Daily pg_dump of all tables. See `scripts/backup-pg.sh`.
