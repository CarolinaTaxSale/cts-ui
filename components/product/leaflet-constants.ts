export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// Esri World Imagery - free, no API key, used for the single-parcel detail
// map so an operator can see the actual lot (buildings, tree cover) rather
// than just street-map outlines.
export const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const SATELLITE_TILE_ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
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

// The orchestrator returns `polygons`/`centroids` "exactly as received" and
// does not enforce a coordinate order (see data-orchestrator/README.md's
// "Coordinate order caveat" - the sample data is latitude-first despite
// claims of GeoJSON [lng, lat] order). Every county in scope is continental
// US, where latitude magnitude tops out ~49 and longitude magnitude bottoms
// out ~66, so the magnitude gap disambiguates: whichever component is > 60
// is the longitude. Same 60 threshold data-orchestrator/src/db/geometry.ts
// uses. Leaflet wants [lat, lng].
export function toLatLng(pair: readonly number[]): [number, number] {
  const [a, b] = pair
  if (Math.abs(a) > 60 && Math.abs(b) <= 60) return [b, a]
  return [a, b]
}
