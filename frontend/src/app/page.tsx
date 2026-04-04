'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useKairoPrice } from '@/hooks/useKairoPrice';
import { useReferral } from '@/hooks/useReferral';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

/* ────────── animation helpers ────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ────────── countdown logic ────────── */
const CMS_DEADLINE = 1777766400; // May 1 2026 UTC-ish (adjusted)

function useCountdown(target: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(target - now, 0);
  return {
    days: Math.floor(diff / 86400),
    hours: Math.floor((diff % 86400) / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
  };
}

/* ────────── animated counter ────────── */
function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1500;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, value]);

  return (
    <span ref={ref} className="font-mono">
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
}

/* ─────────────── TOKENOMICS DATA ─────────────── */
const tokenomicsData = [
  { name: 'Social Lock', value: 10000, color: '#22c55e' },
  { name: 'CMS Rewards', value: 50000, color: '#3b82f6' },
  { name: 'Staking Emissions', value: 300000, color: '#8b5cf6' },
  { name: 'Burned', value: 5000, color: '#ef4444' },
];

/* ─────────────── STEPS ─────────────── */
const steps = [
  {
    num: 1,
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm-3.375 4.5a3 3 0 016 0H7.125z" />
      </svg>
    ),
    title: 'Subscribe to CMS',
    desc: 'Pay 10 USDT per subscription and earn 5 KAIRO loyalty rewards. Up to 10,000 total slots available.',
  },
  {
    num: 2,
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    title: 'Stake USDT',
    desc: 'Stake USDT and earn 0.1% compound interest per interval. Returns are capped at 3X your original stake.',
  },
  {
    num: 3,
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    title: 'Build Your Team',
    desc: 'Earn up to 15-level referral rewards from your network. Direct, team, rank, and qualifier bonuses.',
  },
  {
    num: 4,
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    title: 'Trade on AtomicP2P',
    desc: 'Buy and sell KAIRO tokens peer-to-peer with on-chain escrow protection. No slippage, no front-running.',
  },
];

/* ─────────────── TIERS ─────────────── */
const tiers = [
  { name: 'Tier 1', range: '$10 – $499', interval: '8hr', closings: '3x daily', color: 'from-dark-700 to-dark-800', border: 'border-dark-600', popular: false },
  { name: 'Tier 2', range: '$500 – $1,999', interval: '6hr', closings: '4x daily', color: 'from-dark-700 to-dark-800', border: 'border-dark-600', popular: false },
  { name: 'Tier 3', range: '$2,000+', interval: '4hr', closings: '6x daily', color: 'from-primary-900/40 to-dark-800', border: 'border-primary-500/40', popular: true },
];

