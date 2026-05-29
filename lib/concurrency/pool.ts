export async function runPool<T>(
  total: number, limit: number,
  task: (index: number) => Promise<T>,
  onProgress?: (done: number, result: T, index: number) => void,
): Promise<T[]> {
  const results = new Array<T>(total)
  let next = 0, done = 0
  async function worker() {
    while (next < total) {
      const i = next++
      const r = await task(i)
      results[i] = r; done++
      onProgress?.(done, r, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, total) }, () => worker()))
  return results
}
