import { buildApp } from "./app.ts";

const app = buildApp({ logger: true });
const port = Number(process.env.PORT ?? 3000);

await app.listen({ port, host: "0.0.0.0" });
