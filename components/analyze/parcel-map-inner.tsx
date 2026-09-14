'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { FitBoundsOptions, Popup as LeafletPopup } from 'leaflet'
import { MapContainer, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet'
import { formatUsdCompact } from '@/lib/format'
import { MapLayerControl, MapLayers, useMapLayerChoice, type BaseLayer } from './map-layers'
import { ParcelPinsLayer, type MapPin } from './parcel-pins-layer'
import type { AnalyzeRow, AnalyzeSummaryRow } from './analyze-row'
import {
  FALLBACK_MAP_CENTER,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_ZOOMED_IN_THRESHOLD,
} from '@/components/product/leaflet-constants'

type PlacedPin = AnalyzeSummaryRow & { centroid: [number, number] }

// Fitting the map to pins alone - one saved parcel, or a few on one street -
// would otherwise zoom all the way in on a dot with no surroundings to read.
const PIN_FIT_MAX_ZOOM = 16

// Zoomed out, a county's worth of price labels is an unreadable pile, so pins
// are plain dots until the map is close enough for the labels to separate.
const LABEL_ZOOM = 14

// Hands the pins and the highlighted ids to the canvas pin layer (see
// parcel-pins-layer.ts). The layer lives as long as the map; each prop change
// is one redraw of the canvas, never a React render per pin.
function ParcelPins({
  pins,
  activeIds,
  onPinClick,
}: {
  pins: PlacedPin[]
  activeIds: (string | null)[]
  onPinClick: (id: string) => void
}) {
  const map = useMap()
  const layerRef = useRef<ParcelPinsLayer | null>(null)
  // Read through a ref so a new callback never means a new layer.
  const onPinClickRef = useRef(onPinClick)
  useEffect(() => {
    onPinClickRef.current = onPinClick
  }, [onPinClick])

  useEffect(() => {
    const layer = new ParcelPinsLayer({ labelZoom: LABEL_ZOOM, onPinClick: (id) => onPinClickRef.current(id) })
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
    }
  }, [map])

  // A parcel with no market value on file has no price to show, so it stays a dot.
  const mapPins = useMemo<MapPin[]>(
    () => pins.map((p) => ({ id: p.key, lat: p.centroid[0], lng: p.centroid[1], label: p.marketValue > 0 ? formatUsdCompact(p.marketValue) : null })),
    [pins],
  )
  useEffect(() => {
    layerRef.current?.setPins(mapPins)
  }, [mapPins])

  const [firstId, secondId] = activeIds
  useEffect(() => {
    layerRef.current?.setActive([firstId ?? null, secondId ?? null])
  }, [firstId, secondId])

  return null
}

// react-leaflet sizes and auto-pans a popup the moment Leaflet opens it, which
// is before React has rendered anything into it - so an empty box gets panned
// into view and the card then grows off the edge of the map. Re-running
// Leaflet's update once the card is mounted re-measures it and pans the whole
// card into view.
function PopupContent({ popupRef, children }: { popupRef: RefObject<LeafletPopup | null>; children: ReactNode }) {
  useEffect(() => {
    popupRef.current?.update()
  }, [popupRef])
  return children
}

// The one open pin popup. `onClose` fires only when Leaflet closes this popup
// (a click elsewhere on the map, or a flight to another parcel) - not when a
// newer popup replaces it, since that one is a different Leaflet popup.
function PinPopup({ position, onClose, children }: { position: [number, number]; onClose: () => void; children: ReactNode }) {
  const popupRef = useRef<LeafletPopup>(null)
  useMapEvents({
    popupclose: (e) => {
      if (e.popup === popupRef.current) onClose()
    },
  })
  return (
    <Popup ref={popupRef} position={position} className="parcel-card-popup" closeButton={false} minWidth={288} maxWidth={288} offset={[0, -10]} autoPanPadding={[16, 16]}>
      <PopupContent popupRef={popupRef}>{children}</PopupContent>
    </Popup>
  )
}

