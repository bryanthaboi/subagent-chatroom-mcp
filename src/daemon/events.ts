import { EventEmitter } from 'node:events';
import type { BroadcastEvent } from '../shared/types.js';

export class Bus extends EventEmitter {
  publish(ev: BroadcastEvent): void {
    this.emit('event', ev);
    this.emit(`repo:${ev.type === 'hello' ? '__all__' : ev.repoPath}`, ev);
  }
}
