import type { Operation, Space } from "@kestrel/domain";
import { describe, expect, it, vi } from "vitest";
import { createDraftSync, type SaveResult } from "./sync.ts";

const add = (id: string): Operation => ({
	type: "addSpace",
	space: {
		id,
		levelId: "l1",
		kind: "unit",
		outline: [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
		],
	} satisfies Space,
});

/** A fake API: records each save, and answers with whatever the test queues up (default: success). */
function fakeApi() {
	const saves: { baseSeq: number; ids: string[] }[] = [];
	const answers: ((
		baseSeq: number,
		count: number,
	) => SaveResult | Promise<SaveResult>)[] = [];
	let release: (() => void) | null = null;
	return {
		saves,
		answerNext: (answer: (typeof answers)[number]) => answers.push(answer),
		/** Makes the next save wait until release() is called. */
		holdNext() {
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			answers.push(async (baseSeq, count) => {
				await gate;
				return { ok: true, seq: baseSeq + count };
			});
			return () => release?.();
		},
		async save(
			baseSeq: number,
			operations: readonly Operation[],
		): Promise<SaveResult> {
			saves.push({
				baseSeq,
				ids: operations.map((o) =>
					o.type === "addSpace" ? o.space.id : o.type,
				),
			});
			const answer = answers.shift();
			return answer
				? answer(baseSeq, operations.length)
				: { ok: true, seq: baseSeq + operations.length };
		},
	};
}

describe("draft sync", () => {
	it("saves Operations in order, batching those made while a save is in flight", async () => {
		const api = fakeApi();
		const sync = createDraftSync({ save: api.save, seq: 5 });
		const release = api.holdNext();

		sync.push(add("a"));
		await vi.waitFor(() => expect(api.saves).toHaveLength(1));
		sync.push(add("b"));
		sync.push(add("c"));
		expect(sync.status()).toBe("saving");
		release();
		await sync.idle();

		expect(api.saves).toEqual([
			{ baseSeq: 5, ids: ["a"] },
			{ baseSeq: 6, ids: ["b", "c"] },
		]);
		expect(sync.status()).toBe("saved");
	});

	it("goes offline when a save can't reach the server, then retries without losing or repeating anything", async () => {
		const api = fakeApi();
		const seen: string[] = [];
		const sync = createDraftSync({
			save: api.save,
			seq: 0,
			retryDelayMs: 5,
			onStatus: (s) => seen.push(s),
		});
		api.answerNext(() => ({ ok: false, reason: "network" }));
		const release = api.holdNext();

		sync.push(add("a"));
		await vi.waitFor(() => expect(api.saves).toHaveLength(2));
		sync.push(add("b"));
		expect(sync.status()).toBe("offline");
		release();
		await sync.idle();

		expect(seen).toEqual(["saving", "offline", "saved"]);
		expect(sync.status()).toBe("saved");
		expect(api.saves).toEqual([
			{ baseSeq: 0, ids: ["a"] },
			{ baseSeq: 0, ids: ["a"] },
			{ baseSeq: 1, ids: ["b"] },
		]);
	});

	it("stops saving after a conflict, so nothing is written over someone else's changes", async () => {
		const api = fakeApi();
		const sync = createDraftSync({ save: api.save, seq: 0 });
		api.answerNext(() => ({ ok: false, reason: "conflict", seq: 3 }));

		sync.push(add("a"));
		await sync.idle();
		sync.push(add("b"));
		await sync.idle();

		expect(sync.status()).toBe("conflict");
		expect(api.saves).toHaveLength(1);
	});

	it("stops saving when the server rejects a batch, keeping its reason", async () => {
		const api = fakeApi();
		const sync = createDraftSync({ save: api.save, seq: 0 });
		api.answerNext(() => ({
			ok: false,
			reason: "rejected",
			error: "Operation 1: No Space with id x",
		}));

		sync.push(add("a"));
		await sync.idle();

		expect(sync.status()).toBe("rejected");
		expect(sync.error()).toBe("Operation 1: No Space with id x");
	});
});
