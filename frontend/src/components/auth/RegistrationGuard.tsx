'use client';

import { useAccount } from 'wagmi';
import { useRegistration } from '@/hooks/useRegistration';
import Link from 'next/link';
import { ShieldExclamationIcon } from '@heroicons/react/24/outline';

export function RegistrationGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const { isRegistered, isLoading } = useRegistration();

  // If wallet not connected, let the dashboard handle showing "Connect Wallet" prompt
  if (!isConnected) {
    return <>{children}</>;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-dark-400 text-sm">Checking registration status...</p>
        </div>
      </div>
    );
  }

  // Not registered — show registration prompt
  if (!isRegistered) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <ShieldExclamationIcon className="w-16 h-16 text-primary-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-dark-50 mb-2">Registration Required</h2>
          <p className="text-dark-400 text-sm mb-6">
            You need to register before accessing the dashboard. Register by staking or subscribing to CMS with a valid referrer.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
          >
            Register Now
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
