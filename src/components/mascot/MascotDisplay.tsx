'use client'

import Image from 'next/image'
import type { MascotState } from '@/types/chat'

/* Associe chaque état à une vidéo dans /public
   Ajouter les autres vidéos au fur et à mesure */
const VIDEO_STATES: Partial<Record<MascotState, string>> = {
  idle: '/kingso22.mp4',
  // thinking : '/kingso-thinking.mp4',
  // happy    : '/kingso-happy.mp4',
  // wave     : '/kingso-wave.mp4',
}

/* Orbites orange LRS (état "thinking" sans vidéo) */
const ORBIT_PARTICLES = [
  { r: '108px', duration: 3.0, delay: '0s',   size: 10, color: '#e73e11' },
  { r: '132px', duration: 4.6, delay: '0.5s', size: 7,  color: '#ff6b3d' },
  { r:  '94px', duration: 3.4, delay: '1.0s', size: 9,  color: '#ff8c5a' },
  { r: '142px', duration: 5.2, delay: '1.5s', size: 5,  color: '#e73e11' },
  { r: '118px', duration: 4.0, delay: '2.0s', size: 8,  color: '#ff5525' },
  { r: '100px', duration: 2.7, delay: '0.7s', size: 6,  color: '#c42e0a' },
]

const SPARKLES = ['✨', '⭐', '✨', '🌟', '✨', '⭐']

interface MascotDisplayProps {
  state: MascotState
  size?: number
}

export default function MascotDisplay({ state, size = 260 }: MascotDisplayProps) {
  const videoSrc = VIDEO_STATES[state]

  /* Animations CSS appliquées quand pas de vidéo */
  const motionClass = {
    idle:     'mascot-float glow-idle',
    thinking: 'mascot-thinking glow-intense',
    happy:    'mascot-happy glow-intense',
    wave:     'mascot-wave glow-idle',
  }[state]

  /* Glow appliqué même sur la vidéo */
  const glowClass = {
    idle:     'glow-idle',
    thinking: 'glow-intense',
    happy:    'glow-intense',
    wave:     'glow-idle',
  }[state]

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      {/* Orbites (état thinking, fallback image uniquement) */}
      {!videoSrc && state === 'thinking' && (
        <div className="absolute pointer-events-none" style={{ top: '50%', left: '50%' }}>
          {ORBIT_PARTICLES.map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: p.size, height: p.size,
                marginTop: -p.size / 2, marginLeft: -p.size / 2,
                backgroundColor: p.color,
                boxShadow: `0 0 ${p.size * 3}px ${p.color}70`,
                animation: `orbit ${p.duration}s linear ${p.delay} infinite`,
                '--orbit-r': p.r,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Étincelles victoire */}
      {state === 'happy' && SPARKLES.map((s, i) => (
        <span
          key={i}
          className="absolute text-xl pointer-events-none"
          style={{
            left: `${8 + i * 16}%`,
            bottom: '10%',
            animation: `sparkle-up 1.1s ease-out ${i * 0.12}s forwards`,
          }}
        >
          {s}
        </span>
      ))}

      {/* ── Vidéo disponible ── */}
      {videoSrc ? (
        <div
          className="relative"
          style={{ width: size, height: size }}
        >
          {/* Pas de filter/glow sur le parent : un filter CSS casse mix-blend-mode sur l'enfant */}
          <video
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              mixBlendMode: 'multiply',
            }}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        </div>
      ) : (
        /* ── Fallback image statique ── */
        <Image
          src="/kingso.png"
          alt="Kingso"
          width={size}
          height={size}
          className={motionClass}
          priority
          style={{ objectFit: 'contain', position: 'relative', zIndex: 1 }}
        />
      )}
    </div>
  )
}
