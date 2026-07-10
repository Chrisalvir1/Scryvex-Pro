function getIngressBaseUrl(): URL {
  const current = new URL(window.location.href);
  const ingressMarker = '/api/hassio_ingress/';
  const markerIndex = current.pathname.indexOf(ingressMarker);

  if (markerIndex === -1) {
    current.pathname = '/';
    current.search = '';
    current.hash = '';
    return current;
  }

  const remainder = current.pathname.slice(
    markerIndex + ingressMarker.length,
  );

  const token = remainder.split('/')[0];

  current.pathname = `${ingressMarker}${token}/`;
  current.search = '';
  current.hash = '';

  return current;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '');
}

export function apiUrl(path: string): string {
  return new URL(normalizePath(path), getIngressBaseUrl()).toString();
}

export function websocketUrl(path: string): string {
  const url = new URL(normalizePath(path), getIngressBaseUrl());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function publicAssetUrl(path: string): string {
  return new URL(normalizePath(path), getIngressBaseUrl()).toString();
}
