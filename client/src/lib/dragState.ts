// This file manages drag state to coordinate between transform gizmo and free dragging

// Flag to track if gizmo is being dragged
let isGizmoActive = false;

// Get gizmo active state
export function isGizmoBeingDragged(): boolean {
  return isGizmoActive;
}

// Set gizmo active state
export function setGizmoActive(active: boolean): void {
  isGizmoActive = active;
} 