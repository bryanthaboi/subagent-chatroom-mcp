export type AgentStatus =
  | 'online'
  | 'offline'
  | 'idle'
  | 'editing'
  | 'reviewing'
  | 'waiting'
  | 'complete'
  | 'abandoned'
  | 'away';

export type AgentRole = 'agent' | 'observer';

export type ClaimMode = 'edit' | 'review';

export interface Agent {
  id: string;
  name: string;
  repoPath: string;
  status: AgentStatus;
  role: AgentRole;
  currentFile?: string;
  reason?: string;
  waitingOn?: string;
  color: string;
  awayMessage?: string;
  awaySince?: number;
  signedOffAt?: number;
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
  | 'away'
  | 'claim'
  | 'release'
  | 'msg'
  | 'dm'
  | 'status'
  | 'wait'
  | 'started'
  | 'complete'
  | 'abandon'
  | 'resurrect'
  | 'delete'
  | 'question';

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

export type QuestionStatus = 'pending' | 'following_up' | 'escalated' | 'answered' | 'expired';

export interface Question {
  id: string;
  askerId: string;
  repoPath: string;
  question: string;
  observerId: string | null;
  status: QuestionStatus;
  sentAt: number;
  followUpAt?: number;
  escalatedAt?: number;
  escalatedTo?: string;
  answeredAt?: number;
  answerMessageId?: string;
}

export interface InboxSummary {
  unread: number;
  latestFrom?: string;
  latestTs?: number;
}

export type BroadcastEvent =
  | { type: 'agent'; repoPath: string; agent: Agent }
  | { type: 'agent-deleted'; repoPath: string; agentId: string }
  | { type: 'claim'; repoPath: string; claim: Claim }
  | { type: 'release'; repoPath: string; claim: Claim }
  | { type: 'message'; repoPath: string; message: Message }
  | { type: 'activity'; repoPath: string; event: ActivityEvent }
  | { type: 'repo'; repoPath: string; basename: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'hello'; serverTime: number };

export interface ConflictDetail {
  conflict: true;
  holder: { agentId: string; agentName: string; mode: ClaimMode; reason: string; startedAt: number };
  claimId: string;
  queuePosition: number;
}

// ---------- Settings ----------

export interface Settings {
  'theme.active': string;
  'theme.externalDir': string | null;
  'audio.enabled': boolean;
  'debug.devlog': boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  'theme.active': 'aol',
  'theme.externalDir': null,
  'audio.enabled': true,
  'debug.devlog': false,
};

// ---------- Themes ----------

export const THEME_COMPAT_VERSION = 1;

export type ThemeSource = 'bundled' | 'external';

export interface ThemeManifest {
  name: string;
  displayName: string;
  version: string;
  author?: string;
  description?: string;
  extends: string | null;
  layout: 'multiwindow' | 'singlewindow';
  css: string;
  shell?: string;
  assets?: string;
  audio?: Record<string, string>;
  compatVersion: number;
}

export interface DiscoveredTheme {
  name: string;
  source: ThemeSource;
  dir: string;
  manifest: ThemeManifest;
  valid: boolean;
  invalidReason?: string;
}

export interface ResolvedTheme {
  active: {
    name: string;
    source: ThemeSource;
    cssUrls: string[];
    shellUrl: string;
    audio: Record<string, string>;
    manifest: ThemeManifest;
  };
  base: { name: string; source: ThemeSource } | null;
  warnings: string[];
}
