import type { DriverDeliveryEvent } from '@gestor/types';

const seenEventIds = new Set<string>();
const MAX_SEEN_EVENTS = 100;

export function acceptDriverDeliveryEvent(event: DriverDeliveryEvent): boolean {
  if (seenEventIds.has(event.eventId)) return false;
  seenEventIds.add(event.eventId);
  if (seenEventIds.size > MAX_SEEN_EVENTS) {
    const oldest = seenEventIds.values().next().value;
    if (typeof oldest === 'string') seenEventIds.delete(oldest);
  }
  return true;
}

export function processDriverDeliveryEvent(
  event: DriverDeliveryEvent,
  handlers: {
    onEvent: (event: DriverDeliveryEvent) => void;
    onAssignment: () => void;
  },
): boolean {
  if (!acceptDriverDeliveryEvent(event)) return false;
  handlers.onEvent(event);
  if (event.type === 'delivery.assigned') handlers.onAssignment();
  return true;
}

const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
let sharedAudioContext: AudioContext | null = null;

export function initSharedAudioContext() {
  if (!sharedAudioContext && AudioContextClass) {
    sharedAudioContext = new AudioContextClass();
  }
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
}

export function playAssignmentSound() {
  if (!sharedAudioContext) initSharedAudioContext();
  const context = sharedAudioContext;
  if (!context) return;
  
  if (context.state === 'suspended') {
    context.resume().catch(() => {});
  }
  
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
  } catch (e) {
    // Ignore audio context errors
  }
}
