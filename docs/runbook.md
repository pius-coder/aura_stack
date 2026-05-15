# Runbook Vibe

## Evolution API down
1. Check: `curl -H "apikey: $EVOLUTION_API_KEY" "$EVOLUTION_API_BASE_URL/instance/connectionState/$EVOLUTION_API_INSTANCE_ID"`
2. If state != "open": restart Evolution API container or re-scan QR.
3. Messages queue in WhatsappOutbox and retry automatically (backoff up to 1h).

## Broadcast server down
- Mutations still succeed. Only cross-device realtime sync fails.
- Restart: `bun src/aura/server/broadcast.ts`

## DB migration rollback
- `bunx prisma migrate resolve --rolled-back <migration_name>`
- Then fix schema and re-push.

## OpenRouter rate-limited
- Agent falls back to FALLBACK_RESPONSE.
- Monitor `AuraAIUsage` table for spike detection.
- Consider switching model in agents/whatsapp-bot.agent.ts.

## Fapshi webhook issues
- Verify FAPSHI_WEBHOOK_SECRET matches.
- Check Payment table for stuck PENDING entries.
- Webhook is idempotent — safe to replay.
