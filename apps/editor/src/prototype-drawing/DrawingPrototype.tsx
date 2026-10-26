// PROTOTYPE – throwaway. Question: which way of drawing Spaces feels intuitive to non-technical venue staff?
// Three variants of the Level canvas, switchable via ?variant=A|B|C (ADR 0002). Nothing is saved.
import { PrototypeSwitcher } from "@kestrel/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	areaM2,
	findOverlaps,
	loadImage,
	makeSampleUnderlay,
	type ProtoSpace,
} from "./shared.tsx";
import { name as boxesName, VariantBoxes } from "./VariantBoxes.tsx";
import { name as fillName, VariantFill } from "./VariantFill.tsx";
import { name as penName, VariantPen } from "./VariantPen.tsx";

const VARIANTS = [
	{ key: "A", name: penName, Component: VariantPen },
	{ key: "B", name: boxesName, Component: VariantBoxes },
	{ key: "C", name: fillName, Component: VariantFill },
] as const;

type Entry = { spaces: ProtoSpace[]; label: string };
type History = { past: Entry[]; present: ProtoSpace[]; future: Entry[] };

export function DrawingPrototype() {
	const [variant, setVariant] = useState(
		() => new URLSearchParams(location.search).get("variant") ?? "A",
	);
	const [underlay, setUnderlay] = useState<HTMLImageElement | null>(null);
	const [opacity, setOpacity] = useState(0.6);
	const [gridOn, setGridOn] = useState(false);
	const [history, setHistory] = useState<History>({
		past: [],
		present: [],
		future: [],
	});
	const [debug, setDebugRaw] = useState<Record<string, unknown>>({});
	// Variants report on every render, so ignore reports that have not changed.
	const setDebug = useCallback(
		(next: Record<string, unknown>) =>
			setDebugRaw((prev) =>
				JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
			),
		[],
	);
	const [hint, setHint] = useState("");
	const canvasRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 800, height: 600 });

	const spaces = history.present;
	const overlaps = useMemo(() => findOverlaps(spaces), [spaces]);

	useEffect(() => {
		makeSampleUnderlay().then(setUnderlay);
	}, []);

	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (entry)
				setSize({
					width: entry.contentRect.width,
					height: entry.contentRect.height,
				});
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const changeVariant = (key: string) => {
		setVariant(key);
		const url = new URL(location.href);
		url.searchParams.set("variant", key);
		window.history.replaceState(null, "", url);
	};

	const commit = (next: ProtoSpace[], label: string) =>
		setHistory((h) => ({
			past: [...h.past, { spaces: h.present, label }],
			present: next,
			future: [],
		}));

	const undo = () =>
		setHistory((h) => {
			const prev = h.past.at(-1);
			if (!prev) return h;
			return {
				past: h.past.slice(0, -1),
				present: prev.spaces,
				future: [{ spaces: h.present, label: prev.label }, ...h.future],
			};
		});
	const redo = () =>
		setHistory((h) => {
			const [next, ...rest] = h.future;
			if (!next) return h;
			return {
				past: [...h.past, { spaces: h.present, label: next.label }],
				present: next.spaces,
				future: rest,
			};
		});

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const current = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
	const Variant = current.Component;

	return (
		<div
			style={{
				display: "grid",
				gridTemplateRows: "auto auto 1fr",
				gridTemplateColumns: "1fr 320px",
				height: "100%",
			}}
		>
			<header style={headerStyle}>
				<strong>Kestrel · drawing prototype</strong>
				<label>
					Underlay{" "}
					<input
						type="file"
						accept="image/*"
						onChange={async (e) => {
							const file = e.target.files?.[0];
							if (file) setUnderlay(await loadImage(URL.createObjectURL(file)));
						}}
					/>
				</label>
				<button
					type="button"
					onClick={() => makeSampleUnderlay().then(setUnderlay)}
				>
					Sample plan
				</button>
				<label>
					Opacity{" "}
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={opacity}
						onChange={(e) => setOpacity(Number(e.target.value))}
					/>
				</label>
				<label>
					<input
						type="checkbox"
						checked={gridOn}
						onChange={(e) => setGridOn(e.target.checked)}
					/>{" "}
					Grid snap (0.5 m)
				</label>
				<button type="button" onClick={undo} disabled={!history.past.length}>
					↶ Undo
				</button>
				<button type="button" onClick={redo} disabled={!history.future.length}>
					↷ Redo
				</button>
				<button
					type="button"
					onClick={() => commit([], "clear all")}
					disabled={!spaces.length}
				>
					Clear
				</button>
			</header>
			<div style={hintStyle}>
				{hint} · Scroll to zoom · hold Space and drag to pan · Ctrl+Z undo
			</div>
			<div
				ref={canvasRef}
				style={{ position: "relative", overflow: "hidden", gridColumn: 1 }}
			>
				<Variant
					key={current.key}
					spaces={spaces}
					commit={commit}
					underlay={underlay}
					underlayOpacity={opacity}
					grid={gridOn ? 10 : null}
					overlaps={overlaps}
					width={size.width}
					height={size.height}
					setDebug={setDebug}
					setHint={setHint}
				/>
			</div>
			<aside style={panelStyle}>
				<h3 style={h3}>Variant</h3>
				<div>
					{current.key} – {current.name}
				</div>
				<h3 style={h3}>Tool state</h3>
				<pre style={pre}>{JSON.stringify(debug, null, 2)}</pre>
				<h3 style={h3}>
					Spaces ({spaces.length}){" "}
					{overlaps.length > 0 && (
						<span style={{ color: "#dc2626" }}>
							· {overlaps.length} overlap(s)
						</span>
					)}
				</h3>
				<table style={{ width: "100%", fontSize: 12 }}>
					<tbody>
						{spaces.map((s) => (
							<tr key={s.id}>
								<td>{s.id}</td>
								<td>{s.points.length} corners</td>
								<td style={{ textAlign: "right" }}>
									{areaM2(s.points).toFixed(1)} m²
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<h3 style={h3}>History ({history.past.length})</h3>
				<ol style={{ fontSize: 12, paddingLeft: 18, margin: 0 }}>
					{history.past.map((h, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: prototype
						<li key={i}>{h.label}</li>
					))}
				</ol>
			</aside>
			{import.meta.env.DEV && (
				<PrototypeSwitcher
					variants={VARIANTS}
					current={current.key}
					onChange={changeVariant}
				/>
			)}
		</div>
	);
}

const headerStyle = {
	gridColumn: "1 / -1",
	display: "flex",
	gap: 14,
	alignItems: "center",
	flexWrap: "wrap",
	padding: "8px 12px",
	borderBottom: "1px solid #e2e8f0",
	background: "#fff",
	font: "13px system-ui, sans-serif",
} as const;

const hintStyle = {
	gridColumn: "1 / -1",
	padding: "6px 12px",
	background: "#fef9c3",
	borderBottom: "1px solid #fde68a",
	font: "13px system-ui, sans-serif",
} as const;

const panelStyle = {
	gridColumn: 2,
	gridRow: 3,
	overflow: "auto",
	padding: "8px 12px 80px",
	borderLeft: "1px solid #e2e8f0",
	background: "#fff",
	font: "13px system-ui, sans-serif",
} as const;

const h3 = {
	fontSize: 12,
	textTransform: "uppercase",
	color: "#64748b",
	margin: "14px 0 6px",
} as const;
const pre = {
	fontSize: 11,
	background: "#f1f5f9",
	padding: 8,
	borderRadius: 4,
	margin: 0,
	whiteSpace: "pre-wrap",
} as const;
