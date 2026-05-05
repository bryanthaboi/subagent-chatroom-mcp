import type { State } from './state.js';
import type { Bus } from './events.js';
import type { Question, Message } from '../shared/types.js';
import { pickFollowUpPhrase } from './lexicon.js';

const FOLLOWUP_AFTER_MS = 5 * 60 * 1000;
const ESCALATE_AFTER_MS = 3 * 60 * 1000;
const EXPIRE_AFTER_MS = 5 * 60 * 1000;

export interface StartQuestionInput {
  askerId: string;
  repoPath: string;
  question: string;
}

export function startQuestion(
  state: State,
  bus: Bus,
  input: StartQuestionInput,
  now: number = Date.now()
): Question {
  const observer = state.findObserver(input.repoPath);
  if (observer) {
    const q = state.insertQuestion({
      askerId: input.askerId,
      repoPath: input.repoPath,
      question: input.question,
      observerId: observer.id,
      status: 'pending',
    });
    sendQuestionDm(state, bus, q.askerId, observer.id, input.question, q.repoPath);
    activity(state, bus, q.askerId, q.repoPath, 'asked observer');
    return state.getQuestion(q.id) ?? q;
  }
  const peer = state.pickEscalationPeer(input.repoPath, input.askerId);
  if (peer) {
    const q = state.insertQuestion({
      askerId: input.askerId,
      repoPath: input.repoPath,
      question: input.question,
      observerId: null,
      status: 'escalated',
    });
    state.updateQuestion(q.id, { escalated_at: now, escalated_to: peer.id });
    sendQuestionDm(
      state,
      bus,
      input.askerId,
      peer.id,
      `[escalated — no observer present] ${input.question}`,
      input.repoPath,
      ['auto:escalation']
    );
    activity(state, bus, input.askerId, input.repoPath, `escalated to ${peer.name}`);
    return state.getQuestion(q.id)!;
  }
  const q = state.insertQuestion({
    askerId: input.askerId,
    repoPath: input.repoPath,
    question: input.question,
    observerId: null,
    status: 'expired',
  });
  return q;
}

export function advanceQuestions(state: State, bus: Bus, now: number): void {
  for (const q of state.questionsByStatus(['pending'])) {
    if (now - q.sentAt > FOLLOWUP_AFTER_MS && q.observerId) {
      const phrase = pickFollowUpPhrase();
      sendQuestionDm(state, bus, q.askerId, q.observerId, phrase, q.repoPath, ['auto:follow-up']);
      state.updateQuestion(q.id, { status: 'following_up', follow_up_at: now });
      activity(state, bus, q.askerId, q.repoPath, 'follow-up sent');
    }
  }
  for (const q of state.questionsByStatus(['following_up'])) {
    const followUpAt = q.followUpAt ?? q.sentAt;
    if (now - followUpAt > ESCALATE_AFTER_MS) {
      const peer = state.pickEscalationPeer(q.repoPath, q.askerId);
      if (peer) {
        sendQuestionDm(
          state,
          bus,
          q.askerId,
          peer.id,
          `[escalated from observer] ${q.question}`,
          q.repoPath,
          ['auto:escalation']
        );
        state.updateQuestion(q.id, { status: 'escalated', escalated_at: now, escalated_to: peer.id });
        activity(state, bus, q.askerId, q.repoPath, `escalated to ${peer.name}`);
      } else {
        state.updateQuestion(q.id, { status: 'expired' });
        activity(state, bus, q.askerId, q.repoPath, 'expired (no peer available)');
      }
    }
  }
  for (const q of state.questionsByStatus(['escalated'])) {
    const escAt = q.escalatedAt ?? q.sentAt;
    if (now - escAt > EXPIRE_AFTER_MS) {
      state.updateQuestion(q.id, { status: 'expired' });
      activity(state, bus, q.askerId, q.repoPath, 'expired');
    }
  }
}

export function onMessageMaybeAnswer(state: State, bus: Bus, message: Message): void {
  if (!message.to) return;
  const askerId = message.to;
  const open = state.pendingQuestionsForAsker(askerId);
  for (const q of open) {
    if (message.ts < q.sentAt) continue;
    const fromExpected = message.from === q.observerId || message.from === q.escalatedTo;
    const isAuto = (message.warnings ?? []).some((w) => w.startsWith('auto:'));
    if (fromExpected && !isAuto) {
      state.updateQuestion(q.id, {
        status: 'answered',
        answered_at: message.ts,
        answer_message_id: message.id,
      });
      activity(state, bus, q.askerId, q.repoPath, 'answered');
      break;
    }
  }
}

function sendQuestionDm(
  state: State,
  bus: Bus,
  fromId: string,
  toId: string,
  body: string,
  repoPath: string,
  extraWarnings: string[] = []
): Message {
  const msg = state.addMessage({ repoPath, from: fromId, to: toId, body, warnings: extraWarnings });
  bus.publish({ type: 'message', repoPath: msg.repoPath, message: msg });
  const ev = state.addActivity({
    repoPath: msg.repoPath,
    kind: 'dm',
    agentId: msg.from,
    peer: msg.to ?? undefined,
    body: msg.body.slice(0, 200),
  });
  bus.publish({ type: 'activity', repoPath: msg.repoPath, event: ev });
  return msg;
}

function activity(state: State, bus: Bus, agentId: string, repoPath: string, body: string): void {
  const ev = state.addActivity({ repoPath, kind: 'question', agentId, body });
  bus.publish({ type: 'activity', repoPath, event: ev });
}
