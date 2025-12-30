import { useState, useEffect, useMemo } from 'react';
import jobManager, { AccountState } from '@/lib/bulkJobManager';

export function useJobManager(accountId?: string) {
  const [accountStates, setAccountStates] = useState<Record<string, AccountState>>(jobManager.getAllStates());

  useEffect(() => {
    const handleUpdate = (states: Record<string, AccountState>) => {
      setAccountStates(states);
    };
    jobManager.subscribe(handleUpdate);
    return () => jobManager.unsubscribe(handleUpdate);
  }, []);

  const selectedAccountState = useMemo(() => {
    return accountId ? accountStates[accountId] : undefined;
  }, [accountStates, accountId]);

  return {
    accountStates,
    selectedAccountState,
    startJob: jobManager.startJob.bind(jobManager),
    pauseJob: jobManager.pauseJob.bind(jobManager),
    resumeJob: jobManager.resumeJob.bind(jobManager),
    stopJob: jobManager.stopJob.bind(jobManager),
    getAccountState: jobManager.getAccountState.bind(jobManager),
    updateAccountState: jobManager.updateAccountState.bind(jobManager)
  };
}