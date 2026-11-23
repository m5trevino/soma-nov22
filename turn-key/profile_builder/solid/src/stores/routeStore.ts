import { createSignal, createRoot } from 'solid-js';

/**
 * Hash router. Every view has its own address, so a tab is a real link:
 *   #/all                 every model from every provider that is on
 *   #/provider/<key>      one provider's models
 *   #/freshner            saved freshner lists
 */
export type Route =
  | { view: 'all' }
  | { view: 'provider'; provider: string }
  | { view: 'freshner' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const parts = path.split('/').filter(Boolean).map(part => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts[0] === 'provider' && parts[1]) return { view: 'provider', provider: parts[1] };
  if (parts[0] === 'freshner') return { view: 'freshner' };
  return { view: 'all' };
}

export function hrefFor(route: Route): string {
  switch (route.view) {
    case 'provider':
      return `#/provider/${encodeURIComponent(route.provider)}`;
    case 'freshner':
      return '#/freshner';
    default:
      return '#/all';
  }
}

const store = createRoot(() => {
  const [route, setRoute] = createSignal<Route>(parseHash(window.location.hash));

  window.addEventListener('hashchange', () => setRoute(parseHash(window.location.hash)));

  const navigate = (next: Route) => {
    window.location.hash = hrefFor(next);
  };

  return { route, navigate } as const;
});

export function useRouteStore() {
  return store;
}
