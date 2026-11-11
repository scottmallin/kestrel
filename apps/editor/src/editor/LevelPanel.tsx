import { type Draft, type Level, levelSetup } from "@kestrel/domain";
import { type CSSProperties, useState } from "react";
import type { EditorStore } from "./store.ts";
import type { ToolName } from "./tool.ts";

type Props = {
	store: EditorStore;
	draft: Draft;
	/** The Level being shown. */
	levelId: string;
	/** Levels with a floor plan uploaded. */
	underlayLevelIds: ReadonlySet<string>;
	onChooseTool: (tool: ToolName) => void;
};

/** What each setup step is called, for Levels that aren't ready to draw on. */
const NEXT_STEP = { setScale: "Set scale", align: "Align plan" } as const;

/** A name for a new Level at this floor number. */
export function levelName(ordinal: number): string {
	if (ordinal === 0) return "Ground floor";
	if (ordinal > 0) return `Level ${ordinal}`;
	return ordinal === -1 ? "Basement" : `Basement ${-ordinal}`;
}

/** The floors of the Map, highest first, with controls for the one being shown (ADR 0007). */
export function LevelPanel({
	store,
	draft,
	levelId,
	underlayLevelIds,
	onChooseTool,
}: Props) {
	const setupOf = (id: string) =>
		levelSetup(draft, id, { hasPlan: underlayLevelIds.has(id) });
	const setup = setupOf(levelId);
	const levels = Object.values(draft.levels).sort(
		(a, b) => b.ordinal - a.ordinal,
	);
	const index = levels.findIndex((l) => l.id === levelId);
	const current = levels[index];
	const [renaming, setRenaming] = useState(false);
	const [confirmingRemoval, setConfirmingRemoval] = useState(false);
	const { perform, showLevel } = store.getState();
	const spaceCount = Object.values(draft.spaces).filter(
		(s) => s.levelId === levelId,
	).length;

	const add = (ordinal: number) => {
		const level: Level = {
			id: crypto.randomUUID(),
			name: levelName(ordinal),
			ordinal,
		};
		perform({ type: "addLevel", level });
		store.getState().showLevel(level.id);
	};
	/** Swaps floor numbers between the shown Level and a neighbouring one. */
	const swapWith = (other: Level | undefined) => {
		if (!current || !other) return;
		perform({
			type: "reorderLevels",
			ordinals: { [current.id]: other.ordinal, [other.id]: current.ordinal },
		});
	};
	const top = levels[0]?.ordinal ?? 0;
	const bottom = levels.at(-1)?.ordinal ?? 0;

	return (
		<nav style={panel} aria-label="Levels">
			<button
				type="button"
				style={addButton}
				onClick={() => add(top + 1)}
				title="Add a Level above the top floor"
			>
				+ Level above
			</button>
			<ol style={list}>
				{levels.map((level) => (
					<li key={level.id}>
						<button
							type="button"
							aria-current={level.id === levelId ? "true" : undefined}
							style={levelButton(level.id === levelId)}
							onClick={() => {
								setRenaming(false);
								setConfirmingRemoval(false);
								showLevel(level.id);
							}}
						>
							<span style={ordinalBadge}>{level.ordinal}</span>
							{level.name}
							{setupOf(level.id) !== "ready" && (
								<span style={needsBadge(level.id === levelId)}>
									{NEXT_STEP[setupOf(level.id) as keyof typeof NEXT_STEP]}
								</span>
							)}
						</button>
					</li>
				))}
			</ol>
			<button
				type="button"
				style={addButton}
				onClick={() => add(bottom - 1)}
				title="Add a Level below the lowest floor"
			>
				+ Level below
			</button>

			{setup !== "ready" && (
				<section style={setupBox} aria-label="Set up this Level">
					<strong>Before drawing on this Level</strong>
					<ol style={{ margin: 0, paddingLeft: 18 }}>
						<li>✓ Floor plan uploaded</li>
						<li>
							{setup === "setScale" ? (
								<>
									Set its scale: draw a line along something you know the length
									of.{" "}
									<button type="button" onClick={() => onChooseTool("scale")}>
										Set scale
									</button>
								</>
							) : (
								"✓ Scale set"
							)}
						</li>
						{/* The first plan defines the plane; every later one is aligned to it. */}
						{draft.scaleSet && (
							<li>
								Align it to another floor by two matching points.{" "}
								{setup === "align" && (
									<button type="button" onClick={() => onChooseTool("align")}>
										Align plan
									</button>
								)}
							</li>
						)}
					</ol>
				</section>
			)}

			{current && renaming && (
				<form
					style={row}
					onSubmit={(e) => {
						e.preventDefault();
						const name = new FormData(e.currentTarget).get("name");
						if (
							typeof name === "string" &&
							name.trim() &&
							name !== current.name
						)
							perform({
								type: "updateLevel",
								id: current.id,
								changes: { name: name.trim() },
							});
						setRenaming(false);
					}}
				>
					<input
						name="name"
						aria-label="Level name"
						defaultValue={current.name}
						maxLength={60}
						// biome-ignore lint/a11y/noAutofocus: the field appears because the user asked to rename.
						autoFocus
						onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
						style={{ minWidth: 0, flex: 1 }}
					/>
					<button type="submit">Save</button>
				</form>
			)}

			{current && confirmingRemoval && (
				<div role="alert" style={confirmBox}>
					{spaceCount > 0
						? `Delete ${current.name} and its ${spaceCount} Space${spaceCount === 1 ? "" : "s"}? Listings in them become Unplaced.`
						: `Delete ${current.name}?`}{" "}
					You can undo this.
					<div style={row}>
						<button
							type="button"
							style={dangerButton}
							onClick={() => {
								perform({ type: "removeLevel", id: current.id });
								setConfirmingRemoval(false);
							}}
						>
							Delete Level
						</button>
						<button type="button" onClick={() => setConfirmingRemoval(false)}>
							Cancel
						</button>
					</div>
				</div>
			)}

			{current && !renaming && !confirmingRemoval && (
				<div style={row}>
					<button
						type="button"
						onClick={() => setRenaming(true)}
						title="Rename this Level"
					>
						Rename
					</button>
					<button
						type="button"
						onClick={() => swapWith(levels[index - 1])}
						disabled={index <= 0}
						title="Move this Level up a floor"
						aria-label="Move up"
					>
						↑
					</button>
					<button
						type="button"
						onClick={() => swapWith(levels[index + 1])}
						disabled={index >= levels.length - 1}
						title="Move this Level down a floor"
						aria-label="Move down"
					>
						↓
					</button>
					<button
						type="button"
						onClick={() => setConfirmingRemoval(true)}
						disabled={levels.length <= 1}
						title={
							levels.length <= 1
								? "A Map needs at least one Level"
								: "Delete this Level"
						}
					>
						Delete
					</button>
				</div>
			)}
		</nav>
	);
}

