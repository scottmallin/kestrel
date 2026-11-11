import { type Draft, levelSetup } from "@kestrel/domain";
import { DEFAULT_PLACEMENT, findOverlaps, toPlane } from "@kestrel/geometry";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useStore } from "zustand";
import { api, type Category, type MapDetails } from "../api.ts";
import { deleteSelection, mergeSelection } from "./actions.ts";
import { Legend } from "./Legend.tsx";
import { LevelCanvas } from "./LevelCanvas.tsx";
import { LevelPanel } from "./LevelPanel.tsx";
import { PublishPanel } from "./PublishPanel.tsx";
import { SidePanel } from "./SidePanel.tsx";
import { createEditorStore } from "./store.ts";
import { createDraftSync, type SyncStatus } from "./sync.ts";
import type { ToolContext, ToolName } from "./tool.ts";
import { useAlignTool } from "./tools/useAlignTool.tsx";
import { useBoxTool } from "./tools/useBoxTool.tsx";
import { useFillTool } from "./tools/useFillTool.tsx";
import { usePenTool } from "./tools/usePenTool.tsx";
import { useScaleTool } from "./tools/useScaleTool.tsx";
import { useSplitTool } from "./tools/useSplitTool.tsx";
import {
	loadUnderlayImage,
	toUploadablePng,
	type Underlay,
} from "./underlay.ts";
import { useViewport } from "./useViewport.ts";

/** Inputs that take no typing, so keyboard shortcuts still work while they have focus. */
const NON_TEXT_INPUTS = new Set([
	"checkbox",
	"radio",
	"range",
	"button",
	"submit",
	"reset",
	"file",
	"color",
]);

/** Tools that draw or change Spaces: locked on a Level whose plan isn't set up yet (ADR 0008 amendment). */
const DRAWING_TOOLS: readonly ToolName[] = ["box", "fill", "split", "pen"];

