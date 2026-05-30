export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-callout-red/20 bg-callout-red/[0.04] px-3.5 py-2.5 text-[13px] leading-snug text-callout-red"
    >
      {message}
    </div>
  )
}

export function GoogleButton({
  onClick,
  loading,
  label = 'Continue with Google',
}: {
  onClick: () => void
  loading?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="group inline-flex h-11 w-full items-center justify-center gap-3 rounded-[10px] border border-subtle-ash bg-canvas-white text-[14px] font-medium text-rich-black shadow-[0_1px_2px_rgba(10,10,10,0.05)] transition-all duration-150 hover:border-midtone-gray/40 hover:bg-ghost-gray hover:shadow-[0_3px_10px_-4px_rgba(10,10,10,0.18)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-black/10 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid place-items-center transition-transform duration-150 group-hover:scale-105">
        <GoogleIcon />
      </span>
      {loading ? 'Redirecting…' : label}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
