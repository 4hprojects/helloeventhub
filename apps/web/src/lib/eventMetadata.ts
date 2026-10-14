import { useEffect } from 'react';
import type { PublicEvent } from '@heh/contracts';
import { canonicalEventUrl } from '../components/EventSharing';

export const REUNION_META_DESCRIPTION =
  'Join the 1st Menay Bugtong - Wakat Alsem Clan Reunion on October 24, 2026 at Veterans Building, Puguis, La Trinidad, Benguet. One Family, Many Faces, New Connections.';

function meta(selector: string, attributes: Record<string, string>): () => void {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  const created = !node;
  const previous = node
    ? Object.fromEntries(Object.keys(attributes).map((name) => [name, node!.getAttribute(name)]))
    : {};
  if (!node) {
    node = document.createElement('meta');
    document.head.append(node);
  }
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return () => {
    if (created) node!.remove();
    else
      for (const [name, value] of Object.entries(previous)) {
        if (value === null) node!.removeAttribute(name);
        else node!.setAttribute(name, value);
      }
  };
}

export function useEventMetadata(event: PublicEvent) {
  useEffect(() => {
    const previousTitle = document.title;
    const canonical = canonicalEventUrl(event.slug);
    const image = `https://helloeventhub.online/events/${encodeURIComponent(event.slug)}/social-preview.png`;
    const cleanups: Array<() => void> = [];
    document.title = `${event.title} | HelloEventHub`;
    cleanups.push(
      meta('meta[name="description"]', { name: 'description', content: REUNION_META_DESCRIPTION }),
    );
    cleanups.push(meta('meta[property="og:title"]', { property: 'og:title', content: event.title }));
    cleanups.push(
      meta('meta[property="og:description"]', {
        property: 'og:description',
        content: REUNION_META_DESCRIPTION,
      }),
    );
    cleanups.push(meta('meta[property="og:url"]', { property: 'og:url', content: canonical }));
    cleanups.push(meta('meta[property="og:image"]', { property: 'og:image', content: image }));
    cleanups.push(meta('meta[property="og:type"]', { property: 'og:type', content: 'website' }));
    cleanups.push(
      meta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' }),
    );
    cleanups.push(meta('meta[name="twitter:title"]', { name: 'twitter:title', content: event.title }));
    cleanups.push(
      meta('meta[name="twitter:description"]', {
        name: 'twitter:description',
        content: REUNION_META_DESCRIPTION,
      }),
    );
    cleanups.push(meta('meta[name="twitter:image"]', { name: 'twitter:image', content: image }));
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const linkCreated = !link;
    const previousHref = link?.getAttribute('href') ?? null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.append(link);
    }
    link.href = canonical;
    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      startDate: event.startsAt,
      endDate: event.endsAt,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: event.venueName, address: event.venueAddress },
      url: canonical,
      image,
      description: REUNION_META_DESCRIPTION,
    }).replace(/</g, '\\u003c');
    document.head.append(jsonLd);
    return () => {
      document.title = previousTitle;
      cleanups.forEach((cleanup) => cleanup());
      if (linkCreated) link!.remove();
      else if (previousHref === null) link!.removeAttribute('href');
      else link!.setAttribute('href', previousHref);
      jsonLd.remove();
    };
  }, [event]);
}
