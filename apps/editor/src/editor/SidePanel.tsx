import {
	type Listing,
	type ListingChanges,
	SPACE_KINDS,
	type Space,
	type SpaceKind,
} from "@kestrel/domain";
import { polygonArea } from "@kestrel/geometry";
import { type CSSProperties, useState } from "react";
import { api, type Category } from "../api.ts";
import type { EditorStore } from "./store.ts";
import { toUploadablePng } from "./underlay.ts";

type Props = {
	store: EditorStore;
	mapId: string;
	/** Spaces on the Level being edited. */
	spaces: readonly Space[];
	listings: readonly Listing[];
	/** Every Space id in the Draft, to tell placed Listings from Unplaced ones. */
	existingSpaceIds: ReadonlySet<string>;
	categories: readonly Category[];
	onCreateCategory: (name: string) => Promise<Category>;
	selection: readonly string[];
	overlapCount: number;
};

/** Largest logo side, in pixels. */
const LOGO_PIXELS = 256;

export function SidePanel(props: Props) {
	const { store, spaces, listings, existingSpaceIds, selection } = props;
	const [tab, setTab] = useState<"spaces" | "listings">("spaces");
	const [editingId, setEditingId] = useState<string | null>(null);
	const editing = listings.find((l) => l.id === editingId);
	const selected =
		selection.length === 1
			? spaces.find((s) => s.id === selection[0])
			: undefined;
	const isPlaced = (l: Listing) =>
		l.spaceIds.some((id) => existingSpaceIds.has(id));

	/** Opens a Listing for editing, showing the Level it's on and selecting its Spaces there. */
	const openListing = (listing: Listing) => {
		setEditingId(listing.id);
		const { history, levelId, showLevel, select } = store.getState();
		const placed = listing.spaceIds.flatMap((id) => {
			const space = history.draft.spaces[id];
			return space ? [space] : [];
		});
		const there = placed.some((s) => s.levelId === levelId)
			? levelId
			: placed[0]?.levelId;
		if (there && there !== levelId) showLevel(there);
		select(placed.map((s) => s.id));
	};

	return (
		<aside style={panel} aria-label="Spaces and Listings">
			<div role="tablist" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
				{(["spaces", "listings"] as const).map((t) => (
					<button
						key={t}
						type="button"
						role="tab"
						aria-selected={tab === t && !editing}
						style={tabButton(tab === t && !editing)}
						onClick={() => {
							setTab(t);
							setEditingId(null);
						}}
					>
						{t === "spaces"
							? `Spaces (${spaces.length})`
							: `Listings (${listings.length})`}
					</button>
				))}
			</div>

			{editing ? (
				<ListingEditor
					{...props}
					listing={editing}
					placed={isPlaced(editing)}
					onDone={() => setEditingId(null)}
				/>
			) : tab === "spaces" ? (
				<>
					{selected && (
						<SelectedSpace
							{...props}
							space={selected}
							onOpenListing={openListing}
						/>
					)}
					<SpacesList {...props} />
				</>
			) : (
				<ListingsList
					{...props}
					isPlaced={isPlaced}
					onOpenListing={openListing}
				/>
			)}
		</aside>
	);
}

