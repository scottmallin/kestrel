import type { Operation } from "@kestrel/domain";

export type SaveResult =
	| { readonly ok: true; readonly seq: number }
	| { readonly ok: false; readonly reason: "conflict"; readonly seq: number }
	| { readonly ok: false; readonly reason: "rejected"; readonly error: string }
	| { readonly ok: false; readonly reason: "network" };

export type SyncStatus =
	| "saved"
	| "saving"
	| "offline"
	| "conflict"
	| "rejected";

export type DraftSyncOptions = {
	/** Sends a batch to the server, appended after baseSeq. */
	save: (
		baseSeq: number,
		operations: readonly Operation[],
	) => Promise<SaveResult>;
	/** The sequence number of the Draft as loaded. */
	seq: number;
	/** First wait before retrying after a network failure; doubles each time, up to 30s. */
	retryDelayMs?: number;
	/** Called whenever the status changes. */
	onStatus?: (status: SyncStatus) => void;
};

const MAX_RETRY_DELAY_MS = 30_000;

/** Sends a Draft's Operations to the server in order, one batch at a time (ADR 0005). */
export function createDraftSync({
	save,
	seq: loadedSeq,
	retryDelayMs = 1000,
	onStatus,
}: DraftSyncOptions) {
	let seq = loadedSeq;
	let queue: Operation[] = [];
	let status: SyncStatus = "saved";
	const setStatus = (next: SyncStatus) => {
		if (next === status) return;
		status = next;
		onStatus?.(next);
	};
	let error: string | null = null;
	let running: Promise<void> | null = null;
	/** After a conflict or rejection nothing more is sent; the editor must reload. */
	const stopped = () => status === "conflict" || status === "rejected";

	async function run() {
		let failures = 0;
		while (queue.length > 0) {
			const batch = queue;
			const result = await save(seq, batch);
			if (!result.ok && result.reason === "network") {
				// Keep the batch queued and try again; edits made meanwhile join the next attempt.
				setStatus("offline");
				await new Promise((resolve) =>
					setTimeout(
						resolve,
						Math.min(retryDelayMs * 2 ** failures++, MAX_RETRY_DELAY_MS),
					),
				);
				continue;
			}
			if (!result.ok) {
				// Set the reason first, so status listeners can read it.
				error =
					result.reason === "rejected"
						? result.error
						: "This Map was changed elsewhere. Reload to continue.";
				setStatus(result.reason);
				return;
			}
			failures = 0;
			seq = result.seq;
			queue = queue.slice(batch.length);
		}
		setStatus("saved");
	}

	return {
		push(operation: Operation) {
			queue = [...queue, operation];
			if (stopped()) return;
			if (status === "saved") setStatus("saving");
			running ??= run().finally(() => {
				running = null;
			});
		},
		status: () => status,
		/** Why saving stopped, if it did. */
		error: () => error,
		/** Resolves once nothing is being sent. */
		idle: async () => {
			while (running) await running;
		},
	};
}

export type DraftSync = ReturnType<typeof createDraftSync>;
