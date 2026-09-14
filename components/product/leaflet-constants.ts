export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// Esri World Imagery - free, no API key, so a user can see the actual lot
// (buildings, tree cover) rather than just street-map outlines.
export const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const SATELLITE_TILE_ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'

// Road and place names drawn over the satellite imagery, which has none of its
// own - without them a user can't tell which road a lot fronts.
export const SATELLITE_LABEL_TILE_URLS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
]

// USGS's topographic basemap: contour lines, streams and elevation labels.
// Public domain. It stops at z16 in the Carolinas (404s past it), so Leaflet
// scales z16 tiles up beyond that.
export const TOPO_TILE_URL = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'
export const TOPO_TILE_ATTRIBUTION = 'Tiles courtesy of the <a href="https://www.usgs.gov/">U.S. Geological Survey</a>'
export const TOPO_MAX_NATIVE_ZOOM = 16

// Esri World Hillshade, blended over whichever base map is showing so slopes,
// ridges and creek bottoms read at a glance. Past z16 in the Carolinas it
// serves a "no data" placeholder tile, so Leaflet scales z16 tiles up instead.
export const HILLSHADE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'
export const HILLSHADE_TILE_ATTRIBUTION = 'Hillshade &copy; <a href="https://www.esri.com/">Esri</a>'
export const HILLSHADE_MAX_NATIVE_ZOOM = 16

// Shown only when there are no parcels to fit map bounds to.
export const FALLBACK_MAP_CENTER: [number, number] = [34.99, -81.19]

export const MAP_MAX_ZOOM = 19
// 8 zoom clicks out from max keeps zooming out capped at the greater county
// area instead of the whole state/country.
export const MAP_MIN_ZOOM = MAP_MAX_ZOOM - 8
// Midpoint between the two: above it, the map reads as "already looking at a
// specific parcel"; at or below it, it reads as "still at the county-wide
// overview." Selecting a new parcel while above this zooms out to
// MAP_MIN_ZOOM first, then flies in - selecting one while at or below it just
// flies straight there, since there's nothing to zoom out of yet.
export const MAP_ZOOMED_IN_THRESHOLD = MAP_MIN_ZOOM + (MAP_MAX_ZOOM - MAP_MIN_ZOOM) / 2

// `polygons`/`centroids` are stored exactly as the county sources sent them,
// with no guaranteed coordinate order (much of it is latitude-first despite
// claiming GeoJSON [lng, lat]). Every county in scope is continental US, where
// latitude magnitude tops out ~49 and longitude magnitude bottoms out ~66, so
// the magnitude gap disambiguates: whichever component is > 60 is the
// longitude. The ingestion side uses the same 60 threshold. Leaflet wants
// [lat, lng].
export function toLatLng(pair: readonly number[]): [number, number] {
  const [a, b] = pair
  if (Math.abs(a) > 60 && Math.abs(b) <= 60) return [b, a]
  return [a, b]
}
