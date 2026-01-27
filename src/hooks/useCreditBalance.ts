"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { fetcher } from "@/utils/fetcher";
import { toast } from "sonner";
import { PROFILE_SWR_KEY } from "@/hooks/useUserProfile";

/**
 * Global function to refresh credit balance from anywhere in the app.
 * Call this after any operation that changes the user's credits (AI chat, capture, promo code, etc.)
 */
export function refreshCreditBalance() {
  mutate(PROFILE_SWR_KEY);
}

interface UseCreditBalanceReturn {
  creditBalance: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCreditBalance(): UseCreditBalanceReturn {
  const { user } = useAuth();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: result,
    error: swrError,
    isLoading: swrLoading,
    mutate: localMutate,
  } = useSWR(
    user?.id ? PROFILE_SWR_KEY : null,
    fetcher,
    {
      revalidateOnFocus: false,      // Don't refetch on window focus
      revalidateOnReconnect: false,  // Don't refetch on reconnect
      refreshInterval: 0,            // No auto-refresh - only refresh when credits are used
      dedupingInterval: 300000,      // 5 minutes - dedupe requests within this window
      revalidateIfStale: false,      // Don't auto-revalidate stale data
    }
  );

  useEffect(() => {
    if (result) {
      if (result.success && result.profile) {
        setCreditBalance(result.profile.credits_balance ?? 0);
        setError(null);
      } else {
        // Profile exists but no credits_balance field
        setCreditBalance(0);
      }
    }
  }, [result]);

  useEffect(() => {
    if (swrError) {
      const errorMessage =
        swrError instanceof Error
          ? swrError.message
          : "Unable to load credit balance";

      setError(errorMessage);
      setCreditBalance(null);

      // Show user-friendly toast notification
      toast.error("Unable to load your credit balance", {
        description: "Please try refreshing the page or check your connection.",
      });
    } else {
      setError(null);
    }
  }, [swrError]);

  useEffect(() => {
    setLoading(swrLoading);
  }, [swrLoading]);

  const refetch = useCallback(() => {
    localMutate();
  }, [localMutate]);

  return {
    creditBalance,
    loading,
    error,
    refetch,
  };
}

