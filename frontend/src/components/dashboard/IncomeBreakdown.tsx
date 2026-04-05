'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import {
  CurrencyDollarIcon,
  UserGroupIcon,
  TrophyIcon,
  CalendarDaysIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { CONTRACTS, AffiliateDistributorABI } from '@/lib/contracts';

interface IncomeBreakdownProps {
  direct: number;
  team: number;
  rank: number;
  qWeekly: number;
  qMonthly: number;
  className?: string;
  showHarvest?: boolean;
}

const incomeTypes = [
  { key: 'direct', label: 'Direct Referral', icon: CurrencyDollarIcon, color: 'text-primary-400', incomeType: 0 },
  { key: 'team', label: 'Team Dividends', icon: UserGroupIcon, color: 'text-accent-400', incomeType: 1 },
  { key: 'rank', label: 'Rank Salary', icon: TrophyIcon, color: 'text-yellow-400', incomeType: 2 },
  { key: 'qWeekly', label: 'Weekly Qualifier', icon: CalendarDaysIcon, color: 'text-purple-400', incomeType: 3 },
  { key: 'qMonthly', label: 'Monthly Qualifier', icon: ClockIcon, color: 'text-pink-400', incomeType: 4 },
] as const;

const MIN_HARVEST = 10; // $10 minimum

export function IncomeBreakdown({ direct, team, rank, qWeekly, qMonthly, className = '', showHarvest = false }: IncomeBreakdownProps) {
  const values: Record<string, number> = { direct, team, rank, qWeekly, qMonthly };
  const total = direct + team + rank + qWeekly + qMonthly;

  const [harvestingType, setHarvestingType] = useState<number | null>(null);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const isHarvesting = isPending || isConfirming;

  const handleHarvest = (incomeType: number) => {
    setHarvestingType(incomeType);
    writeContract({
      address: CONTRACTS.AFFILIATE_DISTRIBUTOR,
      abi: AffiliateDistributorABI,
      functionName: 'harvest',
      args: [incomeType],
    });
  };

  const handleHarvestAll = () => {
    // Harvest the first eligible type; user can click again for next
    const eligible = incomeTypes.find((t) => values[t.key] >= MIN_HARVEST);
    if (eligible) handleHarvest(eligible.incomeType);
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {incomeTypes.map((t) => {
          const val = values[t.key];
          const Icon = t.icon;
          const pct = total > 0 ? (val / total) * 100 : 0;
          const canHarvest = showHarvest && val >= MIN_HARVEST;
          return (
            <div key={t.key} className="flex items-center gap-3">
              <div className={`p-1.5 rounded-lg bg-dark-900/60 ${t.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-dark-400">{t.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-dark-100">
                      ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {canHarvest && (
                      <button
                        onClick={() => handleHarvest(t.incomeType)}
                        disabled={isHarvesting}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors disabled:opacity-50"
                      >
                        {isHarvesting && harvestingType === t.incomeType ? '...' : 'Harvest'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-full h-1 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${t.color.replace('text-', 'bg-')}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-dark-700/50 flex items-center justify-between">
        <span className="text-sm font-medium text-dark-300">Total Harvestable</span>
        <span className="text-lg font-bold font-mono text-primary-400">
          ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      {showHarvest && total >= MIN_HARVEST && (
        <button
          onClick={handleHarvestAll}
          disabled={isHarvesting}
          className="w-full mt-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isHarvesting ? 'Harvesting...' : 'Harvest All'}
        </button>
      )}
    </div>
  );
}
