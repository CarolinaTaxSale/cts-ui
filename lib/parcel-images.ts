// URLs for a parcel's images, served by the orchestrator through the
// same-origin read-only proxy (see lib/api.ts and
// app/api/orchestrator/[...path]/route.ts) and cached in its image store, so
// an <img> can point straight at them.

const ORCHESTRATOR_PROXY = '/api/orchestrator'

const parcelPath = (countyId: string, parcelId: string) =>
  `${ORCHESTRATOR_PROXY}/${encodeURIComponent(countyId)}/parcels/${encodeURIComponent(parcelId)}`

// `card` is the Analyze card's 2:1 slot, `hero` the detail view's 4:3 image.
export function satelliteImageUrl(countyId: string, parcelId: string, size: 'card' | 'hero') {
  return `${parcelPath(countyId, parcelId)}/satellite?size=${size}`
}

// 404 when there's no Street View near the parcel.
export function streetViewImageUrl(countyId: string, parcelId: string) {
  return `${parcelPath(countyId, parcelId)}/street-view`
}

// Shown beside each image: the satellite render has no text of its own, and
// Esri's terms want the imagery credited.
export const SATELLITE_IMAGE_CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics'
export const STREET_VIEW_IMAGE_CREDIT = 'Street View © Google'
