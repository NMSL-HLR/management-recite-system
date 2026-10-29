import { BACKUP_KEY, DATA_KEY, type Kv } from '../engine/storage'
import { FUSION_BACKUP_KEY, JOURNAL_KEY, PLATFORM_KEY } from '../fusion/types'

export const RECOVERY_KEYS = [PLATFORM_KEY, DATA_KEY, '346-study-before-v1', 'pku346-content-before-repair-v1', JOURNAL_KEY, FUSION_BACKUP_KEY, BACKUP_KEY,
  'ms346_points_v1', 'ms346_logs_v1', 'ms346_logs_archive_v1', 'ms346_subjects_v1', 'ms346_settings_v1', 'ms346_confusion_sets_v1'] as const

/** Read verbatim: damaged JSON and unfinished transaction journals are evidence. Never write here. */
export function collectRecovery(read: Kv['getItem']) {
  const raw: Record<string, string | null> = {}
  const readErrors: Record<string, string> = {}
  for (const key of RECOVERY_KEYS) {
    try { raw[key] = read(key) }
    catch (error) { readErrors[key] = error instanceof Error ? error.message : String(error) }
  }
  return { format: '346-fusion-recovery', exportedAt: new Date().toISOString(), raw, readErrors }
}
