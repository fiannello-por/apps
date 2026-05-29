'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { label: 'Explorer', href: '/explorer' },
  { label: 'Concurrency', href: '/concurrency' },
  { label: 'History', href: '/history' },
  { label: 'Connections', href: '/connections' },
] as const

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-subtle-ash bg-canvas-white">
      <div className="mx-auto flex h-11 max-w-6xl items-center gap-2 px-6">
        {/* Brand */}
        <span className="mr-2 text-sm font-semibold tracking-tight text-deep-black select-none">
          LD Perf
        </span>

        {/* Nav links */}
        <nav className="flex items-center gap-2">
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'rounded-md px-2 py-1 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'text-rich-black'
                    : 'text-midtone-gray hover:text-rich-black',
                ].join(' ')}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sign out */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/sign-in' })}
          className="text-[13px] text-midtone-gray hover:text-rich-black"
        >
          Sign out
        </Button>
      </div>
    </header>
  )
}
