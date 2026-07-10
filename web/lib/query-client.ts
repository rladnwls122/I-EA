import { QueryClient } from '@tanstack/react-query';
export const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
