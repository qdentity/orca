---
name: orchestration
description: >-
  Use Orca orchestration to coordinate multiple AI agent terminals with
  messages, task dispatch, worker_done/escalation handling, decision gates, and
  coordinator loops. Use when the user asks to coordinate agents, ask another
  agent, send a message to an agent, dispatch work, decompose work across
  multiple agents, wait for worker_done, handle escalation, or run a
  coordinator. Use `orca-cli` instead for terminal control, shell commands,
  browser automation, worktree management, and reading or waiting on terminals.
---

# Orca Inter-Agent Orchestration

Use this skill when coordinating multiple coding agents through Orca's orchestration system. For basic terminal, browser, automation, and worktree management, use the `orca-cli` skill.

## When To Use

- You need to send messages between agent terminals.
- You need to decompose a spec into parallel subtasks with dependencies.
- You need to dispatch tasks to worker agents with structured feedback.
- You need to act as a coordinator managing a multi-agent workflow.
- You need a decision gate for a human-in-the-loop checkpoint.

## Preconditions

- Orca must be running: `orca status --json`.
- The `orca` CLI must be on PATH (`orca-ide` on Linux).
- The orchestration experimental feature must be enabled in Settings > Experimental.
- `orca orchestration` commands are RPC calls to the running Orca runtime.
- Do not dispatch or complete work until coordinator ownership is clear.
- If this turn already checked Orca runtime status, reuse that result instead of probing again.

## Ownership Boundaries

Orchestration messages and tasks are runtime-global. The authority for worker completion is the active dispatch context (`taskId` + `dispatchId` + assignee handle), not the filesystem worktree by itself.

Classify inherited orchestration context before sending lifecycle messages:

- **Coordinated subtask**: a live coordinator owns the DAG and is waiting on this dispatch. Use the exact `worker_done`, status, and escalation flow from the preamble, even if the coordinator is in another worktree.
- **Full handoff**: the original actor delegated ownership and does not want to monitor the work. Finish in the current session. Create a new coordinator only when the user asks for orchestration or you deliberately decompose fresh subtasks.

When ownership is unclear, inspect:

```bash
orca orchestration task-list --json
orca orchestration dispatch-show --task <task_id> --json
orca terminal list --json
```

Why: a stale or copied cross-worktree `worker_done` can attach unrelated work to the wrong coordinator. Dispatch ownership, not location alone, decides whether a lifecycle message is valid.

## Messaging

```bash
orca orchestration send --to <handle|@group> --subject <text> [--from <handle>] [--body <text>] [--type <type>] [--priority <level>] [--thread-id <id>] [--payload <json>] [--json]
orca orchestration check [--terminal <handle>] [--unread] [--types <type,...>] [--inject] [--wait] [--timeout-ms <n>] [--json]
orca orchestration reply --id <msg_id> --body <text> [--from <handle>] [--json]
orca orchestration inbox [--limit <n>] [--json]
```

Message guidance:

- `--from` usually auto-resolves via `ORCA_TERMINAL_HANDLE`; omit it unless impersonating another terminal.
- Use `--inject` when the output should be formatted for prompt injection.
- Use `--wait --types worker_done,escalation --timeout-ms <n>` instead of sleep+poll loops.
- Message types include `status`, `dispatch`, `worker_done`, `merge_ready`, `escalation`, `handoff`, and `decision_gate`.
- Group addresses include `@all`, `@idle`, `@claude`, `@codex`, `@opencode`, `@gemini`, and `@worktree:<id>`.

## Tasks And Dispatch

```bash
orca orchestration task-create --spec <text> [--deps <json_array>] [--parent <task_id>] [--json]
orca orchestration task-list [--status <status>] [--ready] [--json]
orca orchestration task-update --id <task_id> --status <status> [--result <json>] [--json]
orca orchestration dispatch --task <task_id> --to <handle> [--from <handle>] [--inject] [--json]
orca orchestration dispatch-show --task <task_id> [--json]
```

