import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting } from '../db'
import type { Campaign, ContentFormat, Platform } from './types'
import type { ContentSources } from './prompts'

export interface ContentPrefs { platforms: Platform[]; perWeek: number; formats: ContentFormat[] }
/** Preferenze indicate dall'artista: TikTok + Instagram, 1–2 contenuti a settimana, performance e visual. */
export const DEFAULT_PREFS: ContentPrefs = { platforms: ['tiktok', 'instagram'], perWeek: 2, formats: ['performance', 'visual'] }
export const getPrefs = () => getSetting<ContentPrefs>('contentPrefs', DEFAULT_PREFS)

export async function saveCampaign(c: Campaign, patch: Partial<Campaign>) {
  await db.campaigns.update(c.id, { ...patch, updatedAt: Date.now() })
}

/** Carica progetto, brano (con l'ultima versione analizzata) e video collegati alla campagna. */
export function useSources(c: Campaign | undefined | null): ContentSources | undefined {
  return useLiveQuery(async () => {
    if (!c) return undefined
    const project = await db.projects.get(c.projectId)
    const track = c.trackId ? await db.tracks.get(c.trackId) : undefined
    const version = track ? [...(await db.versions.where('trackId').equals(track.id).sortBy('createdAt'))].reverse().find((v) => v.analysis) : undefined
    const video = c.videoId ? await db.videos.get(c.videoId) : undefined
    return { project, track, version, video }
  }, [c?.projectId, c?.trackId, c?.videoId, c?.updatedAt])
}
