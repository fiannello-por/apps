export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-canvas-white">
      {/* Blueprint grid — faint architectural texture, fading toward the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            'linear-gradient(#e5e5e5 1px, transparent 1px), linear-gradient(90deg, #e5e5e5 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage:
            'radial-gradient(ellipse 60% 55% at 50% 42%, #000 25%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 60% 55% at 50% 42%, #000 25%, transparent 100%)',
        }}
      />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
        {children}
      </div>
    </div>
  )
}
