import { useQuery } from "@tanstack/react-query";

export interface Account {
  id: number;
  name: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: ['/api/accounts'],
  });
}
