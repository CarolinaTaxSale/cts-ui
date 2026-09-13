import 'server-only'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

// Reads parcel images out of the object store (Cloudflare R2, over the plain
// S3 API) by the key `parcels.stored_images` records. Read-only: producing
// and storing images is data-orchestrator's job, and this app never derives a
// key itself.

let client: S3Client | undefined

function s3(): S3Client {
  if (!client) {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
    if (!accessKeyId || !secretAccessKey) throw new Error('S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not set - see .env.example')
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || 'auto',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId, secretAccessKey },
      // Checksums only where an operation requires them: the SDK's
      // CRC32-on-every-request default isn't supported by every S3-compatible
      // store.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }
  return client
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null
  return e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey'
}

export type StoredImageBody = { body: ReadableStream; contentLength: number | undefined }

/** The object's bytes as a stream, or null when it isn't in the store. */
export async function readStoredImage(objectKey: string): Promise<StoredImageBody | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET || 'pdo-images', Key: objectKey }))
    if (!res.Body) return null
    return { body: res.Body.transformToWebStream(), contentLength: res.ContentLength }
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}
