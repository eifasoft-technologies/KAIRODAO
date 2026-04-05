'use client';

import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline';

const WEEKLY_TARGET = 50_000;
const MONTHLY_TARGET = 500_000;

export function QualifierPools() {
  // These are frontend constants since the contract uses RANK_UPDATER_ROLE for batch updates
  const pools = [
    {
      label: 'Weekly Qualifier Pool',
      target: WEEKLY_TARGET,
      source: '10% of Global Staking Vesting',
      icon: CalendarDaysIcon,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Monthly Qualifier Pool',
      target: MONTHLY_TARGET,
      source: '10% of Global Staking Vesting',
      icon: ClockIcon,
      color: 'text-pink-400',
      bgColor: 'bg-pink-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {pools.map((pool) => {
        const Icon = pool.icon;
        return (
          <div key={pool.label} className="glass rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${pool.bgColor} ${pool.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-dark-100">{pool.label}</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Target Pool</span>
                <span className="text-dark-100 font-mono font-semibold">
                  ${pool.target.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-dark-500">Source</span>
                <span className="text-dark-300">{pool.source}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
