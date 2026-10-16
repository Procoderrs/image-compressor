/**
 * formatSize
 * ----------
 * Turns a raw file size (a number in bytes) into text a person can read.
 *
 *   500        ->  "500 bytes"
 *   65502      ->  "64.0 KB"
 *   2097152    ->  "2.0 MB"
 *
 * Used in: ImageUploader.jsx (cards and the comparison box).
 *
 * Why it lives in /lib:
 *   It is pure logic. It has no UI and no state, so any component can import it.
 *   Keep the NUMBER in state and format it only when you show it. That way maths
 *   such as the "-91%" percentage still works on real numbers, not on text.
 */
export default function formatSize(bytes) {
  // Case 1: smaller than 1 KB (1 KB = 1024 bytes) -> show plain bytes
  if (bytes < 1024) {
    return `${bytes} bytes`
  }

  // Case 2: smaller than 1 MB (1024 * 1024 bytes) -> show KB
  // The order matters: this only runs if Case 1 was false, so bytes >= 1024 here.
  else if (bytes < 1024 * 1024) {
    const kb = bytes / 1024 // bytes -> KB: divide by 1024 once
    return `${kb.toFixed(1)} KB` // toFixed(1) keeps one decimal, e.g. "64.0"
  }

  // Case 3: everything else is 1 MB or bigger -> show MB
  // No condition is needed. Cases 1 and 2 already caught the smaller values.
  else {
    const mb = bytes / 1024 / 1024 // bytes -> KB -> MB: divide by 1024 twice
    return `${mb.toFixed(1)} MB`
  }
}