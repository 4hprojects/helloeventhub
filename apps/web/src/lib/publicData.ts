import type { PublicConfig, PublicEvent } from '@heh/contracts';
import { api } from './api';
import { useAsync } from './useAsync';

let configPromise: Promise<PublicConfig> | undefined;
export function getPublicConfig(): Promise<PublicConfig> {
  configPromise ??= api<PublicConfig>('/public-config').catch((e) => {
    configPromise = undefined;
    throw e;
  });
  return configPromise;
}

export function usePublicConfig() {
  return useAsync(() => getPublicConfig(), []);
}

export function usePublicEvent(slug: string | undefined) {
  return useAsync(async (signal) => {
    const s = slug ?? (await getPublicConfig()).primaryEventSlug;
    return api<PublicEvent>(`/events/${encodeURIComponent(s)}`, { signal });
  }, [slug]);
}
