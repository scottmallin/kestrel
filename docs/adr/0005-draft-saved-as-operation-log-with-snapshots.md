# 5. A Draft is saved as a log of Operations, with periodic snapshots

Date: 2026-10-27

## Status

Accepted

## Context

The editor changes a Draft only through Operations (ADR 0004). To save a Draft on the server we could either store those Operations, or store the whole Draft every few seconds.

Saving the whole Draft is simpler, but it throws away the edit history and lets two editors (or two browser tabs) silently overwrite each other. We want version history, an audit trail and, later, real-time multi-user editing on paid Plans.

## Decision

- Every Operation is appended to a per-Map **Operation log**, numbered with a sequence number that rises by one each time, and records who made it and when. Undo and redo are just more Operations (the stored inverses), so the log is append-only.
- Every so often (e.g. every 50 Operations) the server stores a **snapshot** of the Draft at that sequence number. Loading a Draft means taking the latest snapshot and replaying the Operations after it.
- The client sends Operations along with the sequence number it last saw. If someone else has saved in the meantime, the save is rejected as a conflict and the client must reload. This enforces "one editor at a time" in v1 without a separate locking system.
- The server replays each Operation through `applyOperation` before storing it, so invalid Operations are rejected on the server too. The server is the authority on what the Draft is.
- The Draft covers a whole Map. Each Space already carries its `levelId`, and the editor shows one Level at a time.

## Consequences

- Version history, "who changed this?" and multi-user editing can all be built from the log later.
- Any Operation type added later must be safe to replay forever: old log entries must still apply after code changes, so Operations are versioned by type and never change meaning.
- A conflict currently means "reload and lose unsaved edits". That's acceptable for one editor at a time. Real-time editing will replace it with rebasing.
- The log grows without limit; snapshots keep loading fast. Compaction can come later if needed.
