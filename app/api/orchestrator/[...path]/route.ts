// Same-origin, READ-ONLY proxy to the data-orchestrator API.
//
// Unlike admin-ui's proxy (an internal tool, trusted to pass any method/path
// through to an API that can run jobs, rotate VPNs, and edit owner
// identities), this app is public-internet-facing. So this proxy only
// forwards GET requests, and only for the small allowlist of parcel/county
// read paths the consumer Analyze experience actually calls (see lib/api.ts
// and lib/parcel-images.ts) - never widen this into a generic pass-through.

const DEFAULT_ORCHESTRATOR_URL = "http://localhost:3100";

// Never cache a proxied API response, and never try to statically render this.
export const dynamic = "force-dynamic";

// county id: "sc.york" etc; parcel id: alphanumeric county-parcel id.
const COUNTY = "[a-z]+\\.[a-z-]+";
const PARCEL = "[A-Za-z0-9-]+";
const ALLOWED_PATHS = [
  /^counties$/,
  new RegExp(`^${COUNTY}/parcels/meta$`),
  new RegExp(`^${COUNTY}/parcels/taxes/delinquent$`),
  new RegExp(`^${COUNTY}/parcels/${PARCEL}$`),
  new RegExp(`^${COUNTY}/parcels/${PARCEL}/satellite$`),
  new RegExp(`^${COUNTY}/parcels/${PARCEL}/street-view$`),
];

function resolveUpstreamBase(): string {
  const configured = process.env.ORCHESTRATOR_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  return DEFAULT_ORCHESTRATOR_URL;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  const joined = (path ?? []).join("/");
  if (!ALLOWED_PATHS.some((re) => re.test(joined))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const base = resolveUpstreamBase();
  const search = new URL(req.url).search;
  const target = `${base}/${(path ?? []).map(encodeURIComponent).join("/")}${search}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, { redirect: "manual" });
  } catch {
    // Upstream is down / unresolvable. 504 so lib/api.ts can treat it as
    // "service unreachable" rather than a per-view error.
    return Response.json(
      { error: "data-orchestrator is unreachable from the cts-ui server" },
      { status: 504 },
    );
  }

  const body = await upstream.arrayBuffer();
  const out = new Headers();
  for (const name of ["content-type", "cache-control", "x-image-cache"]) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(body, { status: upstream.status, headers: out });
}
