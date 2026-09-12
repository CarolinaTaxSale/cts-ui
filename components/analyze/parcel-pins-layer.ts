// A county's delinquent parcels as map pins, drawn onto one <canvas> instead of
// one DOM marker each. ~1-2k Leaflet markers meant ~1-2k absolutely positioned,
// box-shadowed elements that Leaflet repositioned one by one on every zoom, and
// that React added or removed one by one on every filter change - the main
// source of the Analyze tab's lag. Here a redraw is a loop of drawImage calls
// over pre-rendered pin sprites, and filtering is just a new array.
//
// Plain Leaflet (no React): the map component hands it pins and the highlighted
// ids, and it calls back with the id of a clicked pin. Hit-testing replaces the
// DOM markers' click targets, since the canvas itself ignores the pointer.

import { DomUtil, Layer, type LeafletEventHandlerFn, type LeafletMouseEvent, type Map as LeafletMap, type ZoomAnimEvent } from 'leaflet'

export type MapPin = {
  id: string
  lat: number
  lng: number
  // Price label shown once zoomed in; null keeps the pin a dot at every zoom.
  label: string | null
}

type Sprite = { image: HTMLCanvasElement; width: number; height: number; bodyWidth: number; bodyHeight: number }
type Hit = { id: string; left: number; top: number; right: number; bottom: number }
type Points = { xs: Float64Array; ys: Float64Array }

const PANE = 'parcelPins'
// The base map tiles are always light, whatever the app theme, so the pins use
// fixed colours rather than theme tokens (a light-cyan dark-theme primary would
// vanish on a pale street map): oklch(.36 .09 254) navy and oklch(.55 .2 28) red.
const PIN_COLOR = '#163e6b'
const ACTIVE_COLOR = '#cc2823'
// Selected and hovered pins draw a quarter larger, on top of the rest.
const ACTIVE_SCALE = 1.25
const DOT_SIZE = 12
const LABEL_HEIGHT = 22
// 6px of padding plus the 2px white border on each side of the price.
const LABEL_PADDING_X = 8
const LABEL_RADIUS = 8
// Room around each sprite for its drop shadow.
const SPRITE_MARGIN = 4
// A 12px dot is a small target, so clicks count within 18px of its centre.
const MIN_HIT = 18
const FONT = 'bold 11px Arial, Helvetica, sans-serif'
// leaflet.css animates a zoom with `transform .25s cubic-bezier(0,0,.25,1)`.
const ZOOM_ANIM_MS = 250
// The canvas grows and shrinks in steps of this many CSS pixels, so dragging
// the window's edge reallocates its backing store every so often rather than
// on every frame. Any overhang past the map is clipped by the map container.
const CANVAS_STEP = 256

// Progress (0-1) of Leaflet's zoom transition `t` of the way through it: the
// cubic-bezier(0, 0, 0.25, 1) timing function, solved for x by bisection.
function zoomEase(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  let lo = 0
  let hi = 1
  let u = t
  for (let i = 0; i < 20; i++) {
    u = (lo + hi) / 2
    const x = 0.75 * u * u + 0.25 * u * u * u
    if (x < t) lo = u
    else hi = u
  }
  return 3 * u * u - 2 * u * u * u
}

export class ParcelPinsLayer extends Layer {
  private readonly labelZoom: number
  private readonly onPinClick: (id: string) => void
  private pins: MapPin[] = []
  private activeIds = new Set<string>()
  private canvas: HTMLCanvasElement | null = null
  private dpr = 1
  // Pin boxes from the last full redraw, in container pixels, topmost last.
  private hits: Hit[] = []
  // map.project() of every pin, per whole zoom level the map has rested at.
  private projections = new Map<number, Points>()
  private sprites = new Map<string, Sprite>()
  private textWidths = new Map<string, number>()
  private measureContext: CanvasRenderingContext2D | null = null
  // The view (zoom, origin, pane offset, size) the canvas was last drawn for.
  private drawnView = ''
  private redrawFrame = 0
  private zoomFrame = 0
  private pointerOverPin = false

  constructor({ labelZoom, onPinClick }: { labelZoom: number; onPinClick: (id: string) => void }) {
    super()
    this.labelZoom = labelZoom
    this.onPinClick = onPinClick
  }

