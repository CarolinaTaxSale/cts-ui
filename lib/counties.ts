// The counties this app serves, and the source of truth for it. This used to
// be a GET /counties call to the orchestrator (see lib/counties-server.ts,
// now removed); the orchestrator/retriever/admin-ui stack is purely a local
// data-collection tool, not something this app can depend on in production,
// so the list is copied here instead - mirrors
// data-orchestrator/src/lib/countyValidation.ts exactly. Add a county by
// adding a row; comment one out to disable it everywhere without losing its
// config.
import type { County } from './api'

type CountyConfig = County & { countyParcelUrl: (parcelId: string) => string }

export const COUNTIES: readonly CountyConfig[] = [
  {
    id: 'sc.york',
    state: 'SC',
    name: 'York County',
    countyParcelUrl: (parcelId: string) =>
      'https://qpublic.schneidercorp.com/Application.aspx?AppID=862&LayerID=16113&PageTypeID=4&PageID=7174&KeyValue=' + parcelId,
  },
  {
    id: 'sc.lancaster',
    state: 'SC',
    name: 'Lancaster County',
    countyParcelUrl: (parcelId: string) =>
      'https://qpublic.schneidercorp.com/Application.aspx?AppID=211&LayerID=2815&PageTypeID=4&PageID=1553&KeyValue=' + parcelId,
  },
] as const

const COUNTY_ID_PATTERN = /^[a-z]+\.[a-z]+$/

export function getCountyConfig(countyId: string): CountyConfig | undefined {
  return COUNTIES.find((c) => c.id === countyId)
}

// Plain `{id, state, name}` only - a Server Component can't pass
// `countyParcelUrl` (a function) as a prop to a Client Component, so anything
// handing counties to client code (the product shell, its county dropdown)
// needs this instead of COUNTIES directly.
export function plainCounties(): County[] {
  return COUNTIES.map(({ id, state, name }) => ({ id, state, name }))
}

export function isValidCounty(countyId: string): boolean {
  return COUNTY_ID_PATTERN.test(countyId) && COUNTIES.some((c) => c.id === countyId)
}
