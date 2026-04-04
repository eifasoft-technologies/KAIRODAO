'use client';

import { useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { isAddress } from 'viem';

const STORAGE_KEY = 'kairo_referrer';
const REFERRAL_BASE_URL = 'https://kairodao.com?ref=';

/**
 * Hook to manage referral link logic:
 * - Reads `?ref=0x...` from URL on first load
 * - Validates and stores in localStorage
 * - Provides the stored referrer address
 * - Generates the connected user's own referral link
 */
export function useReferral() {
  const { address } = useAccount();

  // On mount, check URL for ref param and persist
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');
    if (refParam && isAddress(refParam)) {
      // Don't store self-referral
      if (!address || refParam.toLowerCase() !== address.toLowerCase()) {
        localStorage.setItem(STORAGE_KEY, refParam);
      }
    }
  }, [address]);

  const referrer = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isAddress(stored)) {
      // Don't return self as referrer
      if (address && stored.toLowerCase() === address.toLowerCase()) return null;
      return stored as `0x${string}`;
    }
    return null;
  }, [address]);

  const referralLink = address ? `${REFERRAL_BASE_URL}${address}` : '';

  return {
    /** The stored referrer address (from URL param / localStorage), or null */
    referrer,
    /** The connected wallet's own referral link */
    referralLink,
    /** The zero address to pass when no referrer is available */
    referrerOrZero: (referrer ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
  };
}
