// Simple event system for cross-component communication
type EventCallback = () => void;
type EventMap = {
  [key: string]: EventCallback[];
};

class EventBus {
  private events: EventMap = {};

  // Subscribe to an event
  on(event: string, callback: EventCallback): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  // Unsubscribe from an event
  off(event: string, callback: EventCallback): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  // Emit an event
  emit(event: string): void {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => callback());
  }
}

// Create a singleton instance
export const eventBus = new EventBus();

// Define event names
export const EVENTS = {
  REFRESH_DRAFTS: 'refresh_drafts',
}; 