  setPins(pins: MapPin[]) {
    this.pins = pins
    this.projections.clear()
    this.drawNow()
  }

  setActive(ids: (string | null)[]) {
    this.activeIds = new Set(ids.filter((id): id is string => id !== null))
    this.drawNow()
  }

  onAdd(map: LeafletMap) {
    const pane = map.getPane(PANE) ?? map.createPane(PANE)
    // Above the selected parcel's outline (overlayPane, 400) and where markers
    // used to sit (markerPane, 600), below popups (popupPane, 700).
    pane.style.zIndex = '650'
    pane.style.pointerEvents = 'none'
    this.canvas = DomUtil.create('canvas', '', pane)
    this.drawNow()
    return this
  }

  onRemove(map: LeafletMap) {
    cancelAnimationFrame(this.redrawFrame)
    cancelAnimationFrame(this.zoomFrame)
    this.redrawFrame = 0
    this.canvas?.remove()
    this.canvas = null
    if (this.pointerOverPin) map.getContainer().style.cursor = ''
    this.pointerOverPin = false
    return this
  }

  getEvents() {
    return {
      // A flyTo or a pinch fires 'zoom' on every frame and lays the tiles out
      // again on the spot, so the pins redraw on the spot too - a frame later
      // and they would trail the map. A zoom animation ending lands here too.
      zoom: this.drawNow,
      // Everything else is batched to at most one draw per animation frame: a
      // window resize alone fires 'resize' and 'move' on every frame of the
      // drag. In between, the canvas rides along inside the map pane, so a
      // drag never shows pins out of place - at worst an edge not yet drawn.
      move: this.requestDraw,
      viewreset: this.requestDraw,
      resize: this.requestDraw,
      zoomanim: this.animateZoom as LeafletEventHandlerFn,
      click: this.handleClick as LeafletEventHandlerFn,
      mousemove: this.handleMouseMove as LeafletEventHandlerFn,
      mouseout: this.clearPointer,
      dragstart: this.clearPointer,
    }
  }

  private get map(): LeafletMap | null {
    return (this._map as LeafletMap | undefined) ?? null
  }

  // Redraws straight away - for new pins or highlights, and for zoom frames.
  private drawNow = () => {
    cancelAnimationFrame(this.redrawFrame)
    this.redrawFrame = 0
    this.draw(true)
  }

  private requestDraw = () => {
    if (this.redrawFrame) return
    this.redrawFrame = requestAnimationFrame(() => {
      this.redrawFrame = 0
      this.draw(false)
    })
  }

