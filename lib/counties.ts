// The counties this app serves. A copy of data-orchestrator's
// countyValidation.ts list (see all-in-one's docs/shared-code-inventory.md):
// add or disable a county in both.
import type { County } from './types'

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