// Flies to the outlined parcel's own bounds once per focus request - a new
// `focusToken`, bumped when a card is opened. Picking a pin on the map doesn't
// bump it (the operator is already looking at that spot, and its popup card
// is open there), so the outline arriving for a picked pin just draws in
// place. A request made before the parcel's detail has loaded waits for its
// outline to arrive, then flies.
//
// If the map is already zoomed in on something, it zooms out to the overview
// level first, then flies to the new parcel - a straight flyToBounds from a
// close-in view reads as a disorienting diagonal creep across the map. If
// it's already at the overview level, it flies straight there (nothing to
// zoom out of).
function FlyToOutline({ outline, focusToken }: { outline: AnalyzeRow | null; focusToken: number }) {
  const map = useMap()
  const flightIdRef = useRef(0)
  // The token already flown for - starts at the current one so mounting the
  // map never flies.
  const handledTokenRef = useRef(focusToken)

  useEffect(() => {
    if (focusToken === handledTokenRef.current) return
    if (!outline || outline.polygon.length === 0) return
    handledTokenRef.current = focusToken
    // A map hidden behind the list (the narrow list/map toggle) has no size to
    // fit bounds into; it keeps its own view until it's shown again.
    if (map.getSize().x === 0) return
    const flightId = ++flightIdRef.current
    const bounds = outline.polygon
    // Another parcel's card popup would otherwise ride along with the flight.
    map.closePopup()

    const flyIn = () => {
      // A newer selection superseded this one while the zoom-out phase was
      // still animating - let that one finish the flight instead.
      if (flightIdRef.current !== flightId) return
      map.flyToBounds(bounds, { maxZoom: MAP_MAX_ZOOM, duration: 0.6 })
    }

    if (map.getZoom() > MAP_ZOOMED_IN_THRESHOLD) {
      map.once('moveend', flyIn)
      map.flyTo(map.getCenter(), MAP_MIN_ZOOM, { duration: 0.4 })
    } else {
      flyIn()
    }
  }, [map, focusToken, outline])

  return null
}