  // The canvas covers the visible map, pinned to its top-left corner. Unless
  // `force`d, a draw for a view the canvas already shows is skipped - a flyTo
  // frame's 'move' lands here right after its 'zoom' already drew.
  private draw(force: boolean) {
    const map = this.map
    const canvas = this.canvas
    if (!map || !canvas) return
    const size = map.getSize()
    const zoom = map.getZoom()
    const origin = map.getPixelOrigin()
    const pane = DomUtil.getPosition(map.getPane('mapPane')!)
    const view = `${zoom}|${origin.x},${origin.y}|${pane.x},${pane.y}|${size.x}x${size.y}`
    if (!force && view === this.drawnView) return
    cancelAnimationFrame(this.zoomFrame)
    DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))
    // A map hidden behind the list (the narrow list/map toggle) has no size;
    // it draws when a resize reveals it.
    if (!this.sizeCanvas(size.x, size.y)) return
    this.hits = this.paint(this.containerPoints(zoom), zoom >= this.labelZoom)
    this.drawnView = view
  }

  // A zoom button or the scroll wheel animates the tiles with a CSS transition
  // and fires no 'move' until it ends. Scaling the canvas along with them (what
  // Leaflet does for its own vector layers) would balloon every pin for a
  // moment, so instead each pin glides from where it is to where it will land,
  // on the transition's own easing - the way the DOM markers used to move.
  private animateZoom = (e: ZoomAnimEvent) => {
    const map = this.map
    if (!map || !this.canvas || map.getSize().x === 0) return
    cancelAnimationFrame(this.zoomFrame)
    const from = this.containerPoints(map.getZoom())
    // Where each pin lands once the zoom completes, in container pixels: what
    // Leaflet's private _latLngToNewLayerPoint computes for its markers.
    const target = this.projected(e.zoom)
    const centre = map.project(e.center, e.zoom)
    const size = map.getSize()
    const n = this.pins.length
    const toX = new Float64Array(n)
    const toY = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      toX[i] = target.xs[i] - centre.x + size.x / 2
      toY[i] = target.ys[i] - centre.y + size.y / 2
    }
    const showLabels = e.zoom >= this.labelZoom
    const current: Points = { xs: new Float64Array(n), ys: new Float64Array(n) }
    const start = performance.now()
    const frame = (now: number) => {
      const k = zoomEase((now - start) / ZOOM_ANIM_MS)
      for (let i = 0; i < n; i++) {
        current.xs[i] = from.xs[i] + (toX[i] - from.xs[i]) * k
        current.ys[i] = from.ys[i] + (toY[i] - from.ys[i]) * k
      }
      this.paint(current, showLabels)
      if (k < 1) this.zoomFrame = requestAnimationFrame(frame)
    }
    this.zoomFrame = requestAnimationFrame(frame)
  }

  private handleClick = (e: LeafletMouseEvent) => {
    const id = this.hitAt(e.containerPoint.x, e.containerPoint.y)
    if (id) this.onPinClick(id)
  }

  private handleMouseMove = (e: LeafletMouseEvent) => {
    this.setPointer(this.hitAt(e.containerPoint.x, e.containerPoint.y) !== null)
  }

  private clearPointer = () => this.setPointer(false)

  private setPointer(over: boolean) {
    const map = this.map
    if (!map || over === this.pointerOverPin) return
    this.pointerOverPin = over
    map.getContainer().style.cursor = over ? 'pointer' : ''
  }

  private hitAt(x: number, y: number): string | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]
      if (x >= h.left && x <= h.right && y >= h.top && y <= h.bottom) return h.id
    }
    return null
  }

  // Returns false (and draws nothing) while the map has no size.
  private sizeCanvas(mapWidth: number, mapHeight: number): boolean {
    const canvas = this.canvas
    if (!canvas || mapWidth === 0 || mapHeight === 0) return false
    this.dpr = window.devicePixelRatio || 1
    const width = Math.ceil(mapWidth / CANVAS_STEP) * CANVAS_STEP
    const height = Math.ceil(mapHeight / CANVAS_STEP) * CANVAS_STEP
    const pixelWidth = Math.round(width * this.dpr)
    const pixelHeight = Math.round(height * this.dpr)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    return true
  }

  // Every pin projected to world pixels at `zoom`. Whole zoom levels are cached
  // - that's where the map rests and pans - while the fractional levels a
  // flyTo passes through never repeat, so they aren't.
  private projected(zoom: number): Points {
    const cached = this.projections.get(zoom)
    if (cached) return cached
    const map = this.map!
    const n = this.pins.length
    const points: Points = { xs: new Float64Array(n), ys: new Float64Array(n) }
    for (let i = 0; i < n; i++) {
      const p = map.project([this.pins[i].lat, this.pins[i].lng], zoom)
      points.xs[i] = p.x
      points.ys[i] = p.y
    }
    if (Number.isInteger(zoom)) this.projections.set(zoom, points)
    return points
  }

  // Every pin in container pixels for the map as it is now - map.latLngToContainerPoint,
  // minus the per-pin projection when the zoom level is cached.
  private containerPoints(zoom: number): Points {
    const map = this.map!
    const world = this.projected(zoom)
    const origin = map.getPixelOrigin()
    const pane = DomUtil.getPosition(map.getPane('mapPane')!)
    const dx = pane.x - origin.x
    const dy = pane.y - origin.y
    const n = this.pins.length
    const points: Points = { xs: new Float64Array(n), ys: new Float64Array(n) }
    for (let i = 0; i < n; i++) {
      points.xs[i] = world.xs[i] + dx
      points.ys[i] = world.ys[i] + dy
    }
    return points
  }

  // Draws every on-screen pin at `points` and returns their hit boxes. Dots go
  // under price labels, and the selected / hovered pins over everything - the
  // stacking the DOM markers had.
  private paint(points: Points, showLabels: boolean): Hit[] {
    const canvas = this.canvas!
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    const width = canvas.width / this.dpr
    const height = canvas.height / this.dpr
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const hits: Hit[] = []
    const draw = (i: number, active: boolean) => {
      const pin = this.pins[i]
      const sprite = this.sprite(showLabels ? pin.label : null, active)
      const x = Math.round(points.xs[i])
      const y = Math.round(points.ys[i])
      if (x + sprite.width < 0 || y + sprite.height < 0 || x - sprite.width > width || y - sprite.height > height) return
      ctx.drawImage(sprite.image, x - sprite.width / 2, y - sprite.height / 2, sprite.width, sprite.height)
      const halfWidth = Math.max(sprite.bodyWidth, MIN_HIT) / 2
      const halfHeight = Math.max(sprite.bodyHeight, MIN_HIT) / 2
      hits.push({ id: pin.id, left: x - halfWidth, top: y - halfHeight, right: x + halfWidth, bottom: y + halfHeight })
    }

    const labelled: number[] = []
    const active: number[] = []
    for (let i = 0; i < this.pins.length; i++) {
      const pin = this.pins[i]
      if (this.activeIds.has(pin.id)) active.push(i)
      else if (showLabels && pin.label) labelled.push(i)
      else draw(i, false)
    }
    for (const i of labelled) draw(i, false)
    for (const i of active) draw(i, true)
    return hits
  }

  // A pin pre-rendered once per (label, active, pixel ratio) - a county has
  // only a few hundred distinct price labels - so drawing one is a single
  // drawImage. Same look as the old DOM pins: navy (or red when active) body,
  // 2px white border, white bold price, and a soft drop shadow.
  private sprite(label: string | null, active: boolean): Sprite {
    const key = `${label ?? ''}|${active ? 1 : 0}|${this.dpr}`
    const cached = this.sprites.get(key)
    if (cached) return cached

    const scale = active ? ACTIVE_SCALE : 1
    const w = label ? this.textWidth(label) + LABEL_PADDING_X * 2 : DOT_SIZE
    const h = label ? LABEL_HEIGHT : DOT_SIZE
    const bodyWidth = w * scale
    const bodyHeight = h * scale
    const width = bodyWidth + SPRITE_MARGIN * 2
    const height = bodyHeight + SPRITE_MARGIN * 2

    const image = document.createElement('canvas')
    image.width = Math.ceil(width * this.dpr)
    image.height = Math.ceil(height * this.dpr)
    const g = image.getContext('2d')!
    g.scale(this.dpr, this.dpr)
    g.translate(SPRITE_MARGIN, SPRITE_MARGIN)
    g.scale(scale, scale)
    g.beginPath()
    if (label) g.roundRect(1, 1, w - 2, h - 2, LABEL_RADIUS)
    else g.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2)
    // Shadow offsets and blur ignore the transform, so they're in device pixels.
    g.shadowColor = 'rgba(0, 0, 0, 0.45)'
    g.shadowBlur = 3 * this.dpr
    g.shadowOffsetY = this.dpr
    g.fillStyle = active ? ACTIVE_COLOR : PIN_COLOR
    g.fill()
    g.shadowColor = 'transparent'
    g.lineWidth = 2
    g.strokeStyle = '#fff'
    g.stroke()
    if (label) {
      g.fillStyle = '#fff'
      g.font = FONT
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(label, w / 2, h / 2 + 0.5)
    }

    const sprite = { image, width, height, bodyWidth, bodyHeight }
    this.sprites.set(key, sprite)
    return sprite
  }

  private textWidth(text: string): number {
    const cached = this.textWidths.get(text)
    if (cached !== undefined) return cached
    this.measureContext ??= document.createElement('canvas').getContext('2d')
    if (!this.measureContext) return text.length * 7
    this.measureContext.font = FONT
    const width = Math.ceil(this.measureContext.measureText(text).width)
    this.textWidths.set(text, width)
    return width
  }
}
