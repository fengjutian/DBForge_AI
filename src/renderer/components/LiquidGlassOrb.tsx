import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ── Bright background for transmission ──
function SceneBackground() {
  const { scene } = useThree()
  React.useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    // Bright, airy gradient — glass transmits this
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
function InnerBubbles() {
  const groupRef = useRef<THREE.Group>(null!)
  const bubbles = useMemo(() => {
    const items: { pos: THREE.Vector3; size: number; speed: number; phase: number; color: string }[] = []
    for (let i = 0; i < 6; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 0.2 + Math.random() * 0.5
      items.push({
        pos: new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        ),
        size: 0.04 + Math.random() * 0.05,
        speed: 0.5 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        color: ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#f0fdfa', '#99f6e4'][i]
      })
    }
    return items
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    groupRef.current.children.forEach((child, i) => {
      const b = bubbles[i]
      child.position.set(
        b.pos.x + Math.cos(t * b.speed * 0.5 + b.phase) * 0.02,
        b.pos.y + Math.sin(t * b.speed + b.phase) * 0.03,
        b.pos.z + Math.cos(t * b.speed * 0.7 + b.phase + 1) * 0.015
      )
    })
    groupRef.current.rotation.y += 0.004
  })

  return (
    <group ref={groupRef}>
      {bubbles.map((b, i) => (
        <mesh key={i} scale={b.size}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color={b.color}
            emissive={b.color}
            emissiveIntensity={0.6}
            roughness={0.1}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Glass sphere with full transparency ──
function GlassSphere() {
  const groupRef = useRef<THREE.Group>(null!)

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    groupRef.current.rotation.y = Math.sin(t * 0.25) * 0.3
    groupRef.current.rotation.x = Math.cos(t * 0.3) * 0.18
    groupRef.current.rotation.z += 0.001
  })

  return (
    <group ref={groupRef}>
      {/* Tiny bright core */}
      <mesh renderOrder={0}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          color="#f0fdfa"
          emissive="#ccfbf1"
          emissiveIntensity={0.7}
          roughness={0.2}
        />
      </mesh>

      <InnerBubbles />

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
          clearcoat={0.2}
          clearcoatRoughness={0}
          specularIntensity={1.2}
          specularColor={new THREE.Color('#ffffff')}
          envMapIntensity={2}
          depthWrite={true}
        />
      </mesh>
    </group>
  )
}

// ── Scene ──
function Scene() {
  return (
    <>
      <SceneBackground />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} color="#ffffff" />
      <directionalLight position={[-3, -1, -3]} intensity={0.8} color="#ccfbf1" />
      <pointLight position={[3, 2, 3]} intensity={4} color="#ffffff" distance={10} />
      <pointLight position={[-2, -2, -1]} intensity={2} color="#5eead4" distance={8} />
      <GlassSphere />
    </>
  )
}

// ── Export ──
export default function LiquidGlassOrb(): React.ReactElement {
  return (
    <div className="w-16 h-16 rounded-full overflow-hidden pointer-events-none">
      <Canvas
        dpr={[1.5, 3]}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.4
        }}
        camera={{ position: [0, 0, 3.2], fov: 38 }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}