const panel: CSSProperties = {
	// Beside the canvas, never over it, so it can't get in the way of drawing.
	gridRow: 3,
	gridColumn: 1,
	display: "flex",
	flexDirection: "column",
	gap: 6,
	padding: 8,
	minHeight: 0,
	overflowY: "auto",
	background: "#fff",
	borderRight: "1px solid #e2e8f0",
};
const list: CSSProperties = {
	listStyle: "none",
	margin: 0,
	padding: 0,
	display: "flex",
	flexDirection: "column",
	gap: 2,
};
const levelButton = (active: boolean): CSSProperties => ({
	display: "flex",
	alignItems: "center",
	gap: 8,
	width: "100%",
	padding: "6px 8px",
	borderRadius: 6,
	border: "1px solid",
	borderColor: active ? "#1d4fc4" : "transparent",
	background: active ? "#1d4fc4" : "transparent",
	color: active ? "#fff" : "#0f172a",
	textAlign: "left",
	cursor: "pointer",
});
const ordinalBadge: CSSProperties = {
	minWidth: 22,
	textAlign: "center",
	fontVariantNumeric: "tabular-nums",
	fontWeight: 600,
	opacity: 0.8,
};
const addButton: CSSProperties = {
	padding: "4px 8px",
	border: "1px dashed #cbd5e1",
	borderRadius: 6,
	background: "transparent",
	color: "#475569",
	cursor: "pointer",
};
const row: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap" };
const confirmBox: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 6,
	padding: 8,
	borderRadius: 6,
	background: "#fee2e2",
	color: "#7f1d1d",
};
const dangerButton: CSSProperties = {
	background: "#b91c1c",
	color: "#fff",
	border: "none",
	borderRadius: 4,
	padding: "4px 8px",
	cursor: "pointer",
};
const needsBadge = (onActive: boolean): CSSProperties => ({
	marginLeft: "auto",
	padding: "1px 6px",
	borderRadius: 999,
	fontSize: 11,
	background: onActive ? "#fef3c7" : "#fef9c3",
	color: "#92400e",
	whiteSpace: "nowrap",
});
const setupBox: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 6,
	padding: 8,
	borderRadius: 6,
	background: "#fef9c3",
	border: "1px solid #fde68a",
	color: "#713f12",
};
