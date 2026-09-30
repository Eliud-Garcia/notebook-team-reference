import { fetchRepo } from '@/lib/github'

export const dynamic = 'force-dynamic'

export async function GET (request) {
  const { searchParams } = new URL(request.url)
  try {
    const repo = await fetchRepo(
      searchParams.get('repo') || '',
      searchParams.get('folder') || ''
    )
    return Response.json(repo)
  } catch (err) {
    return Response.json({ error: err.message || 'No se pudo leer el repositorio.' }, { status: 400 })
  }
}
