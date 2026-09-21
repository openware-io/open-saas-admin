export function parseStoredJson(value, fallback = null) {
  try {
    return JSON.parse(value || 'null') ?? fallback
  } catch {
    return fallback
  }
}