function SelectedSpace({
	store,
	space,
	listings,
	onOpenListing,
}: Props & { space: Space; onOpenListing: (listing: Listing) => void }) {
	const { perform } = store.getState();
	const here = listings.filter((l) => l.spaceIds.includes(space.id));
	return (
		<section aria-label="Selected Space">
			<h2 style={heading}>Selected Space</h2>
			<label style={field}>
				Space Reference
				<input
					key={space.id}
					defaultValue={space.reference ?? ""}
					placeholder="e.g. Unit 14"
					maxLength={60}
					onBlur={(e) => {
						const reference = e.target.value.trim() || null;
						if (reference !== (space.reference ?? null)) {
							perform({
								type: "updateSpace",
								id: space.id,
								changes: { reference },
							});
						}
					}}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
				/>
			</label>
			<label style={field}>
				Space Kind
				<select
					value={space.kind}
					onChange={(e) =>
						perform({
							type: "updateSpace",
							id: space.id,
							changes: { kind: e.target.value as SpaceKind },
						})
					}
				>
					{SPACE_KINDS.map((kind) => (
						<option key={kind} value={kind}>
							{kind}
						</option>
					))}
				</select>
			</label>
			<p style={{ margin: "4px 0" }}>
				{polygonArea(space.outline).toFixed(1)} m²
			</p>

			<h3 style={heading}>In this Space</h3>
			{here.length === 0 && <p style={muted}>No Listings yet.</p>}
			<ul style={plainList}>
				{here.map((listing) => (
					<li
						key={listing.id}
						style={{ display: "flex", gap: 6, alignItems: "center" }}
					>
						<button
							type="button"
							style={{ ...linkButton, flex: 1 }}
							onClick={() => onOpenListing(listing)}
						>
							{listing.name}
						</button>
						<button
							type="button"
							aria-label={`Take ${listing.name} out of this Space`}
							onClick={() =>
								perform({
									type: "updateListing",
									id: listing.id,
									changes: {
										spaceIds: listing.spaceIds.filter((id) => id !== space.id),
									},
								})
							}
						>
							Remove
						</button>
					</li>
				))}
			</ul>
			<AddListing
				key={space.id}
				store={store}
				space={space}
				listings={listings}
			/>
		</section>
	);
}

/** Search existing Listings to place here, or create a new one by name. */
function AddListing({
	store,
	space,
	listings,
}: {
	store: EditorStore;
	space: Space;
	listings: readonly Listing[];
}) {
	const [query, setQuery] = useState("");
	const { perform } = store.getState();
	const q = query.trim().toLowerCase();
	const matches = q
		? listings
				.filter(
					(l) =>
						!l.spaceIds.includes(space.id) && l.name.toLowerCase().includes(q),
				)
				.slice(0, 5)
		: [];
	const exact = listings.some((l) => l.name.toLowerCase() === q);

	const place = (listing: Listing) => {
		perform({
			type: "updateListing",
			id: listing.id,
			changes: { spaceIds: [...listing.spaceIds, space.id] },
		});
		setQuery("");
	};
	const create = () => {
		perform({
			type: "addListing",
			listing: {
				id: crypto.randomUUID(),
				name: query.trim(),
				spaceIds: [space.id],
			},
		});
		setQuery("");
	};

	return (
		<div style={{ marginTop: 8 }}>
			<label style={field}>
				Add a Listing
				<input
					value={query}
					placeholder="e.g. Boots"
					maxLength={120}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== "Enter" || !q) return;
						const [first] = matches;
						if (first) place(first);
						else create();
					}}
				/>
			</label>
			{q && (
				<ul style={plainList} aria-label="Listing suggestions">
					{matches.map((listing) => (
						<li key={listing.id}>
							<button
								type="button"
								style={linkButton}
								onClick={() => place(listing)}
							>
								Place {listing.name} here
							</button>
						</li>
					))}
					{!exact && (
						<li>
							<button type="button" style={linkButton} onClick={create}>
								Create “{query.trim()}”
							</button>
						</li>
					)}
				</ul>
			)}
		</div>
	);
}

