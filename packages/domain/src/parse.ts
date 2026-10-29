import type { Point } from "@kestrel/geometry";
import type { ListingChanges, Operation, SpaceChanges } from "./draft.ts";
import {
	type Level,
	type Listing,
	SPACE_KINDS,
	type Space,
	type SpaceKind,
} from "./index.ts";

export type ParseResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: string };

/** Checks that untrusted input (e.g. a request body) is a well-formed Operation. */
export function parseOperation(input: unknown): ParseResult<Operation> {
	try {
		return { ok: true, value: operation(input) };
	} catch (error) {
		if (error instanceof Invalid) return { ok: false, error: error.message };
		throw error;
	}
}

class Invalid extends Error {}

function fail(message: string): never {
	throw new Invalid(message);
}

function record(value: unknown, what: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		fail(`${what} must be an object`);
	return value as Record<string, unknown>;
}

function string(value: unknown, what: string): string {
	if (typeof value !== "string" || value.length === 0)
		fail(`${what} must be a non-empty string`);
	return value;
}

function strings(value: unknown, what: string): string[] {
	if (!Array.isArray(value)) fail(`${what} must be a list`);
	return value.map((v, i) => string(v, `${what}[${i}]`));
}

function point(value: unknown, what: string): Point {
	const p = record(value, what);
	if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
		fail(`${what} must have numeric x and y`);
	return { x: p.x as number, y: p.y as number };
}

function kind(value: unknown, what: string): SpaceKind {
	if (!SPACE_KINDS.includes(value as SpaceKind))
		fail(`${what} must be one of ${SPACE_KINDS.join(", ")}`);
	return value as SpaceKind;
}

function outline(value: unknown, what: string): Point[] {
	if (!Array.isArray(value)) fail(`${what} must be a list of points`);
	return value.map((p, i) => point(p, `${what}[${i}]`));
}

function space(value: unknown, what: string): Space {
	const s = record(value, what);
	return {
		id: string(s.id, `${what}.id`),
		levelId: string(s.levelId, `${what}.levelId`),
		kind: kind(s.kind, `${what}.kind`),
		...(s.reference !== undefined && {
			reference: string(s.reference, `${what}.reference`),
		}),
		outline: outline(s.outline, `${what}.outline`),
	};
}

/** Longest text accepted for each Listing field. */
const LISTING_LIMITS = {
	name: 120,
	description: 1000,
	website: 500,
	hours: 200,
	categoryId: 100,
	logoKey: 300,
} as const;

function text(value: unknown, what: keyof typeof LISTING_LIMITS): string {
	if (typeof value !== "string") fail(`${what} must be text`);
	if (value.length > LISTING_LIMITS[what])
		fail(`${what} must be at most ${LISTING_LIMITS[what]} characters`);
	// Shown as a link in Embeds on customers' sites, so only real web addresses (never javascript: and the like).
	if (what === "website" && !/^https?:\/\/\S+$/i.test(value))
		fail("website must start with http:// or https://");
	return value;
}

const OPTIONAL = [
	"categoryId",
	"logoKey",
	"description",
	"website",
	"hours",
] as const;

function listing(value: unknown): Listing {
	const l = record(value, "listing");
	const optional: Record<string, string> = {};
	for (const field of OPTIONAL)
		if (l[field] !== undefined) optional[field] = text(l[field], field);
	return {
		id: string(l.id, "listing.id"),
		name: text(l.name, "name"),
		spaceIds: strings(l.spaceIds, "spaceIds"),
		...optional,
	};
}

function listingChanges(value: unknown): ListingChanges {
	const c = record(value, "changes");
	const optional: Record<string, string | null> = {};
	for (const field of OPTIONAL) {
		if (c[field] !== undefined)
			optional[field] = c[field] === null ? null : text(c[field], field);
	}
	return {
		...(c.name !== undefined && { name: text(c.name, "name") }),
		...(c.spaceIds !== undefined && {
			spaceIds: strings(c.spaceIds, "spaceIds"),
		}),
		...optional,
	};
}

function changes(value: unknown): SpaceChanges {
	const c = record(value, "changes");
	return {
		...(c.kind !== undefined && { kind: kind(c.kind, "changes.kind") }),
		...(c.reference !== undefined && {
			reference:
				c.reference === null ? null : string(c.reference, "changes.reference"),
		}),
	};
}

/** Longest Level name accepted, and the furthest a Level may be from the ground floor. */
const LEVEL_NAME_LIMIT = 60;
const LEVEL_ORDINAL_LIMIT = 200;

function levelName(value: unknown, what: string): string {
	if (typeof value !== "string") fail(`${what} must be text`);
	if (value.length > LEVEL_NAME_LIMIT)
		fail(`${what} must be at most ${LEVEL_NAME_LIMIT} characters`);
	return value;
}

function ordinal(value: unknown, what: string): number {
	if (
		!Number.isInteger(value) ||
		Math.abs(value as number) > LEVEL_ORDINAL_LIMIT
	)
		fail(
			`${what} must be a whole number between -${LEVEL_ORDINAL_LIMIT} and ${LEVEL_ORDINAL_LIMIT}`,
		);
	return value as number;
}

function level(value: unknown): Level {
	const l = record(value, "level");
	return {
		id: string(l.id, "level.id"),
		name: levelName(l.name, "level.name"),
		ordinal: ordinal(l.ordinal, "level.ordinal"),
	};
}

function ordinals(value: unknown): Record<string, number> {
	const o = record(value, "ordinals");
	const result: Record<string, number> = {};
	for (const [id, n] of Object.entries(o))
		result[id] = ordinal(n, `ordinals.${id}`);
	return result;
}

function operation(input: unknown): Operation {
	const o = record(input, "Operation");
	switch (o.type) {
		case "addSpace":
			return { type: "addSpace", space: space(o.space, "space") };
		case "removeSpaces":
			return { type: "removeSpaces", ids: strings(o.ids, "ids") };
		case "replaceSpaces":
			return {
				type: "replaceSpaces",
				remove: strings(o.remove, "remove"),
				add: Array.isArray(o.add)
					? o.add.map((s, i) => space(s, `add[${i}]`))
					: fail("add must be a list"),
			};
		case "reshapeSpace":
			return {
				type: "reshapeSpace",
				id: string(o.id, "id"),
				outline: outline(o.outline, "outline"),
			};
		case "updateSpace":
			return {
				type: "updateSpace",
				id: string(o.id, "id"),
				changes: changes(o.changes),
			};
		case "addListing":
			return { type: "addListing", listing: listing(o.listing) };
		case "updateListing":
			return {
				type: "updateListing",
				id: string(o.id, "id"),
				changes: listingChanges(o.changes),
			};
		case "removeListing":
			return { type: "removeListing", id: string(o.id, "id") };
		case "addLevel":
			return {
				type: "addLevel",
				level: level(o.level),
				...(o.spaces !== undefined && {
					spaces: Array.isArray(o.spaces)
						? o.spaces.map((s, i) => space(s, `spaces[${i}]`))
						: fail("spaces must be a list"),
				}),
			};
		case "updateLevel": {
			const c = record(o.changes, "changes");
			return {
				type: "updateLevel",
				id: string(o.id, "id"),
				changes: {
					...(c.name !== undefined && {
						name: levelName(c.name, "changes.name"),
					}),
				},
			};
		}
		case "reorderLevels":
			return { type: "reorderLevels", ordinals: ordinals(o.ordinals) };
		case "removeLevel":
			return { type: "removeLevel", id: string(o.id, "id") };
		default:
			return fail(`Unknown Operation type ${JSON.stringify(o.type)}`);
	}
}
