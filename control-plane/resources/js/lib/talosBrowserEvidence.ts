import type { TalosBrowserActivity } from './talosTypes'

function isSuccessfulScreenshot(activity: TalosBrowserActivity) {
    return activity.operation === 'screenshot'
        && activity.status === 'succeeded'
        && activity.artifact_ids.length > 0
}

export function mergePersistedBrowserEvidenceWithCurrentFrame(
    persisted: TalosBrowserActivity[],
    live: TalosBrowserActivity[],
): TalosBrowserActivity[] {
    const result = persisted.filter(isSuccessfulScreenshot)
    const current = [...live].reverse().find(isSuccessfulScreenshot)
    if (!current) return result

    const persistedArtifacts = new Set(result.flatMap((activity) => activity.artifact_ids))
    if (current.artifact_ids.some((artifactId) => persistedArtifacts.has(artifactId))) return result
    return [...result, current]
}
