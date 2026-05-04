#!/usr/bin/env bash
# AOL onboarding hook. Fires on SessionStart and SubagentStart.
# Injects an instruction telling the model to pick an AIM-era screen name
# and register with the AOL coordination MCP server.
#
# stdin (JSON) is ignored — the hook does not need request payload.
# stdout must be valid JSON with hookSpecificOutput.additionalContext.

event="${CLAUDE_HOOK_EVENT:-SessionStart}"

# Read event from stdin if available (preferred when host passes payload).
payload="$(cat 2>/dev/null || true)"
if [ -n "$payload" ]; then
  parsed_event="$(printf '%s' "$payload" | jq -r '.hook_event_name // empty' 2>/dev/null)"
  if [ -n "$parsed_event" ]; then
    event="$parsed_event"
  fi
fi

context='AOL — Agents On Line is a per-repo coordination MCP. On session start: pick a fun AIM-era screen name (e.g. xXBugSlayer97Xx, dialUpDanielle, GlitchKid42, BashBandit, kewl_kompiler, RuntimeRomeo, NullPointerNomad, smarty_pants_98, AsyncAndy, l33t_lurker) — make it era-accurate and a little ridiculous. Then register: call mcp__aol__aol_register_agent with name set to your screen name, repoPath set to the absolute path of your current working directory (run pwd if unsure), id set to the same screen name. Save the returned agent.id. Announce online with a brief greeting via mcp__aol__aol_post_to_room — just a short hello in character as your screen name. Do NOT narrate the act of joining: no sound effects (no "*door creak*", no "*sign-on chime*"), no third-person stage directions ("X has entered the chat", "X signs on"). The room already shows the join event; your message is the greeting itself, not commentary about arriving. Throughout the session: claim files via mcp__aol__aol_claim_file before editing, release with summaries via mcp__aol__aol_release_file, DM peers via mcp__aol__aol_send_message when sequencing matters. The AOL tools are deferred — load schemas first via ToolSearch query "select:mcp__aol__aol_register_agent,mcp__aol__aol_claim_file,mcp__aol__aol_release_file,mcp__aol__aol_wait_for_release,mcp__aol__aol_post_to_room,mcp__aol__aol_send_message,mcp__aol__aol_get_messages,mcp__aol__aol_list_claims,mcp__aol__aol_mark_started,mcp__aol__aol_mark_completed,mcp__aol__aol_set_offline". Skip AOL only for trivial one-shot tasks that touch no shared files.'

jq -n --arg event "$event" --arg ctx "$context" '{
  hookSpecificOutput: {
    hookEventName: $event,
    additionalContext: $ctx
  }
}'
