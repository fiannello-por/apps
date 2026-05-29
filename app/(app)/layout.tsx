import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Nav } from '@/components/nav'
import { Toaster } from '@/components/ui/sonner'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/sign-in')

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <Toaster />
    </>
  )
}
