import 'server-only'

export function notFound(error = 'Not found'): Response {
  return Response.json({ error }, { status: 404 })
}

export function unauthorized(): Response {
  return Response.json({ error: 'Sign in to see parcel data.' }, { status: 401 })
}

/** Log the real error server-side; the client only learns that something failed. */
export function serverError(err: unknown, while_: string): Response {
  console.error(`cts-ui: failed while ${while_}`, err)
  return Response.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 500 })
}
