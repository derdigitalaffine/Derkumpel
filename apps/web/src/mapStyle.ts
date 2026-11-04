import type { StyleSpecification } from 'maplibre-gl';

// Official basemap.de Web Raster WMTS endpoint, GLOBAL_WEBMERCATOR.
// Note the WMTS URL order: {z}/{y}/{x}, not {z}/{x}/{y}.
export const BASEMAP_RASTER_TILE_URL = 'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png';
export const OTTERBACH_OTTERBERG_CENTER: [number, number] = [7.7546, 49.4944];

export const BASEMAP_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [BASEMAP_RASTER_TILE_URL],
      tileSize: 256,
      attribution: '© basemap.de / BKG',
    },
  },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
};
