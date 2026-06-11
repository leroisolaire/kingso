const VIDEOS = [
  '/kingso-start2.mp4',
  '/kingso22.mp4',
  '/kingso-thinking.mp4',
  '/kingso-talking.mp4',
  '/kingso-happy.mp4',
  '/kingso-confused.mp4',
  '/kingso-bored.mp4',
]

export default function VideoPreloader() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
      {VIDEOS.map((src) => (
        <video key={src} preload="auto" muted playsInline>
          <source src={src} type="video/mp4" />
        </video>
      ))}
    </div>
  )
}
