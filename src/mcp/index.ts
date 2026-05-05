#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AolClient } from '../shared/client.js';

const COORD_RULES = `\
AOL coordination rules (apply to every tool call):
- Claim a file BEFORE editing. If conflict, you MUST wait for release or revise your plan.
- Messages between agents: short, plain prose, NO fenced code blocks, NO copied diffs.
- After someone finishes a claim, re-read the tree before duplicating their change.
- If a peer goes quiet on a claim, DM them with a short check-in including the file and elapsed time.
- Before registering, call aol_find_reusable_agent — reuse an away/offline buddy if one fits.
- When stuck, call aol_ask_observer instead of guessing.
- Call aol_check_inbox between major actions and reply to any DM addressed to you.\
`;

function txt(body: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body, null, 2) }] };
}

async function withInbox(
  client: AolClient,
  agentId: string | undefined,
  body: unknown
): Promise<unknown> {
  if (!agentId || typeof body !== 'object' || body === null) return body;
  try {
    const summ = await client.getInboxSummary(agentId, 0);
    return { ...(body as Record<string, unknown>), inbox: summ };
  } catch {
    return body;
  }
}

async function main(): Promise<void> {
  const client = new AolClient();
  const server = new McpServer({ name: 'aol', version: '0.2.0' });

  server.registerTool(
    'aol_register_agent',
    {
      title: 'Register agent online',
      description: `Register this sub-agent online in AOL. Pass role='observer' if you are the human watcher. Before calling this with a fresh name, prefer aol_find_reusable_agent to revive an away/offline buddy. ${COORD_RULES}`,
      inputSchema: {
        name: z.string().describe('Display name shown to peers'),
        repoPath: z.string().describe('Absolute path to the repo this agent is working in'),
        id: z.string().optional().describe('Stable id; pass to keep one identity across calls (also used for resurrecting away/offline buddies)'),
        color: z.string().optional(),
        role: z.enum(['agent', 'observer']).optional(),
      },
    },
    async (args) => {
      const r = await client.registerAgent(args);
      const agentId = (r as any)?.agent?.id ?? args.id;
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_set_offline',
    {
      title: 'Step away',
      description:
        'Step away — sets your status to "away" with a 90s-themed away message (override with awayMessage). After 15 min idle the daemon flips you to fully offline. Both states are revivable by future sub-agents.',
      inputSchema: { agentId: z.string(), awayMessage: z.string().optional() },
    },
    async ({ agentId, awayMessage }) => {
      const r = await client.setOffline(agentId, awayMessage);
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_update_status',
    {
      title: 'Update agent status',
      description:
        'Update lifecycle status without claiming a file. Use waitingOn to point at the agent you are blocked behind.',
      inputSchema: {
        agentId: z.string(),
        status: z.enum(['online', 'idle', 'editing', 'reviewing', 'waiting', 'complete', 'abandoned', 'away']),
        currentFile: z.string().optional(),
        reason: z.string().optional(),
        waitingOn: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, ...rest } = args;
      const r = await client.setStatus(agentId, rest);
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_claim_file',
    {
      title: 'Claim a file (edit or review)',
      description: `Declare intent to edit (or review) a file. ${COORD_RULES} If a conflict is returned, do not edit — either wait_for_release or post in the room and revise.`,
      inputSchema: {
        agentId: z.string(),
        file: z.string().describe('Repo-relative file path'),
        mode: z.enum(['edit', 'review']).default('edit'),
        reason: z.string().describe('Plain-language reason — what you intend, why'),
      },
    },
    async (args) => {
      try {
        const r = await client.claimFile(args);
        return txt(await withInbox(client, args.agentId, { ok: true, ...r }));
      } catch (e: any) {
        if (e.status === 409) return txt(await withInbox(client, args.agentId, { ok: false, ...e.conflict }));
        throw e;
      }
    }
  );

  server.registerTool(
    'aol_release_file',
    {
      title: 'Release a file claim',
      description: 'Release your active claim. Optional summary describes what changed (in prose, not code).',
      inputSchema: { claimId: z.string(), summary: z.string().optional(), agentId: z.string().optional() },
    },
    async (args) => {
      const r = await client.releaseFile(args.claimId, args.summary);
      const agentId = args.agentId ?? (r as any)?.claim?.agentId;
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_list_claims',
    {
      title: 'List active claims',
      description: 'List currently claimed files. Filter to your repo to scope the picture.',
      inputSchema: {
        repoPath: z.string().optional(),
        activeOnly: z.boolean().optional().default(true),
      },
    },
    async (args) => txt(await client.listClaims(args))
  );

  server.registerTool(
    'aol_inspect_claim',
    {
      title: 'Inspect a single claim',
      description: 'Read the rationale + status for one claim by id.',
      inputSchema: { claimId: z.string() },
    },
    async ({ claimId }) => txt(await client.inspectClaim(claimId))
  );

  server.registerTool(
    'aol_send_message',
    {
      title: 'Send a direct message',
      description: `Send a short DM to one agent. ${COORD_RULES}`,
      inputSchema: {
        from: z.string(),
        to: z.string(),
        repoPath: z.string(),
        body: z.string(),
      },
    },
    async (args) => {
      const r = await client.sendMessage(args);
      return txt(await withInbox(client, args.from, r));
    }
  );

  server.registerTool(
    'aol_post_to_room',
    {
      title: 'Post to repo chat room',
      description: `Post to the per-repo coordination room. ${COORD_RULES}`,
      inputSchema: {
        from: z.string(),
        repoPath: z.string(),
        body: z.string(),
      },
    },
    async (args) => {
      const r = await client.sendMessage({ ...args, to: null });
      return txt(await withInbox(client, args.from, r));
    }
  );

  server.registerTool(
    'aol_get_messages',
    {
      title: 'Read messages',
      description:
        'Read room messages, or pass peer + agentId to read the DM thread between two agents. Use since for incremental polling.',
      inputSchema: {
        repoPath: z.string(),
        since: z.number().optional(),
        peer: z.string().optional(),
        agentId: z.string().optional(),
      },
    },
    async (args) => {
      const r = await client.getMessages(args);
      return txt(await withInbox(client, args.agentId, r));
    }
  );

  server.registerTool(
    'aol_get_activity',
    {
      title: 'Recent activity log',
      description: 'Recent activity events (claims/releases/msgs/lifecycle) for a repo.',
      inputSchema: {
        repoPath: z.string().optional(),
        since: z.number().optional(),
        limit: z.number().optional(),
      },
    },
    async (args) => txt(await client.getActivity(args))
  );

  server.registerTool(
    'aol_wait_for_release',
    {
      title: 'Wait for a file claim to release',
      description:
        'Long-poll until the active claim on (repo,file) releases or until timeoutMs elapses. Default 30s, max 120s.',
      inputSchema: {
        agentId: z.string(),
        repoPath: z.string(),
        file: z.string(),
        timeoutMs: z.number().optional(),
      },
    },
    async (args) => txt(await client.waitForRelease(args))
  );

  server.registerTool(
    'aol_mark_started',
    {
      title: 'Mark work started',
      description: 'Announce that you have begun work on a file. Implies status=editing.',
      inputSchema: { agentId: z.string(), file: z.string().optional(), summary: z.string().optional() },
    },
    async ({ agentId, ...rest }) => {
      const r = await client.markStarted(agentId, rest);
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_mark_completed',
    {
      title: 'Mark work completed',
      description: 'Announce work is complete. Use after release_file or in conjunction with it.',
      inputSchema: { agentId: z.string(), file: z.string().optional(), summary: z.string().optional() },
    },
    async ({ agentId, ...rest }) => {
      const r = await client.markCompleted(agentId, rest);
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_mark_abandoned',
    {
      title: 'Mark work abandoned',
      description: 'Announce work is being abandoned (covered by another agent, redundant, etc.).',
      inputSchema: { agentId: z.string(), file: z.string().optional(), summary: z.string().optional() },
    },
    async ({ agentId, ...rest }) => {
      const r = await client.markAbandoned(agentId, rest);
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_list_agents',
    {
      title: 'List agents',
      description: 'List agents (filterable by repo).',
      inputSchema: { repoPath: z.string().optional() },
    },
    async ({ repoPath }) => txt(await client.listAgents(repoPath))
  );

  server.registerTool(
    'aol_list_repos',
    {
      title: 'List repos with active agents',
      description: 'See which repos currently have agents online.',
      inputSchema: {},
    },
    async () => txt(await client.listRepos())
  );

  // ---------- Iteration 2 tools ----------

  server.registerTool(
    'aol_find_reusable_agent',
    {
      title: 'Find away/offline agents you can reuse',
      description:
        'Before registering a brand-new agent in this repo, call this to see if an away or offline buddy already exists. If one fits, call aol_register_agent with that agent\'s id to revive it (your name can stay or change). Keeps the buddy list from accumulating endless one-off identities.',
      inputSchema: { repoPath: z.string() },
    },
    async ({ repoPath }) => txt(await client.listReusableAgents(repoPath))
  );

  server.registerTool(
    'aol_find_observer',
    {
      title: 'Find the observer in a repo',
      description: 'Returns the most recently active observer (role=observer) in this repo, or { found: false }.',
      inputSchema: { repoPath: z.string() },
    },
    async ({ repoPath }) => txt(await client.findObserver(repoPath))
  );

  server.registerTool(
    'aol_ask_observer',
    {
      title: 'Ask the observer a question (async)',
      description:
        'Fire-and-forget question to the observer. Returns a ticketId. The daemon will: (1) DM the observer, (2) at 5min send a follow-up phrase, (3) at 8min total escalate to another non-away peer in the repo, (4) at 13min expire. Continue your work and call aol_check_inbox between actions to see replies.',
      inputSchema: {
        askerId: z.string(),
        repoPath: z.string(),
        question: z.string(),
      },
    },
    async (args) => {
      const r = await client.askObserver(args);
      return txt(await withInbox(client, args.askerId, r));
    }
  );

  server.registerTool(
    'aol_get_question',
    {
      title: 'Read a question ticket',
      description: 'Inspect a question ticket by id; returns the row plus the resolved answer DM if any.',
      inputSchema: { ticketId: z.string() },
    },
    async ({ ticketId }) => txt(await client.getQuestion(ticketId))
  );

  server.registerTool(
    'aol_check_inbox',
    {
      title: 'Read your unread DMs',
      description:
        'Pull DMs addressed to you since your cursor. Reply (even briefly) to anything you see before continuing other work. Save the cursor and pass it back next time.',
      inputSchema: { agentId: z.string(), since: z.number().optional() },
    },
    async ({ agentId, since }) => {
      const r = await client.getInbox(agentId, since);
      return txt(await withInbox(client, agentId, r));
    }
  );

  server.registerTool(
    'aol_suggest_screen_names',
    {
      title: 'Generate AIM-era screen name candidates',
      description:
        'Returns N freshly-generated screen names filtered against names already in use in the repo. Pick one verbatim or remix.',
      inputSchema: { count: z.number().optional(), repoPath: z.string().optional() },
    },
    async (args) => txt(await client.suggestScreenNames(args))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[aol-mcp] fatal:', err);
  process.exit(1);
});
