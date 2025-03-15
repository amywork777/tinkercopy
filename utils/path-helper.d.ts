/**
 * TypeScript declaration file for path-helper.js
 * Using a global declaration for all path-helper.js imports
 */

declare module '*path-helper.js' {
  /**
   * Get current module's directory name
   * @param importMetaUrl - The import.meta.url value
   * @returns The directory name of the current module
   */
  export function getDirname(importMetaUrl: string): string;

  /**
   * Get project root directory
   * @returns The project root directory path
   */
  export function getProjectRoot(): string;

  /**
   * Resolve a path relative to project root
   * @param pathSegments - Path segments to join with the project root
   * @returns The resolved absolute path
   */
  export function resolveProjectPath(...pathSegments: string[]): string;

  /**
   * Resolve path relative to current file
   * @param importMetaUrl - The import.meta.url value
   * @param pathSegments - Path segments to join with the current directory
   * @returns The resolved absolute path
   */
  export function resolveFromFile(importMetaUrl: string, ...pathSegments: string[]): string;
} 