// Leaflet only re-measures its container on window resize, but this map's box
// also changes with the layout around it: the list column switching between
// one and two cards wide, or the narrow list/map toggle hiding it entirely. A
// map that was mounted while hidden never got to fit its initial bounds (it
// had no size to fit them into), so it does that the first time it's shown.
function TrackContainerSize({ initialBounds, fitOptions }: { initialBounds: [number, number][] | null; fitOptions: FitBoundsOptions }) {
  const map = useMap()
  const boundsRef = useRef(initialBounds)
  const fitOptionsRef = useRef(fitOptions)

  useEffect(() => {
    const el = map.getContainer()
    let everSized = el.clientWidth > 0 && el.clientHeight > 0
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return
      // A window resize reports a new size every frame. Debouncing moveend
      // leaves the tiles to load once the size settles instead of refetching
      // at every intermediate width; the pins redraw on 'resize' regardless.
      map.invalidateSize({ debounceMoveend: true })
      if (!everSized) {
        everSized = true
        if (boundsRef.current) map.fitBounds(boundsRef.current, fitOptionsRef.current)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [map])

  return null
}

// Renders a pin per parcel (cheap - one canvas, see parcel-pins-layer.ts) plus,
// at most, one polygon outline for `outline` - never one outline per parcel.
// Rendering ~500 full parcel boundaries on this map at once was the main cost
// driving the Analyze/Overview map slowness; an operator only ever looks at
// one parcel's shape at a time, once they've picked it.
export function ParcelMapInner({
  pins = [],
  outline = null,
  selectedKey = null,
  hoveredKey = null,
  focusToken = 0,
  layersKey,
  defaultBase = 'map',
  onSelect,
  popup,
}: {
  pins?: AnalyzeSummaryRow[]
  outline?: AnalyzeRow | null
  // Parcel keys (parcel-key.ts), as are the pin ids handed to onSelect.
  selectedKey?: string | null
  // The parcel whose card the pointer is over - its pin lights up like the
  // selected one, so the user can see where a card sits on the map.
  hoveredKey?: string | null
  // Bumped by the caller whenever it wants the map to fly to `outline` (see
  // analyze-tab.tsx). Only meaningful when `onSelect` is passed - see the
  // FlyToOutline gate below.
  focusToken?: number
  // Where this map remembers the layers the user picked (see map-layers.tsx),
  // and the base map it shows until they pick one.
  layersKey: string
  defaultBase?: BaseLayer
  onSelect?: (key: string) => void
  // What a pin's popup shows when it's clicked - the parcel's card.
  popup?: (row: AnalyzeSummaryRow) => ReactNode
}) {
  const placedPins = useMemo(() => pins.filter((p): p is PlacedPin => p.centroid !== null), [pins])
  const fitsOutline = outline !== null && outline.polygon.length > 0
  const fitOptions = useMemo<FitBoundsOptions>(() => (fitsOutline ? {} : { maxZoom: PIN_FIT_MAX_ZOOM }), [fitsOutline])
  const initialBounds = outline && outline.polygon.length > 0
    ? outline.polygon
    : placedPins.length > 0
      ? placedPins.map((p) => p.centroid)
      : null

  // `click` numbers pin clicks so that re-clicking the pin whose popup is open
  // still reopens it. Leaflet closes the open popup on any map click before
  // the pin layer sees it, so one click sets this to null and then back to the
  // same id within a single batch - only a fresh key makes React mount a new
  // popup. The count lives in a ref because it has to survive that null.
  const [openPopup, setOpenPopup] = useState<{ id: string; click: number } | null>(null)
  const pinClicks = useRef(0)
  const handlePinClick = useCallback((id: string) => {
    pinClicks.current += 1
    setOpenPopup({ id, click: pinClicks.current })
    onSelect?.(id)
  }, [onSelect])
  const closePopup = useCallback(() => setOpenPopup(null), [])
  const popupRow = popup && openPopup ? placedPins.find((p) => p.key === openPopup.id) ?? null : null
  const [layers, setLayers] = useMapLayerChoice(layersKey, defaultBase)

  return (
    <div className="relative h-full w-full">
      <MapContainer
        {...(initialBounds ? { bounds: initialBounds, boundsOptions: fitOptions } : { center: FALLBACK_MAP_CENTER, zoom: 11 })}
        className="h-full w-full"
        scrollWheelZoom
        maxZoom={MAP_MAX_ZOOM}
        minZoom={MAP_MIN_ZOOM}
      >
        <MapLayers choice={layers} />
        <TrackContainerSize initialBounds={initialBounds} fitOptions={fitOptions} />
        {/* Only the interactive map (the one with pins to click) flies on
            selection - the detail dialog's single-outline map is static and
            already opens fitted to it via `bounds` above, so flying there too
            would just replay the same transition pointlessly on every open. */}
        {onSelect && <FlyToOutline outline={outline} focusToken={focusToken} />}
        {placedPins.length > 0 && <ParcelPins pins={placedPins} activeIds={[selectedKey, hoveredKey]} onPinClick={handlePinClick} />}
        {popup && popupRow && openPopup && (
          <PinPopup key={openPopup.click} position={popupRow.centroid} onClose={closePopup}>
            {popup(popupRow)}
          </PinPopup>
        )}
        {outline && outline.polygon.length > 0 && (
          <Polygon
            positions={outline.polygon}
            // Leaflet paints via raw SVG attributes rather than CSS, so this
            // needs literal color values instead of the app's CSS custom
            // properties.
            pathOptions={{ color: '#0ea5e9', weight: 3, fillOpacity: 0.35 }}
            interactive={false}
          />
        )}
      </MapContainer>
      <MapLayerControl choice={layers} onChange={setLayers} />
    </div>
  )
}