function SpacesList({
	store,
	spaces,
	listings,
	selection,
	overlapCount,
}: Props) {
	const { select } = store.getState();
	// Name each Space as the canvas does: its first Listing, else its Space Reference, else its Kind.
	const listingName = (space: Space) =>
		listings.find((l) => l.spaceIds.includes(space.id))?.name;
	return (
		<section aria-label="All Spaces">
			<h2 style={heading}>
				All Spaces
				{overlapCount > 0 && (
					<span style={{ color: "#dc2626" }}>
						{" "}
						· {overlapCount} overlapping
					</span>
				)}
			</h2>
			{spaces.length === 0 && <p style={muted}>Nothing drawn yet.</p>}
			<ul style={plainList}>
				{spaces.map((space) => (
					<li key={space.id}>
						<button
							type="button"
							style={listItem(selection.includes(space.id))}
							onClick={(e) =>
								select(
									e.shiftKey
										? selection.includes(space.id)
											? selection.filter((id) => id !== space.id)
											: [...selection, space.id]
										: [space.id],
								)
							}
						>
							<span>
								{listingName(space) ?? space.reference ?? <em>{space.kind}</em>}
							</span>
							<span>{polygonArea(space.outline).toFixed(1)} m²</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function ListingsList({
	store,
	listings,
	categories,
	isPlaced,
	onOpenListing,
}: Props & {
	isPlaced: (l: Listing) => boolean;
	onOpenListing: (l: Listing) => void;
}) {
	const [onlyUnplaced, setOnlyUnplaced] = useState(false);
	const [name, setName] = useState("");
	const categoryName = new Map(categories.map((c) => [c.id, c.name]));
	const shown = [...listings]
		.filter((l) => !onlyUnplaced || !isPlaced(l))
		.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
	const unplacedCount = listings.filter((l) => !isPlaced(l)).length;

	return (
		<section aria-label="Listings">
			<form
				style={{ display: "flex", gap: 6, alignItems: "end" }}
				onSubmit={(e) => {
					e.preventDefault();
					if (!name.trim()) return;
					store.getState().perform({
						type: "addListing",
						listing: {
							id: crypto.randomUUID(),
							name: name.trim(),
							spaceIds: [],
						},
					});
					setName("");
				}}
			>
				<label style={{ ...field, flex: 1, marginBottom: 0 }}>
					New Listing
					<input
						value={name}
						maxLength={120}
						placeholder="Placed later"
						onChange={(e) => setName(e.target.value)}
					/>
				</label>
				<button type="submit">Add</button>
			</form>
			<label style={{ display: "block", margin: "10px 0" }}>
				<input
					type="checkbox"
					checked={onlyUnplaced}
					onChange={(e) => setOnlyUnplaced(e.target.checked)}
				/>{" "}
				Only Unplaced ({unplacedCount})
			</label>
			{shown.length === 0 && (
				<p style={muted}>
					{onlyUnplaced ? "Every Listing is placed." : "No Listings yet."}
				</p>
			)}
			<ul style={plainList}>
				{shown.map((listing) => (
					<li key={listing.id}>
						<button
							type="button"
							style={listItem(false)}
							onClick={() => onOpenListing(listing)}
						>
							<span>{listing.name}</span>
							<span style={muted}>
								{isPlaced(listing)
									? (categoryName.get(listing.categoryId ?? "") ?? "")
									: "Unplaced"}
							</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function ListingEditor({
	store,
	mapId,
	listing,
	placed,
	categories,
	onCreateCategory,
	onDone,
}: Props & { listing: Listing; placed: boolean; onDone: () => void }) {
	const { perform } = store.getState();
	const [newCategory, setNewCategory] = useState("");
	const [logoProblem, setLogoProblem] = useState<string | null>(null);
	const update = (changes: ListingChanges) =>
		perform({ type: "updateListing", id: listing.id, changes });

	/** A text field that saves when you leave it; an empty optional field clears it. */
	const textField = (
		label: string,
		prop: "name" | "description" | "website" | "hours",
		maxLength: number,
	) => (
		<label style={field}>
			{label}
			<input
				key={`${listing.id}-${prop}`}
				defaultValue={listing[prop] ?? ""}
				maxLength={maxLength}
				placeholder={
					prop === "website"
						? "https://…"
						: prop === "hours"
							? "e.g. Mon–Sat 9–8"
							: undefined
				}
				onBlur={(e) => {
					let value = e.target.value.trim();
					// People type "boots.com"; make it a web address the server will accept.
					if (prop === "website" && value && !/^https?:\/\//i.test(value))
						value = `https://${value}`;
					if (value === (listing[prop] ?? "")) return;
					if (prop === "name") {
						if (value) update({ name: value });
						else e.target.value = listing.name;
					} else update({ [prop]: value || null });
				}}
				onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
			/>
		</label>
	);

	return (
		<section aria-label={`Listing ${listing.name}`}>
			<button type="button" style={linkButton} onClick={onDone}>
				← Back
			</button>
			<h2 style={heading}>Listing{placed ? "" : " · Unplaced"}</h2>
			{!placed && (
				<p style={muted}>
					Select a Space on the map and add this Listing there to place it.
				</p>
			)}
			{textField("Name", "name", 120)}
			<label style={field}>
				Category
				<select
					value={listing.categoryId ?? ""}
					onChange={(e) => update({ categoryId: e.target.value || null })}
				>
					<option value="">None</option>
					{categories.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			</label>
			<form
				style={{ display: "flex", gap: 6, alignItems: "end", marginBottom: 8 }}
				onSubmit={async (e) => {
					e.preventDefault();
					if (!newCategory.trim()) return;
					const category = await onCreateCategory(newCategory.trim());
					update({ categoryId: category.id });
					setNewCategory("");
				}}
			>
				<label style={{ ...field, flex: 1, marginBottom: 0 }}>
					New Category
					<input
						value={newCategory}
						maxLength={60}
						onChange={(e) => setNewCategory(e.target.value)}
					/>
				</label>
				<button type="submit">Add</button>
			</form>
			<div style={field}>
				<span>Logo</span>
				{listing.logoKey && (
					<img
						src={api.logoUrl(listing.logoKey)}
						alt={`${listing.name} logo`}
						style={{ maxWidth: 96, maxHeight: 96 }}
					/>
				)}
				<input
					type="file"
					accept="image/*"
					aria-label="Logo file"
					onChange={async (e) => {
						const file = e.target.files?.[0];
						if (!file) return;
						try {
							setLogoProblem(null);
							const { logoKey } = await api.uploadLogo(
								mapId,
								await toUploadablePng(file, LOGO_PIXELS),
							);
							update({ logoKey });
						} catch (err) {
							setLogoProblem(
								`Couldn't use that logo: ${err instanceof Error ? err.message : String(err)}`,
							);
						}
					}}
				/>
				{listing.logoKey && (
					<button type="button" onClick={() => update({ logoKey: null })}>
						Remove logo
					</button>
				)}
				{logoProblem && <p role="alert">{logoProblem}</p>}
			</div>
			{textField("Description", "description", 1000)}
			{textField("Website", "website", 500)}
			{textField("Opening hours", "hours", 200)}
			<button
				type="button"
				style={{ color: "#b91c1c", marginTop: 8 }}
				onClick={() => {
					perform({ type: "removeListing", id: listing.id });
					onDone();
				}}
			>
				Delete Listing
			</button>
		</section>
	);
}

const panel: CSSProperties = {
	gridRow: 3,
	gridColumn: 3,
	overflow: "auto",
	padding: "8px 12px",
	background: "#fff",
	borderLeft: "1px solid #e2e8f0",
};
const heading: CSSProperties = {
	fontSize: 12,
	textTransform: "uppercase",
	color: "#64748b",
	margin: "12px 0 6px",
};
const field: CSSProperties = { display: "grid", gap: 2, marginBottom: 8 };
const muted: CSSProperties = { color: "#64748b", margin: "4px 0" };
const plainList: CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
const linkButton: CSSProperties = {
	background: "none",
	border: "none",
	padding: "2px 0",
	color: "#1d4fc4",
	cursor: "pointer",
	font: "inherit",
	textAlign: "left",
};
const tabButton = (active: boolean): CSSProperties => ({
	flex: 1,
	padding: "6px 8px",
	border: "1px solid #cbd5e1",
	borderRadius: 6,
	background: active ? "#1d4fc4" : "#fff",
	color: active ? "#fff" : "#0f172a",
	cursor: "pointer",
});
const listItem = (active: boolean): CSSProperties => ({
	display: "flex",
	justifyContent: "space-between",
	width: "100%",
	padding: "4px 6px",
	border: "none",
	borderRadius: 4,
	background: active ? "#dbe7ff" : "transparent",
	font: "inherit",
	textAlign: "left",
	cursor: "pointer",
});
