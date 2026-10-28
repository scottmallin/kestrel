import type { Draft } from "@kestrel/domain";
import { findOverlaps } from "@kestrel/geometry";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useStore } from "zustand";
import {
	api,
	type Category,
	type LevelDetails,
	type MapDetails,
} from "../api.ts";
import { deleteSelection, mergeSelection } from "./actions.ts";
import { LevelCanvas } from "./LevelCanvas.tsx";
import { PublishPanel } from "./PublishPanel.tsx";
import { SidePanel } from "./SidePanel.tsx";
import { createEditorStore } from "./store.ts";
import { createDraftSync, type SyncStatus } from "./sync.ts";
import type { ToolContext, ToolName } from "./tool.ts";
import { useBoxTool } from "./tools/useBoxTool.tsx";
import { useFillTool } from "./tools/useFillTool.tsx";
import { usePenTool } from "./tools/usePenTool.tsx";
import { useSplitTool } from "./tools/useSplitTool.tsx";
import { loadUnderlay, toUploadablePng, type Underlay } from "./underlay.ts";
import { useViewport } from "./useViewport.ts";

const TOOLS: { name: ToolName; label: string; key: string }[] = [
	{ name: "box", label: "▭ Box", key: "B" },
	{ name: "fill", label: "🪣 Magic fill", key: "F" },
	{ name: "split", label: "✂ Split", key: "S" },
	{ name: "pen", label: "✎ Pen", key: "P" },
];

/** Snapping reaches this far on screen, whatever the zoom. */
const SNAP_PIXELS = 10;
const GRID_METRES = 0.5;
/** Overlaps smaller than this (m²) are drawing noise, not mistakes worth flagging. */
const MIN_OVERLAP = 0.05;

type EditorProps = {
	map: MapDetails;
	/** The Draft as loaded from the server, and its sequence number. */
	initial: { seq: number; draft: Draft };
	onExit: () => void;
};

