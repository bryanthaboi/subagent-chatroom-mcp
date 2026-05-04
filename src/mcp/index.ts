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
- If a peer goes quiet on a claim, DM them with a short check-in including the file and elapsed time.\
`;

function txt(body: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body, null, 2) }] };
}

async function main(): Promise<void> {
  const client = new AolClient();
  const server = new McpServer({ name: 'aol', version: '0.1.0' });

  server.registerTool(
    'aol_register_agent',
    {
      title: 'Register agent online',
      description: `Register this sub-agent online in AOL. ${COORD_RULES}`,
      inputSchema: {
        name: z.string().describe('Display name shown to peers'),
        repoPath: z.string().describe('Absolute path to the repo this agent is working in'),
        id: z.string().optional().describe('Stable id; pass to keep one identity across calls'),
        color: z.string().optional(),
      },
    },
    async (args) => {
      const r = await client.registerAgent(args);
      return txt(r);
    }
  );

  server.registerTool(
    'aol_set_offline',
    {
      title: 'Mark agent offline',
      description: 'Announce this agent is going offline. Releases nothing — release claims first.',
      inputSchema: { agentId: z.string() },
    },
    async ({ agentId }) => txt(await client.setOffline(agentId))
  );

  server.registerTool(
    'aol_update_status',
    {
      title: 'Update agent status',
      description:
        'Update lifecycle status without claiming a file. Use waitingOn to point at the agent you are blocked behind.',
      inputSchema: {
        agentId: z.string(),
        status: z.enum(['online', 'idle', 'editing', 'reviewing', 'waiting', 'complete', 'abandoned']),
        currentFile: z.string().optional(),
        reason: z.string().optional(),
        waitingOn: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, ...rest } = args;
      return txt(await client.setStatus(agentId, rest));
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
        return txt({ ok: true, ...r });
      } catch (e: any) {
        if (e.status === 409) return txt({ ok: false, ...e.conflict });
        throw e;
      }
    }
  );

  server.registerTool(
    'aol_release_file',
    {
      title: 'Release a file claim',
      description: 'Release your active claim. Optional summary describes what changed (in prose, not code).',
      inputSchema: { claimId: z.string(), summary: z.string().optional() },
    },
    async (args) => txt(await client.releaseFile(args.claimId, args.summary))
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
    async (args) => txt(await client.sendMessage(args))
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
    async (args) => txt(await client.sendMessage({ ...args, to: null }))
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
    async (args) => txt(await client.getMessages(args))
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
    async ({ agentId, ...rest }) => txt(await client.markStarted(agentId, rest))
  );

  server.registerTool(
    'aol_mark_completed',
    {
      title: 'Mark work completed',
      description: 'Announce work is complete. Use after release_file or in conjunction with it.',
      inputSchema: { agentId: z.string(), file: z.string().optional(), summary: z.string().optional() },
    },
    async ({ agentId, ...rest }) => txt(await client.markCompleted(agentId, rest))
  );

  server.registerTool(
    'aol_mark_abandoned',
    {
      title: 'Mark work abandoned',
      description: 'Announce work is being abandoned (covered by another agent, redundant, etc.).',
      inputSchema: { agentId: z.string(), file: z.string().optional(), summary: z.string().optional() },
    },
    async ({ agentId, ...rest }) => txt(await client.markAbandoned(agentId, rest))
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[aol-mcp] fatal:', err);
  process.exit(1);
});
