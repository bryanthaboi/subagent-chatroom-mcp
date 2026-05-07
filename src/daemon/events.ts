import { EventEmitter } from 'node:events';
import type { BroadcastEvent } from '../shared/types.js';

export class Bus extends EventEmitter {
  publish(ev: BroadcastEvent): void {
    this.emit('event', ev);
    const channel = (ev.type === 'hello' || ev.type === 'settings') ? '__all__' : ev.repoPath;
    this.emit(`repo:${channel}`, ev);
  }
}
