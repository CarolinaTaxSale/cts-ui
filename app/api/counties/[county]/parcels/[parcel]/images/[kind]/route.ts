import { isValidCounty } from '@/lib/counties'
import { isStoredImageKind } from '@/lib/parcel-images'
import { notFound, serverError } from '@/lib/server/http'
import { readStoredImage } from '@/lib/server/image-store'
import { getStoredImage } from '@/lib/server/parcels'

// The URL stays the same when a redrawn boundary or a newer pano replaces the
// object behind it, so let browsers keep an image for a day rather than forever.
const BROWSER_MAX_AGE_S = 86_400

// GET /api/counties/:county/parcels/:parcel/images/:kind - kind is
// satellite-card, satellite-hero or street-view. Looks the object up in
// `parcels.stored_images` and streams it from the image store; 404 when the
// parcel has no image of that kind yet (data-orchestrator's `parcel-images`
// job produces them).
export async function GET(_req: Request, { params }: { params: Promise<{ county: string; parcel: string; kind: string }> }) {
  const { county, parcel, kind } = await params
  if (!isValidCounty(county) || !isStoredImageKind(kind)) return notFound()
  try {
    const stored = await getStoredImage(county, parcel, kind)
    const image = stored && (await readStoredImage(stored.objectKey))
    if (!stored || !image) return notFound('No image')
    return new Response(image.body, {
      headers: {
        'content-type': stored.contentType,
        'cache-control': `public, max-age=${BROWSER_MAX_AGE_S}`,
        ...(image.contentLength === undefined ? {} : { 'content-length': String(image.contentLength) }),
      },
    })
  } catch (err) {
    return serverError(err, `serving the ${kind} image for ${county} parcel ${parcel}`)
  }
}
