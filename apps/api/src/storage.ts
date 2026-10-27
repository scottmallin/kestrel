import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type StoredFile = {
	readonly bytes: Buffer;
	readonly contentType: string;
};

/** Where uploaded files (Underlays) live: memory in tests, local disk in development, R2 in production. */
export type Storage = {
	put(key: string, file: StoredFile): Promise<void>;
	get(key: string): Promise<StoredFile | null>;
};

export function memoryStorage(): Storage {
	const files = new Map<string, StoredFile>();
	return {
		put: async (key, file) => void files.set(key, file),
		get: async (key) => files.get(key) ?? null,
	};
}

/** Files under a folder, with each file's content type in a sidecar `.type` file. */
export function diskStorage(root: string): Storage {
	const path = (key: string) => join(root, ...key.split("/"));
	return {
		async put(key, { bytes, contentType }) {
			await mkdir(dirname(path(key)), { recursive: true });
			await writeFile(path(key), bytes);
			await writeFile(`${path(key)}.type`, contentType);
		},
		async get(key) {
			try {
				return {
					bytes: await readFile(path(key)),
					contentType: await readFile(`${path(key)}.type`, "utf8"),
				};
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
				throw error;
			}
		},
	};
}
