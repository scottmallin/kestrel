import type { Draft, Operation } from "@kestrel/domain";
import type { SaveResult } from "./editor/sync.ts";

export type MapSummary = { id: string; name: string };
export type LevelDetails = {
	id: string;
	name: string;
	ordinal: number;
	underlay: { pixelsPerMetre: number } | null;
};
export type MapDetails = {
	id: string;
	name: string;
	levels: LevelDetails[];
	/** The latest Published Version, if the Map has been published. */
	published: { version: number; publishedAt: string } | null;
	embeds: { id: string; name: string }[];
};
export type Category = { id: string; name: string };
export type SignedInUser = { id: string; name: string; email: string };

/** A request failed; `message` is safe to show to the user. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (typeof init.body === "string" && !headers.has("content-type"))
		headers.set("content-type", "application/json");
	const response = await fetch(path, {
		credentials: "same-origin",
		...init,
		headers,
	});
	const text = await response.text();
	const body = text ? JSON.parse(text) : null;
	if (!response.ok)
		throw new ApiError(
			response.status,
			body?.error ?? body?.message ?? `Request failed (${response.status})`,
		);
	return body as T;
}

const json = (body: unknown): RequestInit => ({
	method: "POST",
	body: JSON.stringify(body),
});

export const api = {
	async currentUser(): Promise<SignedInUser | null> {
		const session = await call<{ user: SignedInUser } | null>(
			"/api/auth/get-session",
		);
		return session?.user ?? null;
	},

	/** Signs up and creates the user's Organisation, which becomes their active one. */
	async signUp(input: {
		name: string;
		email: string;
		password: string;
		organisation: string;
	}) {
		await call(
			"/api/auth/sign-up/email",
			json({ name: input.name, email: input.email, password: input.password }),
		);
		const slug = `${input.organisation.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 6)}`;
		await call(
			"/api/auth/organization/create",
			json({ name: input.organisation, slug }),
		);
	},

	/** Signs in and makes the user's first Organisation active. */
	async signIn(email: string, password: string) {
		await call("/api/auth/sign-in/email", json({ email, password }));
		const organisations = await call<{ id: string }[]>(
			"/api/auth/organization/list",
		);
		const [first] = organisations;
		if (first)
			await call(
				"/api/auth/organization/set-active",
				json({ organizationId: first.id }),
			);
	},

	signOut: () => call("/api/auth/sign-out", json({})),

	listMaps: () => call<MapSummary[]>("/api/maps"),
	createMap: (name: string) => call<MapDetails>("/api/maps", json({ name })),
	getMap: (id: string) => call<MapDetails>(`/api/maps/${id}`),
	getDraft: (id: string) =>
		call<{ seq: number; draft: Draft }>(`/api/maps/${id}/draft`),

	async saveOperations(
		mapId: string,
		baseSeq: number,
		operations: readonly Operation[],
	): Promise<SaveResult> {
		try {
			const { seq } = await call<{ seq: number }>(
				`/api/maps/${mapId}/operations`,
				json({ baseSeq, operations }),
			);
			return { ok: true, seq };
		} catch (error) {
			if (!(error instanceof ApiError)) return { ok: false, reason: "network" };
			if (error.status === 409)
				return { ok: false, reason: "conflict", seq: -1 };
			if (error.status >= 500) return { ok: false, reason: "network" };
			return { ok: false, reason: "rejected", error: error.message };
		}
	},

	publish: (mapId: string) =>
		call<{ version: number; embedId: string }>(`/api/maps/${mapId}/publish`, {
			method: "POST",
		}),

	uploadUnderlay: (levelId: string, png: Blob) =>
		call<null>(`/api/levels/${levelId}/underlay`, {
			method: "PUT",
			body: png,
			headers: { "content-type": "image/png" },
		}),
	listCategories: () => call<Category[]>("/api/categories"),
	createCategory: (name: string) =>
		call<Category>("/api/categories", json({ name })),

	uploadLogo: (mapId: string, png: Blob) =>
		call<{ logoKey: string }>(`/api/maps/${mapId}/logos`, {
			method: "PUT",
			body: png,
			headers: { "content-type": "image/png" },
		}),
	logoUrl: (logoKey: string) => `/api/public/${logoKey}`,

	underlayUrl: (levelId: string) => `/api/levels/${levelId}/underlay`,
};
