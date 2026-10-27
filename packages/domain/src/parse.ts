import type { Point } from "@kestrel/geometry";
import type { Operation, SpaceChanges } from "./draft.ts";
import { SPACE_KINDS, type Space, type SpaceKind } from "./index.ts";

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
		default:
			return fail(`Unknown Operation type ${JSON.stringify(o.type)}`);
	}
}
