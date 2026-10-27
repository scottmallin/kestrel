import Fastify, {
	type FastifyRequest,
	type FastifyServerOptions,
} from "fastify";
import type { Auth } from "./auth.ts";
import type { Db } from "./db/client.ts";
import { draftRoutes } from "./routes/draft.ts";
import { mapRoutes } from "./routes/maps.ts";

export type AppDeps = { db: Db; auth: Auth };

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
	const app = Fastify(options);

	app.get("/health", async () => ({ status: "ok" }));

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
