const TILE_TEMPLATE = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/tiles/v2/bm_web_de_3857/{z}/{x}/{y}.pbf';
const STYLE_URL = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json';

function lonToX(lon: number, zoom: number): number { return Math.floor(((lon + 180) / 360) * 2 ** zoom); }
function latToY(lat: number, zoom: number): number {
  const rad = lat * Math.PI / 180;
  return Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * 2 ** zoom);
}

export function boundsAround(center: [number, number], radiusKm: number): [number, number, number, number] {
  const [lon, lat] = center;
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta];
}

export function tileUrls(bounds: [number, number, number, number], minZoom = 8, maxZoom = 14, cap = 2500): string[] {
  const [west, south, east, north] = bounds;
  const urls: string[] = [];
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const minX = lonToX(west, z); const maxX = lonToX(east, z);
    const minY = latToY(north, z); const maxY = latToY(south, z);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      urls.push(TILE_TEMPLATE.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
      if (urls.length > cap) throw new Error(`Kartengebiet ist zu groß (mehr als ${cap} Kacheln)`);
    }
  }
  return urls;
}

export async function prefetchOfflineMap(bounds: [number, number, number, number], onProgress?: (done: number, total: number) => void): Promise<number> {
  const urls = [STYLE_URL, ...tileUrls(bounds)];
  const cache = await caches.open('derkumpel-map');
  let done = 0;
  const queue = [...urls];
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      const request = new Request(url, { mode: 'cors' });
      const existing = await cache.match(request);
      if (!existing) {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
      }
      done += 1;
      onProgress?.(done, urls.length);
    }
  });
  await Promise.all(workers);
  return urls.length;
}