Task statuses: `pending`, `ready`, `dispatched`, `completed`, `failed`, `blocked`.

Dispatch guidance:

- `task-create` builds the DAG. A task becomes `ready` when all dependencies are `completed`.
- `dispatch --inject` sends a preamble that teaches the worker how to report back with `worker_done`.
- `dispatch --inject` requires a recognized agent CLI in the target terminal. If the terminal is a bare shell, omit `--inject` and use normal terminal/browser/worktree control through `orca-cli`.
- After 3 consecutive failures on a task, the dispatch context is circuit-broken and the task is marked failed.

## Decision Gates

```bash
orca orchestration gate-create --task <task_id> --question <text> [--options <json_array>] [--json]
orca orchestration gate-resolve --id <gate_id> --resolution <text> [--json]
orca orchestration gate-list [--task <task_id>] [--status <status>] [--json]
```

Creating a gate blocks the task and completes its active dispatch. Resolving a gate moves the task back to `ready` with the resolution included in the next dispatch preamble.

## Coordinator Loop

```bash
orca orchestration run --spec <text> [--from <handle>] [--poll-interval-ms <n>] [--max-concurrent <n>] [--worktree <selector>] [--json]
orca orchestration run-stop [--json]
orca orchestration reset [--all] [--tasks] [--messages] [--json]
```

`run` starts a background coordinator loop and returns immediately with a run ID. Query progress with `orca orchestration task-list`. Only one coordinator can run at a time.

## Worker Setup

Use `orca-cli` terminal/worktree commands to prepare workers, then use orchestration for the actual task messages.

For a fresh worker workspace, prefer create-time agent startup:

```bash
orca worktree create --name worker-1 --agent codex --json
```

Pass `--repo <selector>` when the worker belongs to a different repo than the current Orca-managed worktree.

If an older CLI rejects `--agent`, create the worktree normally, then launch the worker with `orca terminal create --worktree <selector> --command "codex"` and wait for `tui-idle` before dispatch.

For an existing workspace, add or split a terminal:

```bash
orca terminal create --worktree active --title "worker-1" --command "claude" --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
```

After a worker terminal is idle, dispatch:

```bash
orca orchestration task-create --spec "Fix the login button CSS" --json
orca orchestration dispatch --task <task_id> --to <handle> --inject --json
orca orchestration check --wait --types worker_done,escalation --timeout-ms 300000 --json
```

## Agent Guidance

- When dispatched with a valid live preamble, send `worker_done` exactly once to the owning coordinator. The `dispatchId` in the payload is the completion authority.
- Treat a preamble inherited through terminal history or a full handoff as stale unless the current prompt explicitly keeps that coordinator in the loop.
- If blocked, send `escalation` to the owning coordinator only when ownership is valid; otherwise report the blocker in the current session.
- Use `orca orchestration check` to read incoming messages from the coordinator or other agents.
- Query orchestration state with `task-list --ready` instead of tracking the DAG in your context window.
- For parallel implementation tasks, prefer one agent per worktree. Use split panes in one worktree only for complementary tasks where agents will not edit the same files.
- As coordinator, discover workers with `terminal list`, create tasks with `task-create`, dispatch with `dispatch --inject`, and wait with `check --wait --types worker_done,escalation`.
- `check --wait` returns one message at a time. If several workers finish together, call it repeatedly and advance the DAG after each result.
- After receiving `worker_done`, that terminal is already idle; dispatch the next task without an extra `terminal wait`.
- If Orca restarts, terminal handles go stale. Reacquire handles with `terminal list`.
- Keep dependency chains shallow; prefer parallel waves of independent tasks over deep sequential chains.
- Insert decision gates between phases for risky operations that need human oversight.

## Next Action

Confirm Orca status unless already checked this turn, then either check ownership with `orca orchestration task-list --json` / `dispatch-show`, or create the first task with `orca orchestration task-create --spec <text> --json`.
