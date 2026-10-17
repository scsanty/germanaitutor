// Spec: an uploaded recording is at most 20 MB (the sidecar's /convert takes up to 25 MB).
// Client-safe: the admin upload form checks it before sending, the route enforces it.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
