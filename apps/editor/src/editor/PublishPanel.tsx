import { type CSSProperties, useState } from "react";

/** Where the Embed app is served; embed codes point here. */
const EMBED_URL = import.meta.env.VITE_EMBED_URL ?? "http://localhost:5174";

export const embedSrc = (embedId: string) => `${EMBED_URL}/?embed=${embedId}`;

export function embedCode(embedId: string, mapName: string) {
	const title = mapName.replace(/"/g, "&quot;");
	return `<iframe src="${embedSrc(embedId)}" title="${title} map" width="100%" height="600" style="border:0" loading="lazy"></iframe>`;
}

/** Shown after publishing: the embed code to paste into a website, and a link to try it. */
export function PublishPanel({
	version,
	embedId,
	mapName,
	onClose,
}: {
	version: number;
	embedId: string;
	mapName: string;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const code = embedCode(embedId, mapName);
	return (
		<section role="dialog" aria-label="Published" style={panel}>
			<h2 style={{ margin: 0, fontSize: 16 }}>Published version {version}</h2>
			<p style={{ margin: 0 }}>
				Paste this into your website where the map should appear:
			</p>
			<label style={{ display: "grid", gap: 4 }}>
				Embed code
				<textarea
					readOnly
					value={code}
					rows={4}
					style={{ font: "12px monospace" }}
					onFocus={(e) => e.target.select()}
				/>
			</label>
			<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
				<button
					type="button"
					onClick={async () => {
						await navigator.clipboard.writeText(code);
						setCopied(true);
					}}
				>
					{copied ? "Copied" : "Copy embed code"}
				</button>
				<a href={embedSrc(embedId)} target="_blank" rel="noreferrer">
					Open the Embed
				</a>
				<span style={{ flex: 1 }} />
				<button type="button" onClick={onClose}>
					Close
				</button>
			</div>
		</section>
	);
}

const panel: CSSProperties = {
	position: "absolute",
	top: 12,
	right: 12,
	zIndex: 20,
	width: 420,
	display: "grid",
	gap: 10,
	padding: 16,
	background: "#fff",
	border: "1px solid #cbd5e1",
	borderRadius: 8,
	boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
};
