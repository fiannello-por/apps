import { lightdashProxy } from '@/lib/lightdash/proxy'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  return lightdashProxy(req, (client) => client.getExplore(name))
}
