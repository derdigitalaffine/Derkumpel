import { describe, expect, it } from 'vitest';
import { boundsAround, tileUrls } from './mapOffline';

describe('offline map helpers', () => {
  it('creates a bbox around the configured center', () => {
    const [west, south, east, north] = boundsAround([7.77, 49.5], 10);
    expect(west).toBeLessThan(7.77);
    expect(east).toBeGreaterThan(7.77);
    expect(south).toBeLessThan(49.5);
    expect(north).toBeGreaterThan(49.5);
  });

  it('builds basemap.de raster tile URLs within the cap', () => {
    const urls = tileUrls([7.74, 49.47, 7.80, 49.53], 10, 11, 100);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.includes('sgx.geodatenzentrum.de'))).toBe(true);
    expect(urls.every((url) => url.endsWith('.png'))).toBe(true);
    expect(urls.every((url) => url.includes('/wmts_basemapde/tile/'))).toBe(true);
  });

  it('refuses excessively large offline downloads', () => {
    expect(() => tileUrls([-20, 35, 30, 65], 8, 14, 10)).toThrow(/zu groß/);
  });
});
