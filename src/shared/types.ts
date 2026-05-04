export type AgentStatus =
  | 'online'
  | 'offline'
  | 'idle'
  | 'editing'
  | 'reviewing'
  | 'waiting'
  | 'complete'
  | 'abandoned';

export type ClaimMode = 'edit' | 'review';

export interface Agent {
  id: string;
  name: string;
  repoPath: string;
  status: AgentStatus;
  currentFile?: string;
  reason?: string;
  waitingOn?: string;
  color: string;
  createdAt: number;
  lastSeen: number;
}

export interface Claim {
  id: string;
  agentId: string;
  agentName: string;
  repoPath: string;
  file: string;
  mode: ClaimMode;
  reason: string;
  status: 'active' | 'released';
  startedAt: number;
  releasedAt?: number;
  releaseSummary?: string;
  waiters: string[];
}

export interface Message {
  id: string;
  repoPath: string;
  from: string;
  fromName: string;
  to: string | null;
  body: string;
  ts: number;
  warnings?: string[];
}

export type ActivityKind =
  | 'online'
  | 'offline'
  | 'claim'
  | 'release'
  | 'msg'
  | 'dm'
  | 'status'
  | 'wait'
  | 'started'
  | 'complete'
  | 'abandon';

export interface ActivityEvent {
  id: string;
  repoPath: string;
  kind: ActivityKind;
  agentId: string;
  agentName: string;
  target?: string;
  body?: string;
  peer?: string;
  ts: number;
}

export type BroadcastEvent =
  | { type: 'agent'; repoPath: string; agent: Agent }
  | { type: 'claim'; repoPath: string; claim: Claim }
  | { type: 'release'; repoPath: string; claim: Claim }
  | { type: 'message'; repoPath: string; message: Message }
  | { type: 'activity'; repoPath: string; event: ActivityEvent }
  | { type: 'repo'; repoPath: string; basename: string }
  | { type: 'hello'; serverTime: number };

export interface ConflictDetail {
  conflict: true;
  holder: { agentId: string; agentName: string; mode: ClaimMode; reason: string; startedAt: number };
  claimId: string;
  queuePosition: number;
}
