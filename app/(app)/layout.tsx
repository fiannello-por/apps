import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Nav } from '@/components/nav'
import { Toaster } from '@/components/ui/sonner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/sign-in')

  return (
    <div className="min-h-screen bg-background">
      <Nav
        user={{
          name: session.user?.name,
          email: session.user?.email,
          image: session.user?.image,
        }}
      />
      <main className="mx-auto max-w-6xl px-6 py-8 lg:py-10">{children}</main>
      <Toaster />
    </div>
  )
}
