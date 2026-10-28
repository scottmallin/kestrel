import Fastify, {
	type FastifyRequest,
	type FastifyServerOptions,
} from "fastify";
import type { Auth } from "./auth.ts";
import type { Db } from "./db/client.ts";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "./images.ts";
import { categoryRoutes } from "./routes/categories.ts";
import { draftRoutes } from "./routes/draft.ts";
import { levelRoutes } from "./routes/levels.ts";
import { mapRoutes } from "./routes/maps.ts";
import { publishRoutes } from "./routes/publish.ts";
import type { Storage } from "./storage.ts";

export type AppDeps = {
	db: Db;
	auth: Auth;
	storage: Storage;
	/** Where the API is publicly reachable, for absolute URLs in published bundles (e.g. logos). */
	publicUrl: string;
};

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
	const app = Fastify(options);

	app.get("/health", async () => ({ status: "ok" }));

	// Image uploads (floor plans, logos) arrive as raw bytes.
	app.addContentTypeParser(
		IMAGE_TYPES,
		{ parseAs: "buffer", bodyLimit: MAX_IMAGE_BYTES },
		(_req, body, done) => done(null, body),
	);

	// Better Auth speaks web-standard Requests; translate to and from Fastify.
	app.route({
		method: ["GET", "POST"],
		url: "/api/auth/*",
		handler: async (request, reply) => {
			const response = await deps.auth.handler(toWebRequest(request));
			reply.status(response.status);
			for (const [name, value] of response.headers)
				if (name !== "set-cookie") reply.header(name, value);
			const cookies = response.headers.getSetCookie();
			if (cookies.length > 0) reply.header("set-cookie", cookies);
			return reply.send(response.body ? await response.text() : null);
		},
	});

	app.register(mapRoutes(deps));
	app.register(draftRoutes(deps));
	app.register(levelRoutes(deps));
	app.register(publishRoutes(deps));
	app.register(categoryRoutes(deps));
	return app;
}

function toWebRequest(request: FastifyRequest): Request {
	const url = new URL(
		request.url,
		`${request.protocol}://${request.headers.host ?? "localhost"}`,
	);
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (value !== undefined)
			headers.set(name, Array.isArray(value) ? value.join(", ") : value);
	}
	const hasBody =
		request.method !== "GET" &&
		request.method !== "HEAD" &&
		request.body !== undefined;
	return new Request(url, {
		method: request.method,
		headers,
		...(hasBody && { body: JSON.stringify(request.body) }),
	});
}