export function Editor({ map, initial, onExit }: EditorProps) {
	const level = map.levels[0] as LevelDetails;
	const [saveStatus, setSaveStatus] = useState<SyncStatus>("saved");
	const [{ store, sync }] = useState(() => {
		const sync = createDraftSync({
			save: (baseSeq, operations) =>
				api.saveOperations(map.id, baseSeq, operations),
			seq: initial.seq,
			onStatus: setSaveStatus,
		});
		const store = createEditorStore(initial.draft, {
			onApplied: (operation) => sync.push(operation),
		});
		return { store, sync };
	});
	const { history, selection, error } = useStore(store);
	const [toolName, setToolName] = useState<ToolName>("box");
	const [underlay, setUnderlay] = useState<Underlay | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [published, setPublished] = useState(
		map.published && { version: map.published.version },
	);
	const [publishing, setPublishing] = useState(false);
	const [shownEmbed, setShownEmbed] = useState<{
		version: number;
		embedId: string;
	} | null>(null);

	/** Publishes once every edit has reached the server, so what's published is what you see. */
	const publish = async () => {
		setPublishing(true);
		setNotice(null);
		try {
			await sync.idle();
			if (sync.status() !== "saved")
				throw new Error("some edits haven't been saved yet");
			const result = await api.publish(map.id);
			setPublished({ version: result.version });
			setShownEmbed(result);
		} catch (e) {
			setNotice(
				`Couldn't publish: ${e instanceof Error ? e.message : String(e)}`,
			);
		} finally {
			setPublishing(false);
		}
	};

	useEffect(() => {
		if (level.underlay)
			void loadUnderlay(
				api.underlayUrl(level.id),
				level.underlay.pixelsPerMetre,
			).then(setUnderlay);
	}, [level]);

	// Warn before leaving with edits that haven't reached the server.
	useEffect(() => {
		if (saveStatus === "saved") return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [saveStatus]);

	/** Uploads a floor plan for this Level (converted to PNG first) and shows it. */
	const applyFloorPlan = async (file: Blob) => {
		setNotice("Uploading floor plan…");
		try {
			await api.uploadUnderlay(level.id, await toUploadablePng(file));
			setUnderlay(
				await loadUnderlay(`${api.underlayUrl(level.id)}?v=${Date.now()}`),
			);
			setNotice(null);
		} catch (e) {
			setNotice(
				`Couldn't use that floor plan: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	};
	const [opacity, setOpacity] = useState(0.6);
	const [gridOn, setGridOn] = useState(false);
	const [size, setSize] = useState({ width: 800, height: 600 });
	const canvasArea = useRef<HTMLDivElement>(null);
	const viewport = useViewport(size.width, size.height);

	const draft = history.draft;
	// The Draft covers the whole Map; show the Level being edited.
	const spaces = useMemo(
		() => Object.values(draft.spaces).filter((s) => s.levelId === level.id),
		[draft, level],
	);
	const listings = useMemo(() => Object.values(draft.listings), [draft]);
	const existingSpaceIds = useMemo(
		() => new Set(Object.keys(draft.spaces)),
		[draft],
	);
	// A Space is labelled with the first Listing placed in it.
	const listingNames = useMemo(() => {
		const names = new Map<string, string>();
		for (const listing of listings) {
			for (const id of listing.spaceIds)
				if (!names.has(id)) names.set(id, listing.name);
		}
		return names;
	}, [listings]);
	const [categories, setCategories] = useState<Category[]>([]);
	useEffect(() => {
		api.listCategories().then(setCategories, () => setCategories([]));
	}, []);
	const overlaps = useMemo(
		() =>
			findOverlaps(
				spaces.map((s) => s.outline),
				MIN_OVERLAP,
			),
		[spaces],
	);

	useEffect(() => {
		const el = canvasArea.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry)
				setSize({
					width: entry.contentRect.width,
					height: entry.contentRect.height,
				});
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const { fit } = viewport;
	useEffect(() => {
		if (underlay) {
			fit(
				underlay.image.naturalWidth / underlay.pixelsPerMetre,
				underlay.image.naturalHeight / underlay.pixelsPerMetre,
			);
		}
	}, [underlay, fit]);

	const ctx: ToolContext = {
		store,
		draft,
		selection,
		levelId: level.id,
		scale: viewport.view.scale,
		tolerance: SNAP_PIXELS / viewport.view.scale,
		grid: gridOn ? GRID_METRES : undefined,
		underlay,
	};
	const tools = {
		box: useBoxTool(ctx),
		fill: useFillTool(ctx),
		split: useSplitTool(ctx),
		pen: usePenTool(ctx),
	};
	const tool = tools[toolName];

	const latestTool = useRef(tool);
	latestTool.current = tool;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const field = (e.target as HTMLElement).closest<HTMLElement>(
				"input, textarea, select",
			);
			if (field) {
				// Esc leaves a text field, so shortcuts work again without reaching for the mouse.
				if (e.key === "Escape") field.blur();
				return;
			}
			if (latestTool.current.onKeyDown?.(e)) return e.preventDefault();
			const { undo, redo, select } = store.getState();
			const command = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();
			if (command && key === "z") (e.shiftKey ? redo : undo)();
			else if (command && key === "y") redo();
			else if (command) return;
			else if (key === "delete" || key === "backspace") deleteSelection(store);
			else if (key === "m") mergeSelection(store);
			else if (key === "escape") {
				select([]);
				setToolName("box");
			} else {
				const match = TOOLS.find((t) => t.key.toLowerCase() === key);
				if (!match) return;
				setToolName(match.name);
			}
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [store]);

	const message = error ?? notice ?? tool.status;

	return (
		<div style={layout}>
			<header style={toolbar}>
				<button type="button" onClick={onExit} title="Back to your Maps">
					←
				</button>
				<strong>{map.name}</strong>
				<SaveIndicator status={saveStatus} />
				<button
					type="button"
					onClick={() => void publish()}
					disabled={publishing}
					style={publishButton}
				>
					{publishing ? "Publishing…" : "Publish"}
				</button>
				{published && (
					<span style={{ color: "#64748b" }}>
						Live: version {published.version}
					</span>
				)}
				<div style={group} role="toolbar" aria-label="Drawing tools">
					{TOOLS.map((t) => (
						<button
							key={t.name}
							type="button"
							aria-pressed={toolName === t.name}
							style={toolButton(toolName === t.name)}
							onClick={() => setToolName(t.name)}
							title={`${t.label} (${t.key})`}
						>
							{t.label}
						</button>
					))}
				</div>
				<div style={group}>
					<button
						type="button"
						onClick={() => mergeSelection(store)}
						disabled={selection.length < 2}
					>
						Merge (M)
					</button>
					<button
						type="button"
						onClick={() => deleteSelection(store)}
						disabled={selection.length === 0}
					>
						Delete
					</button>
					<button
						type="button"
						onClick={store.getState().undo}
						disabled={history.undoStack.length === 0}
					>
						↶ Undo
					</button>
					<button
						type="button"
						onClick={store.getState().redo}
						disabled={history.redoStack.length === 0}
					>
						↷ Redo
					</button>
				</div>
				<div style={group}>
					<label>
						Floor plan{" "}
						<input
							type="file"
							accept="image/*"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) void applyFloorPlan(file);
							}}
						/>
					</label>
					<button
						type="button"
						onClick={async () =>
							void applyFloorPlan(
								await (await fetch("/sample-plan.svg")).blob(),
							)
						}
					>
						Use sample plan
					</button>
					<label>
						Plan opacity{" "}
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
						Snap to 0.5 m grid
					</label>
				</div>
				{tool.options && <div style={group}>{tool.options}</div>}
			</header>
			{(saveStatus === "conflict" || saveStatus === "rejected") && (
				<div role="alert" style={alertBar}>
					{sync.error()} Your latest edits weren't saved.{" "}
					<button type="button" onClick={() => window.location.reload()}>
						Reload the Map
					</button>
				</div>
			)}
			<div
				role="status"
				style={statusBar(message !== null && message !== undefined)}
			>
				{message ?? tool.hint}
				<span style={{ color: "#64748b" }}>
					{" "}
					· Scroll to zoom · hold Space and drag to pan · Ctrl+Z undo
				</span>
			</div>
			<div
				ref={canvasArea}
				style={{ overflow: "hidden", position: "relative" }}
			>
				<LevelCanvas
					width={size.width}
					height={size.height}
					viewport={viewport}
					tool={tool}
					spaces={spaces}
					selection={selection}
					overlaps={overlaps}
					listingNames={listingNames}
					underlay={underlay}
					underlayOpacity={opacity}
				/>
				{shownEmbed && (
					<PublishPanel
						version={shownEmbed.version}
						embedId={shownEmbed.embedId}
						mapName={map.name}
						onClose={() => setShownEmbed(null)}
					/>
				)}
			</div>
			<SidePanel
				store={store}
				mapId={map.id}
				spaces={spaces}
				listings={listings}
				existingSpaceIds={existingSpaceIds}
				categories={categories}
				onCreateCategory={async (name) => {
					const category = await api.createCategory(name);
					setCategories((all) => [...all, category]);
					return category;
				}}
				selection={selection}
				overlapCount={overlaps.length}
			/>
		</div>
	);
}

const layout: CSSProperties = {
	display: "grid",
	gridTemplateRows: "auto auto 1fr",
	gridTemplateColumns: "1fr 320px",
	height: "100%",
	font: "13px system-ui, sans-serif",
};
const toolbar: CSSProperties = {
	gridColumn: "1 / -1",
	display: "flex",
	flexWrap: "wrap",
	alignItems: "center",
	gap: 16,
	padding: "8px 12px",
	background: "#fff",
	borderBottom: "1px solid #e2e8f0",
};
const group: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const toolButton = (active: boolean): CSSProperties => ({
	padding: "6px 10px",
	borderRadius: 6,
	border: "1px solid #cbd5e1",
	background: active ? "#1d4fc4" : "#fff",
	color: active ? "#fff" : "#0f172a",
	cursor: "pointer",
});
const statusBar = (problem: boolean): CSSProperties => ({
	gridColumn: "1 / -1",
	padding: "6px 12px",
	background: problem ? "#fee2e2" : "#fef9c3",
	borderBottom: `1px solid ${problem ? "#fecaca" : "#fde68a"}`,
});

const SAVE_LABELS: Record<SyncStatus, string> = {
	saved: "All changes saved",
	saving: "Saving…",
	offline: "Offline – will retry",
	conflict: "Not saved",
	rejected: "Not saved",
};

function SaveIndicator({ status }: { status: SyncStatus }) {
	const ok = status === "saved" || status === "saving";
	return (
		<span
			data-testid="save-status"
			style={{ color: ok ? "#64748b" : "#b91c1c" }}
		>
			{SAVE_LABELS[status]}
		</span>
	);
}

const alertBar: CSSProperties = {
	gridColumn: "1 / -1",
	padding: "8px 12px",
	background: "#fee2e2",
	borderBottom: "1px solid #fecaca",
	color: "#7f1d1d",
};

const publishButton: CSSProperties = {
	padding: "6px 14px",
	borderRadius: 6,
	border: "none",
	background: "#16a34a",
	color: "#fff",
	fontWeight: 600,
	cursor: "pointer",
};
