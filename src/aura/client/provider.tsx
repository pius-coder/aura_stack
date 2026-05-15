"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import {
  configureAuraClient,
  type AuraClientConfig,
  fetchAuraManifest,
} from "./transport";
import type { AuraClientManifest } from "@/aura/shared/manifest";
import {
  setManifestEntities,
  getOperationEntities,
  getManifestEntities,
} from "./manifest-cache";

function manifestToEntityMap(
  manifest: AuraClientManifest,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const op of manifest.operations) {
    map[op.name] = [...op.entities];
  }
  return map;
}

// ─── Realtime Context ─────────────────────────────────────────────────────────

interface AuraRealtimeContextValue {
  broadcast: (keys: string[]) => void;
}

const AuraRealtimeContext = createContext<AuraRealtimeContextValue>({
  broadcast: () => {},
});

export function useAuraBroadcast(): (keys: string[]) => void {
  return useContext(AuraRealtimeContext).broadcast;
}

// ─── Realtime Provider ────────────────────────────────────────────────────────

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const CHANNEL_NAME = "aura:realtime";
const DEDUP_WINDOW_MS = 2_000;
const LEADER_LOCK_NAME = "aura:ws-leader";

type ChannelMessage = {
  id: string;
  keys: string[];
  /** Set by non-leader tabs asking the leader to relay through the WS. */
  __auraRelayRequest?: boolean;
};

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/** True when the browser supports the Web Locks API (Chrome/Safari/Firefox). */
function hasWebLocks(): boolean {
  return typeof navigator !== "undefined" && "locks" in navigator;
}

function AuraRealtimeProvider({
  children,
  wsUrl,
}: {
  children: ReactNode;
  /** Optional WebSocket URL. When undefined, only the same-browser
   *  BroadcastChannel layer runs — fast, free, no network hop. */
  wsUrl?: string;
}) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const seenIdsRef = useRef<Map<string, number>>(new Map());
  const isLeaderRef = useRef(false);
  const releaseLeaderRef = useRef<(() => void) | null>(null);

  function invalidateKeys(keys: string[]) {
    const matched: string[] = [];
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryName = query.queryKey[1] as string;
        const metaEntities = (query.meta?.entities as string[]) || [];
        const manifestEntities = getOperationEntities(queryName);
        const queryEntities = [
          ...new Set([...metaEntities, ...manifestEntities]),
        ];
        const ok = keys.some(
          (k) => k === queryName || queryEntities.includes(k),
        );
        if (ok) matched.push(queryName);
        return ok;
      },
    });
    if (matched.length > 0) {
      console.log("[aura:invalidate] invalidated", matched, "from", keys);
    }
  }

  function isDuplicate(id: string): boolean {
    const now = Date.now();
    for (const [k, ts] of seenIdsRef.current) {
      if (now - ts > DEDUP_WINDOW_MS) seenIdsRef.current.delete(k);
    }
    if (seenIdsRef.current.has(id)) return true;
    seenIdsRef.current.set(id, now);
    return false;
  }

  /** Relay a message to every sibling tab of this browser. */
  function fanoutToTabs(id: string, keys: string[]): void {
    try {
      channelRef.current?.postMessage({ id, keys } as ChannelMessage);
    } catch {
      /* channel closed */
    }
  }

  /** Send a payload over the WebSocket. No-op if not the leader or not open. */
  function sendOverWs(id: string, keys: string[]): void {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: "INVALIDATE", id, keys }));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    unmountedRef.current = false;

    // ── BroadcastChannel for cross-tab on this browser ──────────────────────
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const msg = event.data as ChannelMessage | null;
      if (!msg || !msg.id || !Array.isArray(msg.keys)) return;

      // Non-leader tabs ask the leader to relay via WS.
      if (msg.__auraRelayRequest) {
        if (isLeaderRef.current) sendOverWs(msg.id, msg.keys);
        return;
      }

      if (isDuplicate(msg.id)) return;
      invalidateKeys(msg.keys);
    };

    // ── WebSocket (leader only, only when wsUrl provided) ──────────────────
    function connectWs() {
      if (unmountedRef.current) return;
      if (!isLeaderRef.current) return;
      if (!wsUrl) return; // no WS configured — BroadcastChannel only

      console.log("[aura:realtime] (leader) connecting to", wsUrl);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        console.log("[aura:realtime] (leader) WS connected");
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            id: string;
            keys: string[];
          };
          if (msg.type !== "INVALIDATE" || !Array.isArray(msg.keys)) return;
          if (isDuplicate(msg.id)) return;
          // Leader invalidates locally…
          invalidateKeys(msg.keys);
          // …and hands the message off to sibling tabs of this browser.
          fanoutToTabs(msg.id, msg.keys);
        } catch {
          /* malformed */
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        if (!isLeaderRef.current) return;
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current,
          RECONNECT_MAX_MS,
        );
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connectWs, delay);
      };

      ws.onerror = () => ws.close();
    }

    function bootManifestAndConnect() {
      const hasCachedData = Object.keys(getManifestEntities()).length > 0;
      if (hasCachedData) {
        connectWs();
        return;
      }
      fetchAuraManifest<AuraClientManifest>()
        .then((data) => {
          const map: Record<string, string[]> = {};
          for (const op of data.operations) {
            map[op.name] = op.entities;
          }
          setManifestEntities(map);
        })
        .catch(() => {
          /* keep going even if manifest fetch fails */
        })
        .finally(connectWs);
    }

    // ── Leader election via Web Locks ───────────────────────────────────────
    let leaderReleased = false;

    if (hasWebLocks()) {
      navigator.locks
        .request(LEADER_LOCK_NAME, { mode: "exclusive" }, (lock) => {
          if (unmountedRef.current || !lock) return;
          isLeaderRef.current = true;
          console.log("[aura:realtime] elected WS leader for this browser");
          bootManifestAndConnect();
          // Hold the lock until unmount / tab close.
          return new Promise<void>((resolve) => {
            releaseLeaderRef.current = () => {
              if (leaderReleased) return;
              leaderReleased = true;
              resolve();
            };
          });
        })
        .catch(() => {
          /* another tab holds the lock — stay silent, listen via channel */
        });
    } else {
      // Fallback for browsers without Web Locks: per-tab WS.
      isLeaderRef.current = true;
      bootManifestAndConnect();
    }

    return () => {
      unmountedRef.current = true;
      channel.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      const ws = socketRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        socketRef.current = null;
      }

      isLeaderRef.current = false;
      releaseLeaderRef.current?.();
      releaseLeaderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl, queryClient]);

  // ── broadcast() called locally by mutations ──────────────────────────────
  //
  //  • Siblings tabs: via BroadcastChannel (free, instant).
  //  • Network: leader sends over WS; non-leader asks the leader to relay.
  const broadcast = (keys: string[]) => {
    const id = generateId();
    isDuplicate(id);

    channelRef.current?.postMessage({ id, keys } as ChannelMessage);

    if (isLeaderRef.current) {
      sendOverWs(id, keys);
    } else {
      try {
        channelRef.current?.postMessage({
          id,
          keys,
          __auraRelayRequest: true,
        } as ChannelMessage);
      } catch {
        /* channel closed */
      }
    }
  };

  return (
    <AuraRealtimeContext.Provider value={{ broadcast }}>
      {children}
    </AuraRealtimeContext.Provider>
  );
}

