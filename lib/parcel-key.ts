// One string naming a parcel across counties - "sc.york:0010101001" - for the
// places that need a single id (Set membership, React keys, map pin ids). A
// parcel id alone isn't unique once saved parcels from several counties share
// a screen. County ids never contain a colon, so the first one splits it.

export type ParcelRef = { countyId: string; parcelId: string }

export function parcelKey(countyId: string, parcelId: string): string {
  return `${countyId}:${parcelId}`
}

export function splitParcelKey(key: string): ParcelRef {
  const i = key.indexOf(':')
  return { countyId: key.slice(0, i), parcelId: key.slice(i + 1) }
}
