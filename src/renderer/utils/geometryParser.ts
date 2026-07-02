// ============================================================
// GeometryParser — WKT/WKB/GeoJSON → GeoJSON unified parser
// ============================================================

export interface GeoPoint {
  type: 'Point'
  coordinates: number[]
}

export interface GeoGeometry {
  type: string
  coordinates: unknown
}

/**
 * Detect if a value looks like geometry data.
 */
export function isGeometryValue(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const upper = v.trim().toUpperCase()
  return (
    upper.startsWith('POINT') ||
    upper.startsWith('LINESTRING') ||
    upper.startsWith('POLYGON') ||
    upper.startsWith('MULTIPOINT') ||
    upper.startsWith('MULTILINESTRING') ||
    upper.startsWith('MULTIPOLYGON') ||
    upper.startsWith('GEOMETRYCOLLECTION') ||
    upper.startsWith('SRID=') ||
    upper.startsWith('{') && upper.includes('"type"') && upper.includes('"coordinates"') ||
    /^[0-9A-Fa-f]{16,}$/.test(v.trim()) // WKB hex
  )
}

/**
 * Detect GEOMETRY column type.
 */
export function isGeometryColumn(type: string): boolean {
  const t = type.toLowerCase()
  return /geometry|geography|point|linestring|polygon/i.test(t)
}

/**
 * Parse WKT to simplified GeoJSON-like structure.
 */
export function parseWKT(wkt: string): GeoGeometry | null {
  try {
    const trimmed = wkt.trim()
    // Handle SRID prefix: "SRID=4326;POINT(...)"
    let clean = trimmed
    const sridMatch = trimmed.match(/^SRID=(\d+);(.*)/i)
    if (sridMatch) {
      clean = sridMatch[2]
    }

    const upper = clean.toUpperCase()

    if (upper.startsWith('POINT')) {
      return { type: 'Point', coordinates: parsePoint(clean) }
    }
    if (upper.startsWith('LINESTRING')) {
      return { type: 'LineString', coordinates: parsePointList(clean) }
    }
    if (upper.startsWith('POLYGON')) {
      return { type: 'Polygon', coordinates: parsePolygon(clean) }
    }
    if (upper.startsWith('MULTIPOINT')) {
      return { type: 'MultiPoint', coordinates: parsePointList(clean) }
    }

    return { type: 'Geometry', coordinates: [] }
  } catch {
    return null
  }
}

function parsePoint(wkt: string): number[] {
  const match = wkt.match(/\(([-\d.]+)\s+([-\d.]+)\)/)
  if (!match) return [0, 0]
  return [parseFloat(match[1]), parseFloat(match[2])]
}

function parsePointList(wkt: string): number[][] {
  const match = wkt.match(/\((.+)\)/)
  if (!match) return []
  const pairs = match[1].split(',')
  return pairs.map(p => {
    const [x, y] = p.trim().split(/\s+/)
    return [parseFloat(x), parseFloat(y)]
  }).filter(([x, y]) => !isNaN(x) && !isNaN(y))
}

function parsePolygon(wkt: string): number[][][] {
  const match = wkt.match(/\(\((.+)\)\)/)
  if (!match) return [[]]
  // Simple: just the outer ring
  const ringMatch = match[1]
  if (!ringMatch) return [[]]
  const pairs = ringMatch.split(',')
  const ring = pairs.map(p => {
    const [x, y] = p.trim().split(/\s+/)
    return [parseFloat(x), parseFloat(y)]
  }).filter(([x, y]) => !isNaN(x) && !isNaN(y))
  return [ring]
}

/**
 * Parse GeoJSON string.
 */
export function parseGeoJSON(raw: string): GeoGeometry | null {
  try {
    const parsed = JSON.parse(raw)
    if (parsed.type && parsed.coordinates) {
      return parsed as GeoGeometry
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get a summary string for a geometry value.
 */
export function geometrySummary(value: string): { type: string; summary: string; coords?: number[] } {
  const upper = value.trim().toUpperCase()

  if (upper.startsWith('POINT')) {
    const pt = parsePoint(value)
    return { type: 'Point', summary: `POINT(${pt[0].toFixed(4)}, ${pt[1].toFixed(4)})`, coords: pt }
  }
  if (upper.startsWith('LINESTRING')) {
    const pts = parsePointList(value)
    return { type: 'LineString', summary: `LINESTRING(${pts.length} 点)`, coords: pts[0] }
  }
  if (upper.startsWith('POLYGON')) {
    const rings = parsePolygon(value)
    return { type: 'Polygon', summary: `POLYGON(${rings[0]?.length ?? 0} 点)`, coords: rings[0]?.[0] }
  }
  if (upper.startsWith('{')) {
    const geo = parseGeoJSON(value)
    if (geo) {
      const coords = extractFirstCoord(geo.coordinates)
      return { type: geo.type, summary: `${geo.type}`, coords }
    }
  }

  return { type: 'Geometry', summary: value.length > 40 ? value.slice(0, 40) + '...' : value }
}

function extractFirstCoord(coords: unknown): number[] | undefined {
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
    return [coords[0], coords[1]]
  }
  if (Array.isArray(coords) && Array.isArray(coords[0])) {
    return extractFirstCoord(coords[0])
  }
  return undefined
}