// ─── Main Provider (signature unchanged) ────────────────────────────────────

export interface AuraClientProviderProps {
  children: ReactNode;
  config?: Partial<AuraClientConfig>;
  queryClient?: QueryClient;
  /** Optional — broadcast server URL. Falls back to NEXT_PUBLIC_AURA_WS_URL. */
  wsUrl?: string;
  /**
   * Operation manifest serialized on the server. When provided, the client
   * seeds its entity cache synchronously before the first render — removing
   * the race that made cross-operation invalidation silently incomplete on
   * initial mount.
   */
  initialManifest?: AuraClientManifest;
}

export function AuraClientProvider({
  children,
  config,
  queryClient,
  wsUrl,
  initialManifest,
}: AuraClientProviderProps) {
  if (config) configureAuraClient(config);

  if (initialManifest) {
    setManifestEntities(manifestToEntityMap(initialManifest));
  }

  const [ownedQueryClient] = useState(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: {
          queries: {
            // staleTime: 0 → invalidated queries refetch immediately when the
            // broadcast arrives. Without this, an invalidation on a "fresh"
            // query is a no-op until staleTime elapses.
            staleTime: 0,
            // Keep cache around for 5 min to avoid refetching on every navigation.
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
          mutations: { retry: false },
        },
      }),
  );

  const resolvedWsUrl = wsUrl ?? import.meta.env.VITE_AURA_WS_URL;

  return (
    <QueryClientProvider client={ownedQueryClient}>
      <NuqsAdapter>
        {/* Always mount the realtime provider so BroadcastChannel works
            cross-tab on the same browser, even without a WebSocket. */}
        <AuraRealtimeProvider wsUrl={resolvedWsUrl}>
          {children}
        </AuraRealtimeProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
