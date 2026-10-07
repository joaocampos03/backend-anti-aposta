import type { Clock } from '../application/clock.port.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
