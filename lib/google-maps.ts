// Links out to Google Maps for a parcel, built with Google's Maps URLs API
// (https://developers.google.com/maps/documentation/urls/get-started), which
// needs no API key and opens the Google Maps app on phones that have it.

// Close enough in to pick out one lot, like the satellite overhead it stands in for.
const SATELLITE_ZOOM = 19

const coords = ([lat, lng]: readonly [number, number]) => `${lat.toFixed(7)},${lng.toFixed(7)}`

/** Google Maps' satellite view, centered on the parcel. */
export function googleSatelliteUrl(center: readonly [number, number]): string {
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${coords(center)}&zoom=${SATELLITE_ZOOM}&basemap=satellite`
}

/** Compass bearing in degrees (0 = north, clockwise) from one [lat, lng] to another. */
export function bearingDegrees(from: readonly [number, number], to: readonly [number, number]): number {
  const rad = Math.PI / 180
  const [lat1, lat2] = [from[0] * rad, to[0] * rad]
  const dLng = (to[1] - from[1]) * rad
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) / rad + 360) % 360
}

/**
 * Street View in Google Maps. With the pano the stored image came from, it opens
 * that same pano, turned to face the parcel; without one, Google picks the pano
 * nearest the parcel and faces it wherever it likes.
 */
export function googleStreetViewUrl(
  parcel: readonly [number, number],
  pano?: { id: string; position: readonly [number, number] | null },
): string {
  if (!pano) return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords(parcel)}`
  const params = [`pano=${encodeURIComponent(pano.id)}`]
  if (pano.position) {
    params.push(`viewpoint=${coords(pano.position)}`, `heading=${Math.round(bearingDegrees(pano.position, parcel))}`)
  }
  return `https://www.google.com/maps/@?api=1&map_action=pano&${params.join('&')}`
}
