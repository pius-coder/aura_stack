import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    ENV?: { VITE_AURA_WS_URL?: string; NEXT_PUBLIC_AURA_WS_URL?: string };
  }
}

export interface UseAuraRoomOptions {
  room: string;
  onEvent?: (event: string, data: unknown) => void;
  enabled?: boolean;
}

export interface AuraRoomEvent {
  type: string;
  room: string;
  data?: unknown;
}

const WS_RECONNECT_DELAY_MS = 3000;

function resolveWsUrl(): string {
  if (typeof window === "undefined") return "";
  const envUrl = window.ENV?.VITE_AURA_WS_URL ?? window.ENV?.NEXT_PUBLIC_AURA_WS_URL;
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = "3001";
  return `${protocol}//${window.location.hostname}:${port}/ws`;
}

export function useAuraRoom(options: UseAuraRoomOptions) {
  const { room, enabled = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<AuraRoomEvent | null>(null);
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;

  const connect = useCallback(() => {
    if (!enabled || !room) return;

    const url = resolveWsUrl();
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "JOIN", room }));
    };

    ws.onmessage = (event) => {
      try {
        const parsed: AuraRoomEvent = JSON.parse(event.data);
        setLastEvent(parsed);
        onEventRef.current?.(parsed.type, parsed.data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectRef.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [room, enabled]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "LEAVE", room }));
        wsRef.current.close();
      }
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect, room]);

  const send = useCallback(
    (type: string, data?: unknown) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type, data }));
      }
    },
    [],
  );

  return { connected, lastEvent, send };
}
