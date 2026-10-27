import type { FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "../auth.ts";

export type SignedIn = { userId: string; organizationId: string | null };

/** The signed-in user, or null after replying 401. */
export async function requireUser(
	auth: Auth,
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<SignedIn | null> {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (typeof value === "string") headers.set(name, value);
	}
	const session = await auth.api.getSession({ headers });
	if (!session) {
		await reply.status(401).send({ error: "Sign in first." });
		return null;
	}
	return {
		userId: session.user.id,
		organizationId: session.session.activeOrganizationId ?? null,
	};
}