const TOOLS: { name: ToolName; label: string; key: string }[] = [
	{ name: "box", label: "▭ Box", key: "B" },
	{ name: "fill", label: "🪣 Magic fill", key: "F" },
	{ name: "split", label: "✂ Split", key: "S" },
	{ name: "pen", label: "✎ Pen", key: "P" },
	{ name: "scale", label: "📏 Set scale", key: "K" },
	{ name: "align", label: "📌 Align plan", key: "A" },
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
	const { history, selection, error, levelId } = useStore(store);
	const level = history.draft.levels[levelId];
	/** Which Levels have a floor plan, and at what scale; updated as plans are uploaded. */
	const [underlayDetails, setUnderlayDetails] = useState(map.underlays);
	const [toolName, setToolName] = useState<ToolName>("box");
	const [underlayImage, setUnderlayImage] = useState<HTMLImageElement | null>(
		null,
	);
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

	// Each Level has its own floor plan; load the shown one's when switching Level.
	const version = underlayDetails[levelId]?.version;
	useEffect(() => {
		setUnderlayImage(null);
		if (!version) return;
		let current = true;
		void loadUnderlayImage(api.underlayUrl(map.id, levelId, version)).then(
			(image) => {
				if (current) setUnderlayImage(image);
			},
		);
		return () => {
			current = false;
		};
	}, [map.id, levelId, version]);
	// Where the plan sits comes from the Draft, so setting the scale or aligning can be undone (ADR 0008).
	const placement = history.draft.placements[levelId] ?? DEFAULT_PLACEMENT;
	const underlay = useMemo<Underlay | null>(
		() => (underlayImage ? { image: underlayImage, placement } : null),
		[underlayImage, placement],
	);
	const underlayLevelIds = useMemo(
		() => new Set(Object.keys(underlayDetails)),
		[underlayDetails],
	);
	const hasPlan = underlayLevelIds.has(levelId);
	const setup = levelSetup(history.draft, levelId, { hasPlan });
	/** Why a tool can't be used on this Level right now, or null if it can. */
	const blocked = (name: ToolName): string | null => {
		if (DRAWING_TOOLS.includes(name) && setup === "setScale")
			return "Set the scale of this Level's floor plan before drawing on it";
		if (DRAWING_TOOLS.includes(name) && setup === "align")
			return "Align this Level's floor plan before drawing on it";
		if (name === "align" && !hasPlan)
			return "Upload a floor plan for this Level first";
		if (name === "align" && !history.draft.placements[levelId])
			return "Set this plan's scale first, then align it";
		return null;
	};
	// A locked tool gives way to the Level's next setup step.
	const activeTool: ToolName =
		blocked(toolName) === null
			? toolName
			: setup === "setScale"
				? "scale"
				: setup === "align"
					? "align"
					: "box";
	const latestBlocked = useRef(blocked);
	latestBlocked.current = blocked;
	// Make the setup step the chosen tool, so its confirmation stays on screen once the Level unlocks.
	useEffect(() => {
		if (activeTool !== toolName) setToolName(activeTool);
	}, [activeTool, toolName]);
	// Once a plan's own scale is set, go straight on to aligning it.
	const previousSetup = useRef(setup);
	useEffect(() => {
		if (previousSetup.current === "setScale" && setup === "align")
			setToolName("align");
		previousSetup.current = setup;
	}, [setup]);

	// Warn before leaving with edits that haven't reached the server.
	useEffect(() => {
		if (saveStatus === "saved") return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [saveStatus]);

	/** Uploads a floor plan for the Level being shown (converted to PNG first) and shows it. */
	const applyFloorPlan = async (file: Blob) => {
		setNotice("Uploading floor plan…");
		const forLevel = levelId;
		try {
			await api.uploadUnderlay(map.id, forLevel, await toUploadablePng(file));
			// The new upload has a new version; switching to it loads the new image.
			setUnderlayDetails((await api.getMap(map.id)).underlays);
			// A new image may be framed differently, so it has to be aligned again (ADR 0008 amendment).
			const { history, perform } = store.getState();
			if (history.draft.placements[forLevel]) {
				perform({ type: "placeUnderlay", levelId: forLevel, placement: null });
				setNotice(
					"New floor plan uploaded: set its scale and align it before drawing on it.",
				);
			} else setNotice(null);
		} catch (e) {
			setNotice(
				`Couldn't use that floor plan: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	};
	const [opacity, setOpacity] = useState(0.6);
	const [gridOn, setGridOn] = useState(false);
	const [size, setSize] = useState({ width: 800, height: 600 });
	/** Whether size is the canvas's real size yet. */
	const [measured, setMeasured] = useState(false);
	const canvasArea = useRef<HTMLDivElement>(null);
	const viewport = useViewport(size.width, size.height);

	const draft = history.draft;
	// The Draft covers the whole Map; show the Level being edited.
	const spaces = useMemo(
		() => Object.values(draft.spaces).filter((s) => s.levelId === levelId),
		[draft, levelId],
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
			if (!entry) return;
			setSize({
				width: entry.contentRect.width,
				height: entry.contentRect.height,
			});
			setMeasured(true);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const { fit } = viewport;
	// Fit the plan whenever it's shown, rescaled or moved, but not when the canvas merely changes size (a
	// tool's options can wrap the toolbar), so choosing a tool never throws away your zoom.
	const fitted = useRef<Underlay | null>(null);
	useEffect(() => {
		// Wait for the canvas's real size, or the first fit would use the placeholder one.
		if (!underlay || !measured || fitted.current === underlay) return;
		fitted.current = underlay;
		const { image, placement } = underlay;
		const corners = [
			{ x: 0, y: 0 },
			{ x: image.naturalWidth, y: 0 },
			{ x: image.naturalWidth, y: image.naturalHeight },
			{ x: 0, y: image.naturalHeight },
		].map((p) => toPlane(placement, p));
		const xs = corners.map((p) => p.x);
		const ys = corners.map((p) => p.y);
		fit({
			minX: Math.min(...xs),
			minY: Math.min(...ys),
			maxX: Math.max(...xs),
			maxY: Math.max(...ys),
		});
	}, [underlay, fit, measured]);

	const ctx: ToolContext = {
		store,
		draft,
		selection,
		levelId,
		scale: viewport.view.scale,
		tolerance: SNAP_PIXELS / viewport.view.scale,
		grid: gridOn ? GRID_METRES : undefined,
		underlay,
		underlayLevelIds,
		underlayUrl: (id) => {
			const version = underlayDetails[id]?.version;
			return version ? api.underlayUrl(map.id, id, version) : null;
		},
	};
	const tools = {
		box: useBoxTool(ctx),
		fill: useFillTool(ctx),
		split: useSplitTool(ctx),
		pen: usePenTool(ctx),
		scale: useScaleTool(ctx),
		align: useAlignTool(ctx),
	};
	const tool = tools[activeTool];

	const latestTool = useRef(tool);
	latestTool.current = tool;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Typing goes to text fields; anything else (a checkbox, a slider) keeps the shortcuts working.
			const field = (e.target as HTMLElement).closest<HTMLElement>(
				"input, textarea, select, [contenteditable]",
			);
			if (field && !NON_TEXT_INPUTS.has((field as HTMLInputElement).type)) {
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
				if (!match || latestBlocked.current(match.name)) return;
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
				{level && <span style={{ color: "#64748b" }}>{level.name}</span>}
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
							aria-pressed={activeTool === t.name}
							style={toolButton(activeTool === t.name)}
							onClick={() => setToolName(t.name)}
							disabled={blocked(t.name) !== null}
							title={blocked(t.name) ?? `${t.label} (${t.key})`}
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
			<LevelPanel
				store={store}
				draft={draft}
				levelId={levelId}
				underlayLevelIds={underlayLevelIds}
				onChooseTool={setToolName}
			/>
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
				<Legend
					kinds={spaces.map((s) => s.kind)}
					overlapping={overlaps.length > 0}
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
	gridTemplateColumns: "180px 1fr 320px",
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
