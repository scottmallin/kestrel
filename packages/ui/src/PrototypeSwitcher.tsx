import { useEffect } from "react";

type Variant = { key: string; name: string };

type Props = {
	variants: readonly Variant[];
	current: string;
	onChange: (key: string) => void;
};

/** Floating bar for flipping between prototype variants. Never render in production. */
export function PrototypeSwitcher({ variants, current, onChange }: Props) {
	const index = Math.max(
		0,
		variants.findIndex((v) => v.key === current),
	);
	const step = (delta: number) => {
		const next = variants[(index + delta + variants.length) % variants.length];
		if (next) onChange(next.key);
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (target?.closest("input, textarea, select, [contenteditable]")) return;
			if (e.key === "ArrowLeft") step(-1);
			if (e.key === "ArrowRight") step(1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const variant = variants[index];
	return (
		<div
			style={{
				position: "fixed",
				bottom: 16,
				left: "50%",
				transform: "translateX(-50%)",
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "8px 14px",
				borderRadius: 999,
				background: "#111",
				color: "#fff",
				font: "600 13px system-ui, sans-serif",
				boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
				zIndex: 1000,
				userSelect: "none",
			}}
		>
			<button
				type="button"
				onClick={() => step(-1)}
				style={arrowStyle}
				aria-label="Previous variant"
			>
				←
			</button>
			<span>
				PROTOTYPE · {variant?.key} ({variant?.name})
			</span>
			<button
				type="button"
				onClick={() => step(1)}
				style={arrowStyle}
				aria-label="Next variant"
			>
				→
			</button>
		</div>
	);
}

const arrowStyle = {
	background: "none",
	border: "none",
	color: "#fff",
	font: "inherit",
	cursor: "pointer",
	padding: "0 4px",
} as const;
