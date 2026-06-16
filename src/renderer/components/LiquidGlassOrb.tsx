import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ── Props ──
interface LiquidGlassOrbProps {
  hovered?: boolean
  clickTrigger?: number
}

// ── Bright background for transmission ──
function SceneBackground() {
  const { scene } = useThree()
  React.useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const g = ctx.createRadialGradient(128, 100, 10, 128, 150, 200)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.15, '#ccfbf1')
    g.addColorStop(0.4, '#5eead4')
    g.addColorStop(0.7, '#14b8a6')
    g.addColorStop(1, '#0f766e')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
    const tex = new THREE.CanvasTexture(canvas)
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    scene.background = tex
    scene.environment = tex
    return () => {
      tex.dispose()
      scene.background = null
      scene.environment = null
    }
  }, [scene])
  return null
}

// ── Floating color bubbles inside ──
function InnerBubbles({ hovered }: { hovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null!)
  const bubbles = useMemo(() => {
    const items: {
      pos: THREE.Vector3
      baseSize: number
      speed: number
      phase: number
      color1: THREE.Color
      color2: THREE.Color
      orbitSpeed: number
      orbitAmp: number
    }[] = []
    const palette = [
      ['#5eead4', '#2dd4bf'],
      ['#2dd4bf', '#14b8a6'],
      ['#14b8a6', '#0d9488'],
      ['#0d9488', '#0f766e'],
      ['#f0fdfa', '#99f6e4'],
      ['#99f6e4', '#5eead4'],
      ['#ccfbf1', '#5eead4'],
      ['#a7f3d0', '#2dd4bf'],
      ['#6ee7b7', '#14b8a6'],
      ['#34d399', '#0d9488'],
      ['#fef3c7', '#fbbf24'],
      ['#fde68a', '#f59e0b'],
    ]
    for (let i = 0; i < 12; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 0.25 + Math.random() * 0.55
      items.push({
        pos: new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        ),
        baseSize: 0.03 + Math.random() * 0.06,
        speed: 0.4 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        orbitSpeed: 0.3 + Math.random() * 0.6,
        orbitAmp: 0.01 + Math.random() * 0.04,
        color1: new THREE.Color(palette[i][0]),
        color2: new THREE.Color(palette[i][1]),
      })
    }
    return items
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const speedMul = hovered ? 2.5 : 1.0

    groupRef.current.children.forEach((child, i) => {
      const b = bubbles[i]
      const mesh = child as THREE.Mesh

      // Organic floating motion
      child.position.set(
        b.pos.x + Math.cos(t * b.speed * 0.5 + b.phase) * b.orbitAmp * 2,
        b.pos.y + Math.sin(t * b.speed * 0.8 + b.phase) * b.orbitAmp * 3,
        b.pos.z + Math.cos(t * b.speed * 0.6 + b.phase + 1.2) * b.orbitAmp * 1.8
      )

      // Size breathing
      const breathe = 1 + Math.sin(t * b.orbitSpeed * 1.5 + b.phase) * 0.35
      const s = b.baseSize * breathe
      mesh.scale.setScalar(s)

      // Color shifting
      const colorMix = (Math.sin(t * 0.5 + b.phase) + 1) / 2
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.color.copy(b.color1).lerp(b.color2, colorMix)
      mat.emissive.copy(mat.color)
      mat.emissiveIntensity = 0.4 + colorMix * 0.5
    })

    // Rotation — faster on hover
    groupRef.current.rotation.y += 0.005 * speedMul
    groupRef.current.rotation.x += 0.002 * speedMul
    groupRef.current.rotation.z += 0.0015 * speedMul
  })

  return (
    <group ref={groupRef}>
      {bubbles.map((b, i) => (
        <mesh key={i} scale={b.baseSize}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial
            color={b.color1}
            emissive={b.color1}
            emissiveIntensity={0.5}
            roughness={0.15}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Orbital particle ring ──
function OrbitalRing({ hovered }: { hovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null!)
  const particles = useMemo(() => {
    const count = 28
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2
      return {
        angle,
        radius: 1.15 + Math.sin(i * 0.7) * 0.06,
        height: Math.cos(i * 1.3) * 0.2,
        size: 0.015 + Math.random() * 0.02,
        speed: 0.15 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        color: ['#5eead4', '#2dd4bf', '#f0fdfa', '#99f6e4', '#ccfbf1', '#a7f3d0'][i % 6],
      }
    })
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const speedMul = hovered ? 3.0 : 1.0

    groupRef.current.children.forEach((child, i) => {
      const p = particles[i]
      const mesh = child as THREE.Mesh
      const a = p.angle + t * p.speed * speedMul

      mesh.position.set(
        Math.cos(a) * p.radius,
        p.height + Math.sin(t * 0.8 + p.phase) * 0.08,
        Math.sin(a) * p.radius
      )

      // Pulsing glow
      const glow = 0.6 + Math.sin(t * 2 + p.phase) * 0.4
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = glow
    })

    // Wobble the whole ring
    groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.12
    groupRef.current.rotation.z = Math.cos(t * 0.35) * 0.1
    groupRef.current.rotation.y += 0.008 * speedMul
  })

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i} scale={p.size}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshStandardMaterial
            color={p.color}
            emissive={p.color}
            emissiveIntensity={0.8}
            roughness={0.05}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Click burst particles ──
function ClickBurst({ trigger }: { trigger: number }) {
  const groupRef = useRef<THREE.Group>(null!)
  const burstTimeRef = useRef(0)
  const particles = useMemo(() => {
    return Array.from({ length: 16 }, (_, i) => {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      return {
        dir: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi)
        ).normalize(),
        speed: 1.5 + Math.random() * 2.5,
        size: 0.02 + Math.random() * 0.04,
        color: ['#5eead4', '#f0fdfa', '#2dd4bf', '#99f6e4', '#fbbf24'][i % 5],
      }
    })
  }, [])

  // Reset burst on trigger change
  React.useEffect(() => {
    if (trigger > 0 && groupRef.current) {
      burstTimeRef.current = 0
      groupRef.current.visible = true
      groupRef.current.children.forEach((child) => {
        child.position.set(0, 0, 0)
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
        mat.opacity = 1
      })
    }
  }, [trigger])

  useFrame((_, delta) => {
    if (!groupRef.current || !groupRef.current.visible) return
    burstTimeRef.current += delta
    const age = burstTimeRef.current
    const duration = 0.7

    if (age > duration) {
      groupRef.current.visible = false
      return
    }

    const progress = age / duration
    groupRef.current.children.forEach((child, i) => {
      const p = particles[i]
      child.position.copy(p.dir.clone().multiplyScalar(p.speed * progress))
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
      mat.opacity = Math.max(0, 1 - progress)
      const s = p.size * (1 - progress * 0.6)
      child.scale.setScalar(s)
    })
  })

  return (
    <group ref={groupRef} visible={false}>
      {particles.map((p, i) => (
        <mesh key={i} scale={p.size}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshStandardMaterial
            color={p.color}
            emissive={p.color}
            emissiveIntensity={1.2}
            roughness={0.05}
            transparent
            opacity={1}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Glass sphere with full transparency ──
function GlassSphere({ hovered, clickTrigger }: { hovered: boolean; clickTrigger: number }) {
  const groupRef = useRef<THREE.Group>(null!)
  const scaleRef = useRef(1)
  const clickPulseRef = useRef(0)

  React.useEffect(() => {
    if (clickTrigger > 0) {
      clickPulseRef.current = 0.15 // pulse amount
    }
  }, [clickTrigger])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const speedMul = hovered ? 2.2 : 1.0

    // Rotation
    groupRef.current.rotation.y = Math.sin(t * 0.25 * speedMul) * (0.3 + (hovered ? 0.15 : 0))
    groupRef.current.rotation.x = Math.cos(t * 0.3 * speedMul) * (0.18 + (hovered ? 0.08 : 0))
    groupRef.current.rotation.z += (0.001 + (hovered ? 0.003 : 0)) * speedMul

    // Click pulse decay
    if (clickPulseRef.current > 0.001) {
      clickPulseRef.current *= Math.exp(-delta * 8)
      const pulse = 1 + clickPulseRef.current
      groupRef.current.scale.setScalar(pulse)
    } else if (clickPulseRef.current > 0) {
      clickPulseRef.current = 0
      groupRef.current.scale.setScalar(1)
    }

    // Subtle idle breathing when not hovered
    if (!hovered && clickPulseRef.current === 0) {
      const breathe = 1 + Math.sin(t * 0.6) * 0.03
      groupRef.current.scale.lerp(
        new THREE.Vector3(breathe, breathe, breathe),
        0.05
      )
    }
  })

  return (
    <group ref={groupRef}>
      {/* Tiny bright core */}
      <mesh renderOrder={0}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          color="#f0fdfa"
          emissive="#ccfbf1"
          emissiveIntensity={hovered ? 1.0 : 0.7}
          roughness={0.2}
        />
      </mesh>

      <InnerBubbles hovered={hovered} />
      <OrbitalRing hovered={hovered} />
      <ClickBurst trigger={clickTrigger} />

      {/* Glass shell — crystal clear */}
      <mesh renderOrder={2}>
        <sphereGeometry args={[1, 80, 80]} />
        <meshPhysicalMaterial
          color="#ffffff"
          roughness={0}
          metalness={0}
          transmission={1}
          thickness={0.4}
          ior={1.45}
          attenuationColor={new THREE.Color('#ccfbf1')}
          attenuationDistance={2}
          clearcoat={hovered ? 0.35 : 0.2}
          clearcoatRoughness={0}
          specularIntensity={hovered ? 1.6 : 1.2}
          specularColor={new THREE.Color('#ffffff')}
          envMapIntensity={hovered ? 2.8 : 2}
          depthWrite={true}
        />
      </mesh>
    </group>
  )
}

// ── Scene ──
function Scene({ hovered, clickTrigger }: { hovered: boolean; clickTrigger: number }) {
  return (
    <>
      <SceneBackground />
      <ambientLight intensity={hovered ? 0.7 : 0.5} />
      <directionalLight position={[5, 5, 5]} intensity={hovered ? 2.0 : 1.5} color="#ffffff" />
      <directionalLight position={[-3, -1, -3]} intensity={hovered ? 1.1 : 0.8} color="#ccfbf1" />
      <pointLight position={[3, 2, 3]} intensity={hovered ? 5.5 : 4} color="#ffffff" distance={10} />
      <pointLight position={[-2, -2, -1]} intensity={hovered ? 3 : 2} color="#5eead4" distance={8} />
      <GlassSphere hovered={hovered} clickTrigger={clickTrigger} />
    </>
  )
}

// ── Export ──
export default function LiquidGlassOrb({ hovered = false, clickTrigger = 0 }: LiquidGlassOrbProps): React.ReactElement {
  return (
    <div className="w-16 h-16 rounded-full overflow-hidden pointer-events-none">
      <Canvas
        dpr={[1.5, 3]}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: hovered ? 1.6 : 1.4
        }}
        camera={{ position: [0, 0, 3.2], fov: 38 }}
      >
        <Scene hovered={hovered} clickTrigger={clickTrigger} />
      </Canvas>
    </div>
  )
}
