import { useEffect, useState } from 'react'
import { db, uid } from '../db'
import { dominantColors, shrinkImage } from './palette'

/** URL temporaneo per mostrare un'immagine salvata nel database locale. */
export function useImageUrl(imageId: string | undefined): string | undefined {
  const [state, setState] = useState<{ id: string; url: string }>()
  useEffect(() => {
    if (!imageId) return
    let alive = true
    let made: string | undefined
    db.videoImages.get(imageId).then((row) => {
      if (!alive || !row) return
      made = URL.createObjectURL(row.blob)
      setState({ id: imageId, url: made })
    })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [imageId])
  return state && state.id === imageId ? state.url : undefined
}

const MAX_BYTES = 25 * 1024 * 1024

/** Salva un'immagine caricata (ridotta se enorme) e ne misura i colori dominanti. */
export async function storeImage(videoId: string, file: File): Promise<{ imageId: string; colors: string[] }> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" non è un'immagine.`)
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" è troppo grande (massimo 25 MB).`)
  let blob: Blob
  let colors: string[] = []
  try {
    blob = await shrinkImage(file)
    colors = await dominantColors(blob)
  } catch {
    throw new Error(`Non riesco a leggere "${file.name}". Prova con un JPG o PNG.`)
  }
  const imageId = uid()
  await db.videoImages.add({ id: imageId, videoId, blob })
  return { imageId, colors }
}
