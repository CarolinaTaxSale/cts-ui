// URLs for a parcel's images, served by app/api/counties/[county]/parcels/
// [parcel]/images/[kind] straight from the image store, so an <img> can point
// at them.

// The kinds `parcels.stored_images` records. Must match data-orchestrator's
// STORED_IMAGE_KINDS and the table's check constraint.
export const STORED_IMAGE_KINDS = ['satellite-card', 'satellite-hero', 'street-view'] as const
export type StoredImageKind = (typeof STORED_IMAGE_KINDS)[number]

export function isStoredImageKind(value: string): value is StoredImageKind {
  return (STORED_IMAGE_KINDS as readonly string[]).includes(value)
}

const imageUrl = (countyId: string, parcelId: string, kind: StoredImageKind) =>
  `/api/counties/${encodeURIComponent(countyId)}/parcels/${encodeURIComponent(parcelId)}/images/${kind}`

// `card` is the Analyze card's 2:1 slot, `hero` the detail view's 4:3 image.
export function satelliteImageUrl(countyId: string, parcelId: string, size: 'card' | 'hero') {
  return imageUrl(countyId, parcelId, size === 'card' ? 'satellite-card' : 'satellite-hero')
}

export function streetViewImageUrl(countyId: string, parcelId: string) {
  return imageUrl(countyId, parcelId, 'street-view')
}

// Shown beside each image: the satellite render has no text of its own, and
// Esri's terms want the imagery credited.
export const SATELLITE_IMAGE_CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics'
export const STREET_VIEW_IMAGE_CREDIT = 'Street View © Google'