/* ══════════════════════════════════════════════════════ */
/*                    MAIN PAGE                          */
/* ══════════════════════════════════════════════════════ */
export default function HomePage() {
  const { price, isLoading: priceLoading } = useKairoPrice();
  const countdown = useCountdown(CMS_DEADLINE);

  // Capture ?ref= parameter on landing page
  useReferral();

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ─── HERO ─── */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* animated gradient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary-500/10 blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-accent-500/10 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary-500/5 blur-[160px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
              Live on opBNB Chain
            </div>
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05]"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="text-dark-50">KAIRO</span>
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 via-primary-300 to-accent-400">
              The Future of DeFi
            </span>
            <br />
            <span className="text-dark-300 text-4xl sm:text-5xl lg:text-6xl">on opBNB</span>
          </motion.h1>

          <motion.p
            className="mt-8 text-lg sm:text-xl text-dark-400 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
          >
            Earn up to <span className="text-primary-400 font-semibold">3X returns</span> with our innovative capping staking mechanism.
            5-level referral rewards, CMS subscriptions, and atomic P2P trading.
          </motion.p>

          {/* Live price badge */}
          <motion.div
            className="mt-6 inline-flex items-center gap-3 px-5 py-2.5 rounded-xl bg-dark-800/80 border border-dark-700 backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <span className="text-dark-400 text-sm">KAIRO Price</span>
            <span className="text-2xl font-bold font-mono text-primary-400">
              {priceLoading ? '...' : `$${price.toFixed(4)}`}
            </span>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            <Link
              href="/dashboard"
              className="px-8 py-3.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              Launch App
            </Link>
            <Link
              href="/exchange"
              className="px-8 py-3.5 rounded-xl bg-dark-800/80 hover:bg-dark-700 text-dark-200 font-semibold transition-all border border-dark-600 hover:border-dark-500 hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Trading
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── CMS COUNTDOWN ─── */}
      <AnimatedSection className="border-t border-dark-800/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <motion.p variants={fadeUp} custom={0} className="text-primary-400 font-semibold text-sm uppercase tracking-widest mb-3">
            Core Membership Subscription
          </motion.p>
          <motion.h2 variants={fadeUp} custom={1} className="text-3xl sm:text-4xl font-bold text-dark-50 mb-10">
            Limited to 10,000 Subscriptions
          </motion.h2>

          {/* countdown boxes */}
          <motion.div variants={fadeUp} custom={2} className="flex items-center justify-center gap-3 sm:gap-5 mb-10">
            {[
              { label: 'Days', value: countdown.days },
              { label: 'Hours', value: countdown.hours },
              { label: 'Minutes', value: countdown.minutes },
              { label: 'Seconds', value: countdown.seconds },
            ].map((unit) => (
              <div key={unit.label} className="flex flex-col items-center">
                <div className="w-[72px] sm:w-[90px] h-[80px] sm:h-[96px] rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-dark-700/50" />
                  <span className="text-3xl sm:text-4xl font-bold font-mono text-dark-50">
                    {String(unit.value).padStart(2, '0')}
                  </span>
                </div>
                <span className="text-xs text-dark-500 mt-2 uppercase tracking-wider">{unit.label}</span>
              </div>
            ))}
          </motion.div>

          {/* progress bar */}
          <motion.div variants={fadeUp} custom={3} className="max-w-md mx-auto mb-8">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-dark-400">Subscriptions</span>
              <span className="text-dark-300 font-mono">0 / 10,000</span>
            </div>
            <div className="h-3 rounded-full bg-dark-800 border border-dark-700 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-1000" style={{ width: '0%' }} />
            </div>
          </motion.div>

          <motion.div variants={fadeUp} custom={4}>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
            >
              Subscribe Now
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* ─── TOKENOMICS ─── */}
      <AnimatedSection className="border-t border-dark-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div variants={fadeUp} custom={0} className="text-center mb-14">
            <p className="text-primary-400 font-semibold text-sm uppercase tracking-widest mb-3">Tokenomics</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-dark-50">Transparent & Deflationary</h2>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Chart */}
            <motion.div variants={fadeUp} custom={1} className="flex justify-center">
              <div className="w-[280px] h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tokenomicsData} cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={3} dataKey="value" stroke="none">
                      {tokenomicsData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '0.75rem', color: '#f8fafc' }}
                      formatter={(value: number) => [`${value.toLocaleString()} KAIRO`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Total Supply', value: '365,000 KAIRO', sub: 'Dynamic minting via staking', icon: '📊' },
                { label: 'Social Lock', value: '10,000 KAIRO', sub: 'Permanently locked forever', icon: '🔒' },
                { label: 'Burned Tokens', value: '5,000 KAIRO', sub: 'Deflationary mechanism', icon: '🔥' },
                { label: 'Price Formula', value: 'P = USDT / S', sub: 'S = Supply − Burned + Lock', icon: '📐' },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  variants={fadeUp}
                  custom={i + 2}
                  className="rounded-xl bg-dark-800/60 backdrop-blur-xl border border-dark-700/50 p-5 hover:border-dark-600/50 transition-all duration-300"
                >
                  <span className="text-2xl mb-2 block">{card.icon}</span>
                  <p className="text-dark-400 text-sm">{card.label}</p>
                  <p className="text-xl font-bold text-dark-50 font-mono mt-1">{card.value}</p>
                  <p className="text-dark-500 text-xs mt-1">{card.sub}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* ─── HOW IT WORKS ─── */}
      <AnimatedSection className="border-t border-dark-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div variants={fadeUp} custom={0} className="text-center mb-14">
            <p className="text-primary-400 font-semibold text-sm uppercase tracking-widest mb-3">Getting Started</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-dark-50">How It Works</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeUp}
                custom={i + 1}
                className="relative rounded-xl bg-dark-800/60 backdrop-blur-xl border border-dark-700/50 p-6 hover:border-primary-500/30 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-400 font-bold text-sm">
                    {step.num}
                  </span>
                  <span className="text-primary-400 group-hover:text-primary-300 transition-colors">{step.icon}</span>
                </div>
                <h3 className="text-lg font-semibold text-dark-50 mb-2">{step.title}</h3>
                <p className="text-dark-400 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ─── STAKING TIERS ─── */}
      <AnimatedSection className="border-t border-dark-800/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div variants={fadeUp} custom={0} className="text-center mb-14">
            <p className="text-primary-400 font-semibold text-sm uppercase tracking-widest mb-3">Staking</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-dark-50">Choose Your Tier</h2>
            <p className="text-dark-400 mt-3 max-w-lg mx-auto">All tiers earn 0.1% per compounding interval with a 3X hard cap on returns.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tiers.map((tier, i) => (
              <motion.div
                key={tier.name}
                variants={fadeUp}
                custom={i + 1}
                className={`relative rounded-xl bg-gradient-to-b ${tier.color} border ${tier.border} p-6 transition-all duration-300 hover:scale-[1.02] ${tier.popular ? 'ring-1 ring-primary-500/30' : ''}`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary-500 text-white text-xs font-bold uppercase tracking-wider">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold text-dark-50 mt-2">{tier.name}</h3>
                <p className="text-3xl font-bold font-mono text-primary-400 mt-3">{tier.range}</p>
                <div className="mt-6 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Compound Interval</span>
                    <span className="text-dark-200 font-mono">{tier.interval}</span>
                  </div>
                  <div className="h-px bg-dark-700/50" />
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Daily Closings</span>
                    <span className="text-dark-200 font-mono">{tier.closings}</span>
                  </div>
                  <div className="h-px bg-dark-700/50" />
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Rate per Interval</span>
                    <span className="text-primary-400 font-mono">0.1%</span>
                  </div>
                  <div className="h-px bg-dark-700/50" />
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Max Return</span>
                    <span className="text-primary-400 font-mono font-bold">3X Cap</span>
                  </div>
                </div>
                <Link
                  href="/dashboard"
                  className={`block text-center mt-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                    tier.popular
                      ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/25'
                      : 'bg-dark-700 hover:bg-dark-600 text-dark-200 border border-dark-600'
                  }`}
                >
                  Start Staking
                </Link>
              </motion.div>
            ))}
          </div>

          {/* 3X cap explanation */}
          <motion.div variants={fadeUp} custom={4} className="mt-10 rounded-xl bg-dark-800/40 border border-dark-700/50 p-6 text-center">
            <h4 className="text-lg font-semibold text-dark-50 mb-2">What is the 3X Cap?</h4>
            <p className="text-dark-400 text-sm max-w-2xl mx-auto leading-relaxed">
              Your total earnings (staking profits + referral income) are capped at 3 times your original stake amount.
              Once reached, your stake is automatically closed and 80% of principal is returned in KAIRO tokens at the live rate.
              This ensures sustainable protocol economics and fair distribution.
            </p>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-dark-800/60 bg-dark-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">K</span>
                </div>
                <span className="text-xl font-bold text-dark-50">
                  KAIRO<span className="text-primary-400">DeFi</span>
                </span>
              </div>
              <p className="text-dark-400 text-sm max-w-sm leading-relaxed">
                Next-generation DeFi ecosystem on opBNB featuring 3X capped staking, referral rewards, and atomic P2P trading.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <span className="px-3 py-1 rounded-md bg-dark-800 border border-dark-700 text-dark-400 text-xs font-medium">
                  Built on opBNB
                </span>
              </div>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-dark-200 font-semibold text-sm mb-4">Platform</h4>
              <ul className="space-y-2">
                {[
                  { label: 'Dashboard', href: '/dashboard' },
                  { label: 'Exchange', href: '/exchange' },
                  { label: 'Documentation', href: '#' },
                ].map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-dark-400 hover:text-dark-200 text-sm transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Social */}
            <div>
              <h4 className="text-dark-200 font-semibold text-sm mb-4">Community</h4>
              <ul className="space-y-2">
                {[
                  { label: 'Twitter / X', href: 'https://twitter.com' },
                  { label: 'Telegram', href: 'https://t.me' },
                  { label: 'Discord', href: 'https://discord.gg' },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-dark-400 hover:text-dark-200 text-sm transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-dark-800/60 text-center">
            <p className="text-dark-500 text-sm">&copy; 2026 KAIRO. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
