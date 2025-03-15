import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as path from 'path';

// Get current module's directory name
export function getDirname(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}

// Get project root directory (assuming this file is in /utils at project root)
export function getProjectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

// Resolve a path relative to project root
export function resolveProjectPath(...pathSegments) {
  return path.join(getProjectRoot(), ...pathSegments);
}

// Resolve path relative to current file
export function resolveFromFile(importMetaUrl, ...pathSegments) {
  return path.join(getDirname(importMetaUrl), ...pathSegments);
}
