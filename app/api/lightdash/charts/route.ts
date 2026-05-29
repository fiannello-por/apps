import { lightdashProxy } from '@/lib/lightdash/proxy'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return lightdashProxy(req, (client) => client.listCharts())
}
