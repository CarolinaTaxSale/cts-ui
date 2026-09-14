'use client'

import { useCallback, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Check, Layers } from 'lucide-react'
import { Pane, TileLayer } from 'react-leaflet'
import {
  HILLSHADE_MAX_NATIVE_ZOOM,
  HILLSHADE_TILE_ATTRIBUTION,
  HILLSHADE_TILE_URL,
  MAP_MAX_ZOOM,
  SATELLITE_LABEL_TILE_URLS,
  SATELLITE_TILE_ATTRIBUTION,
  SATELLITE_TILE_URL,
  TILE_ATTRIBUTION,
  TILE_URL,
  TOPO_MAX_NATIVE_ZOOM,
  TOPO_TILE_ATTRIBUTION,
  TOPO_TILE_URL,
} from '@/components/product/leaflet-constants'

export type BaseLayer = 'map' | 'satellite' | 'topo'
export type MapLayerChoice = { base: BaseLayer; terrain: boolean }

const BASE_LAYERS: { key: BaseLayer; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'satellite', label: 'Satellite' },
  { key: 'topo', label: 'Topographic' },
]

function isChoice(value: unknown): value is MapLayerChoice {
  const v = value as MapLayerChoice | null
  return !!v && BASE_LAYERS.some((b) => b.key === v.base) && typeof v.terrain === 'boolean'
}

// The layers a map shows, remembered per `storageKey` in this browser so the
// map opens the way the user last left it. Storage can be unavailable (private
// windows, blocked site data), in which case the choice lasts until reload.
export function useMapLayerChoice(storageKey: string, defaultBase: BaseLayer) {
  const [choice, setChoice] = useState<MapLayerChoice>(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
      if (isChoice(stored)) return stored
    } catch {
      // Fall through to the default.
    }
    return { base: defaultBase, terrain: false }
  })

  const update = useCallback((next: MapLayerChoice) => {
    setChoice(next)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Not remembered, but still applied.
    }
  }, [storageKey])

  return [choice, update] as const
}

// The tile layers for a choice. Rendered inside a MapContainer.
//
// Hillshade sits in its own pane between the base tiles (tilePane, 200) and the
// parcel outline (overlayPane, 400), multiplied into the base so it shades the
// map beneath instead of greying it out. Satellite labels go above the shading.
export function MapLayers({ choice }: { choice: MapLayerChoice }) {
  return (
    <>
      {choice.base === 'map' && <TileLayer key="map" url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={MAP_MAX_ZOOM} />}
      {choice.base === 'satellite' && (
        <TileLayer key="satellite" url={SATELLITE_TILE_URL} attribution={SATELLITE_TILE_ATTRIBUTION} maxZoom={MAP_MAX_ZOOM} />
      )}
      {choice.base === 'topo' && (
        <TileLayer
          key="topo"
          url={TOPO_TILE_URL}
          attribution={TOPO_TILE_ATTRIBUTION}
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={TOPO_MAX_NATIVE_ZOOM}
        />
      )}
      {choice.terrain && (
        <Pane name="terrain" style={{ zIndex: 250, mixBlendMode: 'multiply', pointerEvents: 'none' }}>
          <TileLayer
            url={HILLSHADE_TILE_URL}
            attribution={HILLSHADE_TILE_ATTRIBUTION}
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={HILLSHADE_MAX_NATIVE_ZOOM}
            // Satellite imagery is dark already; full-strength shading turns
            // wooded hillsides black.
            opacity={choice.base === 'satellite' ? 0.45 : 0.7}
          />
        </Pane>
      )}
      {choice.base === 'satellite' && (
        <Pane name="satellite-labels" style={{ zIndex: 350, pointerEvents: 'none' }}>
          {SATELLITE_LABEL_TILE_URLS.map((url) => (
            <TileLayer key={url} url={url} maxZoom={MAP_MAX_ZOOM} />
          ))}
        </Pane>
      )}
    </>
  )
}

const itemClass =
  'flex w-full cursor-default items-center justify-between gap-6 px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-muted'

// The layers button in a map's top-right corner. Rendered over the map, not
// inside the MapContainer, so clicks on it never reach Leaflet.
export function MapLayerControl({ choice, onChange }: { choice: MapLayerChoice; onChange: (next: MapLayerChoice) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Map layers"
        className="absolute top-2.5 right-2.5 z-[1000] flex h-9 items-center gap-1.5 rounded-lg border border-black/15 bg-card px-2.5 text-sm font-semibold text-foreground shadow-md transition hover:bg-muted data-[popup-open]:bg-muted"
      >
        <Layers aria-hidden size={16} />
        <span>{BASE_LAYERS.find((b) => b.key === choice.base)?.label}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-[70] outline-none">
          <Menu.Popup className="panel w-52 origin-[var(--transform-origin)] overflow-hidden py-1 shadow-lg outline-none transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Menu.RadioGroup value={choice.base} onValueChange={(base: BaseLayer) => onChange({ ...choice, base })}>
              <Menu.GroupLabel className="data-label px-3 pt-1.5 pb-1">Base map</Menu.GroupLabel>
              {BASE_LAYERS.map((b) => (
                <Menu.RadioItem key={b.key} value={b.key} closeOnClick className={itemClass}>
                  {b.label}
                  <Menu.RadioItemIndicator>
                    <Check aria-hidden size={15} className="text-primary" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.CheckboxItem
              checked={choice.terrain}
              onCheckedChange={(terrain) => onChange({ ...choice, terrain })}
              className={itemClass}
            >
              Terrain shading
              <Menu.CheckboxItemIndicator>
                <Check aria-hidden size={15} className="text-primary" />
              </Menu.CheckboxItemIndicator>
            </Menu.CheckboxItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
