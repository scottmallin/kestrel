# 4. Operations record results, and undo applies their inverse

Date: 2026-10-26

## Status

Accepted

## Context

Every edit to a Draft goes through an Operation (see GLOSSARY.md). We needed undo/redo from the first version of the editor, and real-time multi-user editing is planned for paid Plans later. Two choices shaped the design:

- **How undo works.** Snapshots (store the whole Draft before each edit) are simple, but grow with every edit and can't be combined with other people's edits. Inverse Operations (each Operation produces the Operation that reverses it) stay small and can be replayed, sent over the network and rebased.
- **What an Operation records.** It could record the _intent_ ("split Space s1 along this line") or the _result_ ("remove s1, add s1a and s1b with these outlines"). Recording intent means every client must run the same geometry code and get bit-identical results to replay it.

## Decision

- An Operation records its **result**. Split and merge are both `replaceSpaces`, with the shapes worked out by the editor using `packages/geometry`. The domain package never depends on the geometry library.
- `applyOperation(draft, operation)` is pure and returns the new Draft **plus the inverse Operation**, captured from the Draft as it was. Invalid Operations are rejected with an error and change nothing.
- `History` keeps a stack of inverses. Undo applies the top inverse and keeps _its_ inverse as the redo step. Performing a new Operation clears redo.
- The set is small and general: `addSpace`, `removeSpaces`, `replaceSpaces`, `reshapeSpace` and `updateSpace`. The inverse of `removeSpaces` is a `replaceSpaces` that removes nothing and adds the Spaces back.

## Consequences

- Undo, the audit trail and future multi-user editing share one mechanism. Saving (step 4) can store the Operations themselves.
- Replaying a stored Operation always gives the same Draft, whatever version of the geometry code is running.
- Operations are larger than intents (they carry full outlines), which is fine at the scale of a Level.
- Grouping several Operations into one undo step isn't supported yet. Tools that change several Spaces at once use a single `replaceSpaces` instead.
- New Draft contents (Levels, Listings, Amenities) need their own Operations and inverses when they arrive.
