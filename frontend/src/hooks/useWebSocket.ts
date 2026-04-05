'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useGlobalStore } from '@/stores/useGlobalStore';

// ============ WS Message Types ============
export type WSMessage =
  | { type: 'price_update'; data: { price: string; change24h: string } }
  | { type: 'compound_event'; data: { user: string; stakeId: number; profit: string; newAmount: string } }
  | { type: 'orderbook_update'; data: { side: 'buy' | 'sell'; order: Record<string, unknown> } }
  | { type: 'trade_executed'; data: { buyer: string; seller: string; amount: string; price: string } }
  | { type: 'stake_created'; data: { user: string; amount: string; tier: number } }
  | { type: 'global_stats'; data: { tvl: string; totalStakers: number; totalBurned: string } };

export type WSConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
export type WSSubscriber = (msg: WSMessage) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const subscribersRef = useRef<Set<WSSubscriber>>(new Set());
  const [connectionState, setConnectionState] = useState<WSConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const updateGlobalStats = useGlobalStore((s) => s.updateGlobalStats);

  const getReconnectDelay = useCallback(() => {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
    return delay;
  }, []);

  const notifySubscribers = useCallback((msg: WSMessage) => {
    subscribersRef.current.forEach((sub) => {
      try { sub(msg); } catch (e) { console.error('[WS] Subscriber error:', e); }
    });
  }, []);

  const handleMessage = useCallback((msg: WSMessage) => {
    setLastMessage(msg);
    notifySubscribers(msg);

    switch (msg.type) {
      case 'price_update':
        updateGlobalStats({ kairoPrice: parseFloat(msg.data.price) || 0 });
        break;
      case 'global_stats':
        updateGlobalStats({
          totalTVL: parseFloat(msg.data.tvl) || 0,
          totalBurned: parseFloat(msg.data.totalBurned) || 0,
        });
        break;
      default:
        break;
    }
  }, [updateGlobalStats, notifySubscribers]);

  const connect = useCallback(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) return;

    // Clean up existing
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WSMessage;
          handleMessage(parsed);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        const delay = getReconnectDelay();
        reconnectAttemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        setConnectionState('error');
        ws.close();
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      setConnectionState('error');
      const delay = getReconnectDelay();
      reconnectAttemptRef.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    }
  }, [handleMessage, getReconnectDelay]);

  const sendMessage = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((callback: WSSubscriber) => {
    subscribersRef.current.add(callback);
    return () => { subscribersRef.current.delete(callback); };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected: connectionState === 'connected',
    connectionState,
    lastMessage,
    sendMessage,
    subscribe,
  };
}
