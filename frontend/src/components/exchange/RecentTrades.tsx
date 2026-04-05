'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWS } from '@/providers/WebSocketProvider';
import type { WSMessage } from '@/hooks/useWebSocket';

interface Trade {
  time: string;
  price: number;
  amount: number;
  type: 'buy' | 'sell';
}

export function RecentTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const { subscribe } = useWS();

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'trade_executed') {
      const newTrade: Trade = {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        price: parseFloat(msg.data.price) || 0,
        amount: parseFloat(msg.data.amount) || 0,
        type: parseFloat(msg.data.amount) > 0 ? 'buy' : 'sell',
      };
      setTrades((prev) => [newTrade, ...prev.slice(0, 49)]);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribe(handleMessage);
    return unsub;
  }, [subscribe, handleMessage]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="grid grid-cols-3 text-xs text-dark-500 mb-2 px-1">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Amount</span>
      </div>

      {/* Trades */}
      <div className="flex-1 space-y-px overflow-y-auto">
        {trades.length === 0 ? (
          <p className="text-xs text-dark-500 text-center py-6">Waiting for trades...</p>
        ) : (
          trades.map((trade, i) => (
            <div key={`trade-${i}`} className="grid grid-cols-3 text-xs py-1 px-1 hover:bg-dark-700/30 transition-colors">
              <span className="text-dark-400 font-mono">{trade.time}</span>
              <span className={`text-right font-mono ${trade.type === 'buy' ? 'text-primary-400' : 'text-red-400'}`}>
                {trade.price.toFixed(4)}
              </span>
              <span className="text-right text-dark-300 font-mono">{trade.amount.toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
