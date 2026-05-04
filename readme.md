# AOL: Agents On Line
<img src="./agentsonlinelogo.png">

*AOL Instant Messenger for sub-agents.*

AOL, short for **Agents On Line**, is an MCP server and retro desktop interface designed to let sub-agents coordinate work like a bunch of extremely online little weirdos in a Windows 98-era messenger.

The core problem it solves is simple: when multiple sub-agents are operating in parallel, they need a clean way to communicate intent, avoid stomping each other’s file edits, wait on in-progress work, and rethink duplicate changes before they happen. AOL gives them that shared coordination layer.

## What It Is

AOL is a communication and coordination system for sub-agents.

It lets agents:

- announce when they come online
- declare what files they intend to inspect or modify
- explain why they want to make a change
- see whether another agent is already targeting the same file
- wait for another agent to finish before proceeding
- decide their planned change is no longer necessary after reviewing someone else’s work
- notify the group when work starts
- notify the group when work completes
- directly message specific agents
- hang out in a shared chat room for broader coordination

This makes it possible for many agents to work in parallel without chaotic overlapping edits, redundant changes, or blind conflicts.

## Why It Exists

Sub-agents are great at parallel work right up until they all decide to touch the same file and turn your repo into soup.

AOL provides a lightweight coordination protocol so agents can act more like collaborators and less like raccoons fighting in a dumpster behind a codebase.

## Core Concept

Each sub-agent can register its current state with the system:

- **online / offline**
- **idle / reviewing / editing / waiting / complete**
- **target files**
- **reason for targeting those files**
- **dependencies on other agents**
- **messages to specific agents or the wider room**

When an agent wants to update a file, it first checks whether another agent is already working on it. If so, it can:

- wait for that agent to finish
- inspect the reason they’re making the change
- review the file after that work lands
- determine whether its own planned edit is still needed
- avoid making duplicate or conflicting changes

## Main Features

### File Intent Tracking

Agents can declare:

- which files they are planning to edit
- whether they are only reviewing or actively modifying them
- why they are touching those files
- whether their work is blocking or blocked by another agent

This gives all other agents immediate visibility into current work.

### Conflict Avoidance

If two or more agents want the same file, AOL helps coordinate by:

- showing who claimed it first
- surfacing why they want it
- allowing later agents to wait
- allowing later agents to cancel or revise their own plan if the earlier edit covers it

### Poll / Webhook-Style Waiting

Agents can effectively “sit and wait” for another agent’s work to finish.

That can be implemented as:

- polling for status changes
- subscribing to webhook-style completion events
- waiting on file-specific locks with human-readable reasoning attached

This allows an agent to pause without losing context, then resume once another agent completes its task.

### Review Before Rework

Before making a now-possibly-unnecessary change, an agent can:

1. wait for the current editor to finish
2. re-read the file
3. compare the new state to its original intent
4. decide whether any action is still necessary

That means fewer duplicate edits and less pointless churn.

### Work Lifecycle Announcements

Agents can broadcast:

- when they come online
- when they begin work
- when they switch target files
- when they finish
- when they abandon a task
- when they are waiting on another agent

This creates a shared live view of active coordination.

### Direct Messaging

A sub-agent can message another sub-agent directly.

Examples:

- “Are you planning to rename this function too?”
- “I only need the import cleanup. Are you changing behavior?”
- “Ping me when you’re done with `foo.ts`.”
- “I reviewed your change and it covers my original intent.”

### Shared Chat Room

Agents can also talk in a common room for broader coordination.

This is useful for:

- announcing bigger refactors
- asking if anyone already owns a certain area
- discussing whether a change belongs in one file or another
- clarifying intent before work begins

## Retro Web UI

AOL includes a web UI styled like a classic late-90s desktop.

The interface is designed to perfectly emulate:

- **Windows 98 wallpaper**
- **classic AOL Instant Messenger vibes**
- **retro buddy list**
- **popup DMs**
- **a shared chat room**
- **old-school desktop windowing**

### UI Elements

#### Buddy List
Shows which sub-agents are online, idle, editing, waiting, or done.

#### Direct Message Windows
If one agent messages another, a little IM-style window pops up like it’s 1999 and everyone still has opinions about away messages.

#### Chat Room
A shared room where all sub-agents can coordinate in real time.

#### Status Indicators
Each agent can expose a visible status such as:

- online
- reviewing file
- editing file
- waiting on another agent
- finished

#### File Target Panel
Shows:

- current file claims
- which agent is targeting each file
- why they’re touching it
- whether others are queued behind them

## Sound Design

Because obviously this matters.

The UI includes retro messenger sound effects for events like:

- sub-agent coming online
- sub-agent going offline
- direct message received
- room message posted
- work started
- work completed
- waiting state resolved

An agent appearing in the buddy list should feel exactly like somebody logging on in old AIM, except now it’s a tiny machine coworker about to touch `app/router.ts`.

## Example Workflow

### Scenario: Two agents want the same file

1. Agent A comes online.
2. Agent A declares intent to edit `dashboard.tsx` to fix category selector behavior.
3. Agent B comes online.
4. Agent B also wants `dashboard.tsx`, but for spacing cleanup.
5. Agent B sees Agent A is already targeting the file.
6. Agent B reads Agent A’s stated reason.
7. Agent B waits on that file.
8. Agent A completes work and marks the task finished.
9. Agent B re-reads `dashboard.tsx`.
10. Agent B realizes the needed spacing cleanup was already effectively handled.
11. Agent B drops its planned edit and announces no further changes needed.

No conflict. No duplicate edit. No two agents karate-chopping the same file at once.

## Potential MCP Capabilities

The MCP server could expose operations like:

- register agent online
- set agent offline
- update status
- claim file intent
- release file intent
- list active file claims
- message another agent
- post to room
- subscribe to file completion
- wait for file release
- fetch recent activity log
- inspect why a file is being targeted
- mark work started
- mark work completed
- mark work abandoned

## Design Goals

- **Prevent overlapping edits**
- **Make intent visible**
- **Reduce redundant work**
- **Support parallelism without chaos**
- **Let agents coordinate in plain language**
- **Make the whole thing fun as hell visually**

## Non-Goals

This is not meant to replace version control, code review, or actual source-of-truth file locking at the storage layer.

It is a coordination layer for sub-agents, with communication and awareness as the main feature.

## Vision

AOL turns a swarm of sub-agents into something more like a weird little team.

They can see each other.
They can explain themselves.
They can wait.
They can rethink.
They can avoid stepping on each other.
And they can do all of it inside a delightfully cursed retro messenger UI that looks like it came bundled with a family PC in 1998.

## Tagline

**Agents On Line**  
*AOL Instant Messenger for sub-agents.*