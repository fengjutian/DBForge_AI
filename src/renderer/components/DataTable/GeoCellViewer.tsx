// ============================================================
// GeoCellViewer — GEOMETRY cell display with Mini Map
// ============================================================

import React, { useState, useRef, useEffect } from 'react'
import { MapPin, Maximize2 } from 'lucide-react'
import { geometrySummary, isGeometryValue, parseWKT, parseGeoJSON, type GeoGeometry } from '../../utils/geometryParser'

interface GeoCellViewerProps {
  value: unknown
}

// ── Mini Map Canvas ──────────────────────────────────────────

function MiniMap({ geo }: { geo: GeoGeometry }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const pad = 16

    ctx.clearRect(0, 0, w, h)

    // Collect all coordinates
    const allCoords = collectCoords(geo.coordinates)
    if (allCoords.length === 0) return

    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of allCoords) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }

    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const scaleX = (w - pad * 2) / rangeX
    const scaleY = (h - pad * 2) / rangeY
    const scale = Math.min(scaleX, scaleY)

    const tx = (x: number) => pad + (x - minX) * scale
    const ty = (y: number) => h - pad - (y - minY) * scale

    // Draw grid
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 0.5
    for (let i = pad; i < w; i += 30) {
      ctx.beginPath(); ctx.moveTo(i, pad); ctx.lineTo(i, h - pad); ctx.stroke()
    }
    for (let i = pad; i < h; i += 30) {
      ctx.beginPath(); ctx.moveTo(pad, i); ctx.lineTo(w - pad, i); ctx.stroke()
    }

    // Draw geometry
    ctx.fillStyle = '#3b82f6'
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth = 2

    drawGeometry(ctx, geo.coordinates, tx, ty, scale)

    // Draw label at first point
    if (allCoords[0]) {
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(tx(allCoords[0][0]), ty(allCoords[0][1]), 3, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  return (
    <canvas ref={canvasRef} width={200} height={150}
      className="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
    />
  )
}

function collectCoords(coords: unknown): number[][] {
  if (!coords) return []
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
    return [coords as number[]]
  }
  if (Array.isArray(coords)) {
    // Check if array of coordinate pairs or nested
    if (Array.isArray(coords[0]) && coords[0].length >= 2 && typeof coords[0][0] === 'number') {
      return coords as number[][]
    }
    return (coords as unknown[]).flatMap(c => collectCoords(c))
  }
  return []
}

function drawGeometry(
  ctx: CanvasRenderingContext2D,
  coords: unknown,
  tx: (x: number) => number,
  ty: (y: number) => number,
  _scale: number
) {
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
    // Point
    ctx.beginPath()
    ctx.arc(tx(coords[0]), ty(coords[1]), 2.5, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  if (Array.isArray(coords)) {
    if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
      for (const ring of coords as number[][][]) {
        drawRing(ctx, ring, tx, ty)
      }
    } else if (Array.isArray(coords[0]) && coords[0].length >= 2 && typeof coords[0][0] === 'number') {
      drawRing(ctx, coords as number[][], tx, ty)
    }
  }
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  points: number[][],
  tx: (x: number) => number,
  ty: (y: number) => number
) {
  if (points.length === 0) return
  ctx.beginPath()
  ctx.moveTo(tx(points[0][0]), ty(points[0][1]))
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(tx(points[i][0]), ty(points[i][1]))
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'
  ctx.fill()
  ctx.stroke()
}

// ── GeoCellViewer ────────────────────────────────────────────

export default function GeoCellViewer({ value }: GeoCellViewerProps) {
  const [showMap, setShowMap] = useState(false)
  const str = typeof value === 'string' ? value : String(value ?? '')

  if (!isGeometryValue(str)) {
    return <span className="text-xs font-mono text-gray-400">{str}</span>
  }

  const info = geometrySummary(str)
  let geo: GeoGeometry | null = null
  if (str.startsWith('{')) {
    geo = parseGeoJSON(str)
  } else {
    geo = parseWKT(str)
  }

  return (
    <>
      <div className="group flex items-center gap-1 min-w-0">
        <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
          {info.summary}
        </span>
        {geo && (
          <button
            onClick={() => setShowMap(true)}
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="预览地图"
          >
            <Maximize2 className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {showMap && geo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowMap(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {info.type} · {info.summary}
              </span>
              <button onClick={() => setShowMap(false)}
                className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <MiniMap geo={geo} />
            {info.coords && (
              <div className="mt-2 text-[10px] font-mono text-gray-400 text-center">
                ({info.coords[0].toFixed(6)}, {info.coords[1].toFixed(6)})
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
