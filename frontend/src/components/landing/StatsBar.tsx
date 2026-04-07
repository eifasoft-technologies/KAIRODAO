'use client';

import { motion } from 'framer-motion';
import { AnimatedCounter } from '@/components/ui';
import { useGlobalStats } from '@/hooks/useGlobalStats';
import { useKairoPrice } from '@/hooks/useKairoPrice';
import { formatPrice } from '@/lib/utils';
import {
  CurrencyDollarIcon,
  BanknotesIcon,
  FireIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const iconGradients = [
  'from-primary-100 to-primary-50 text-primary-600',
  'from-success-100 to-success-50 text-success-600',
  'from-danger-100 to-danger-50 text-danger-600',
  'from-secondary-100 to-secondary-50 text-secondary-600',
];

const icons = [CurrencyDollarIcon, BanknotesIcon, FireIcon, ChartBarIcon];

const stats = [
  { key: 'price', label: 'KAIRO Price', prefix: '$' },
  { key: 'tvl', label: 'Pool Liquidity', prefix: '$' },
  { key: 'totalBurned', label: 'Total Burned', suffix: ' KAIRO' },
  { key: 'supply', label: 'Total Supply', suffix: ' KAIRO' },
];

export function StatsBar() {
  const { tvlFormatted, totalBurnedFormatted, totalSupplyFormatted } = useGlobalStats();
  const { price } = useKairoPrice();

  const values: Record<string, number> = {
    price,
    tvl: Number(tvlFormatted),
    totalBurned: Number(totalBurnedFormatted),
    supply: Number(totalSupplyFormatted),
  };

  return (
    <section className="py-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-6xl mx-auto px-4">
        {stats.map((stat, i) => {
          const Icon = icons[i];
          return (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="card p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${iconGradients[i]} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-surface-500 text-xs font-medium">{stat.label}</p>
              </div>
              {stat.key === 'price' ? (
                <span className="text-xl md:text-2xl font-mono font-bold text-surface-900">
                  ${formatPrice(values[stat.key] || 0)}
                </span>
              ) : (
                <AnimatedCounter
                  value={values[stat.key] || 0}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  decimals={stat.key === 'tvl' ? 2 : 0}
                  compact
                  className="text-xl md:text-2xl font-mono font-bold text-surface-900"
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
