import {
	BUNDLE_FORMAT_VERSION,
	type DirectoryEntry,
	type PublishedBundle,
	type PublishedListing,
	SPACE_KIND_COLOURS,
	type SpaceFeature,
} from "@kestrel/publish";
import {
	type ExpressionSpecification,
	Map as MapLibreMap,
	Marker,
	setWorkerUrl,
} from "maplibre-gl";
// MapLibre picks its worker's file at runtime, which bundlers can't see; bundle it ourselves and say where it is.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

setWorkerUrl(workerUrl);

/** Where the API lives. Same origin in development (Vite proxies /api); a separate host in production. */
const API_URL = import.meta.env.VITE_API_URL ?? "";

const element = <T extends HTMLElement>(id: string) =>
	document.getElementById(id) as T;
const search = element<HTMLInputElement>("search");
const categoryFilter = element<HTMLLabelElement>("category-filter");
const categorySelect = element<HTMLSelectElement>("category");
const results = element<HTMLUListElement>("results");
const count = element<HTMLParagraphElement>("results-count");
const heading = element<HTMLHeadingElement>("directory-heading");
const details = element<HTMLElement>("details");

function showProblem(message: string) {
	document.body.innerHTML = "";
	const p = document.createElement("p");
	p.className = "problem";
	p.textContent = message;
	document.body.append(p);
}

async function loadBundle(embedId: string): Promise<PublishedBundle | null> {
	const response = await fetch(
		`${API_URL}/api/public/embeds/${encodeURIComponent(embedId)}`,
	);
	if (response.status === 404) return null;
	if (!response.ok)
		throw new Error(`Couldn't load the map (${response.status})`);
	return response.json();
}

/** [west, south, east, north] around some Spaces. */
function boundsOf(
	features: readonly SpaceFeature[],
): [number, number, number, number] {
	const positions = features.flatMap((f) => f.geometry.coordinates[0] ?? []);
	const lngs = positions.map(([lng]) => lng);
	const lats = positions.map(([, lat]) => lat);
	return [
		Math.min(...lngs),
		Math.min(...lats),
		Math.max(...lngs),
		Math.max(...lats),
	];
}

function centreOf(features: readonly SpaceFeature[]): [number, number] {
	const [west, south, east, north] = boundsOf(features);
	return [(west + east) / 2, (south + north) / 2];
}

/** Selected Spaces are highlighted; others are coloured by Space Kind. */
const FILL_COLOUR = [
	"case",
	["boolean", ["feature-state", "selected"], false],
	"#93b4f5",
	[
		"match",
		["get", "kind"],
		...Object.entries(SPACE_KIND_COLOURS).flat(),
		"#e2e8f0",
	],
	// The spread hides the match arms' shape from MapLibre's types.
] as unknown as ExpressionSpecification;

/** Builds an element with text content only, so nothing from the bundle is ever parsed as HTML. */
function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text?: string,
	className?: string,
) {
	const node = document.createElement(tag);
	if (text !== undefined) node.textContent = text;
	if (className) node.className = className;
	return node;
}

function show(bundle: PublishedBundle) {
	document.title = bundle.map.name;
	heading.textContent = bundle.map.name;
	const features = new Map(
		bundle.spaces.features.map((f) => [f.properties.id, f]),
	);
	const listings = new Map(bundle.listings.map((l) => [l.id, l]));
	const categoryNames = new Map(bundle.categories.map((c) => [c.id, c.name]));
	let selected: DirectoryEntry | null = null;

	// Un-pinned Buildings are drawn on a plain background (ADR 0003).
	const map = new MapLibreMap({
		container: "map",
		style: {
			version: 8,
			sources: {
				spaces: { type: "geojson", data: bundle.spaces, promoteId: "id" },
			},
			layers: [
				{
					id: "background",
					type: "background",
					paint: { "background-color": "#f6f7f9" },
				},
				{
					id: "space-fill",
					type: "fill",
					source: "spaces",
					paint: { "fill-color": FILL_COLOUR },
				},
				{
					id: "space-outline",
					type: "line",
					source: "spaces",
					paint: { "line-color": "#64748b", "line-width": 1 },
				},
			],
		},
		...(bundle.bounds
			? { bounds: bundle.bounds, fitBoundsOptions: { padding: 24 } }
			: { center: [0, 0], zoom: 18 }),
		attributionControl: false,
	});
	// The directory is the accessible way in (WCAG), so keep the canvas out of screen readers and the tab order.
	map.getCanvas().setAttribute("aria-hidden", "true");
	map.getCanvas().setAttribute("tabindex", "-1");

	// Labels as HTML, so no font server is needed and they're real text.
	for (const feature of bundle.spaces.features) {
		if (!feature.properties.label) continue;
		new Marker({ element: el("div", feature.properties.label, "label") })
			.setLngLat(centreOf([feature]))
			.addTo(map);
	}

	const showDetails = (entry: DirectoryEntry) => {
		const listing = listings.get(entry.id);
		details.replaceChildren();
		if (!listing) {
			details.hidden = true;
			return;
		}
		details.append(...listingDetails(listing, categoryNames));
		details.hidden = false;
	};

	const select = (entry: DirectoryEntry) => {
		for (const id of selected?.spaceIds ?? [])
			map.setFeatureState({ source: "spaces", id }, { selected: false });
		selected = entry;
		for (const id of entry.spaceIds)
			map.setFeatureState({ source: "spaces", id }, { selected: true });
		const chosen = entry.spaceIds
			.map((id) => features.get(id))
			.filter((f): f is SpaceFeature => f !== undefined);
		// Keep the surroundings in view: centre the place, zooming in only if it would be tiny on screen.
		if (chosen.length > 0) {
			const camera = map.cameraForBounds(boundsOf(chosen), { padding: 80 });
			const comfortable = (camera?.zoom ?? map.getZoom()) - 1.5;
			map.easeTo({
				center: centreOf(chosen),
				zoom: Math.max(map.getZoom(), Math.min(comfortable, map.getZoom() + 2)),
			});
		}
		for (const button of results.querySelectorAll("button")) {
			button.setAttribute(
				"aria-pressed",
				String(button.dataset.entryId === entry.id),
			);
		}
		showDetails(entry);
	};

	map.on("click", "space-fill", (e) => {
		const id = e.features?.[0]?.properties?.id;
		const entry = bundle.directory.find(
			(d) => typeof id === "string" && d.spaceIds.includes(id),
		);
		if (entry) select(entry);
	});

	const render = (entries: readonly DirectoryEntry[]) => {
		results.replaceChildren(
			...entries.map((entry) => {
				const button = el("button");
				button.type = "button";
				button.dataset.entryId = entry.id;
				button.setAttribute("aria-pressed", String(entry.id === selected?.id));
				const name = el("span", undefined, "entry");
				const logo = listings.get(entry.id)?.logoUrl;
				if (logo) {
					const img = el("img");
					img.src = logo;
					img.alt = "";
					name.append(img);
				}
				name.append(entry.label);
				button.append(name, el("span", entry.detail, "kind"));
				button.addEventListener("click", () => select(entry));
				const item = el("li");
				item.append(button);
				return item;
			}),
		);
		count.textContent =
			entries.length === 1 ? "1 place" : `${entries.length} places`;
	};

	const filter = () => {
		const query = search.value.trim().toLowerCase();
		const category = categorySelect.value;
		render(
			bundle.directory.filter(
				(e) =>
					(!category || e.categoryId === category) &&
					(e.label.toLowerCase().includes(query) ||
						e.detail.toLowerCase().includes(query)),
			),
		);
	};

	if (bundle.categories.length > 0) {
		for (const category of bundle.categories) {
			const option = el("option", category.name);
			option.value = category.id;
			categorySelect.append(option);
		}
		categoryFilter.hidden = false;
	}
	search.disabled = false;
	search.addEventListener("input", filter);
	categorySelect.addEventListener("change", filter);
	render(bundle.directory);
}

/** A Listing's details card: logo, name, Category, description, hours and website. */
function listingDetails(
	listing: PublishedListing,
	categoryNames: ReadonlyMap<string, string>,
): HTMLElement[] {
	const parts: HTMLElement[] = [];
	if (listing.logoUrl) {
		const img = el("img");
		img.src = listing.logoUrl;
		img.alt = `${listing.name} logo`;
		parts.push(img);
	}
	parts.push(el("h2", listing.name));
	const category = listing.categoryId
		? categoryNames.get(listing.categoryId)
		: undefined;
	if (category) parts.push(el("p", category, "kind"));
	if (listing.description) parts.push(el("p", listing.description));
	if (listing.hours) parts.push(el("p", `Opening hours: ${listing.hours}`));
	if (listing.website) {
		const link = el("a", "Visit website");
		// The API only accepts http(s) addresses; check again so a bad bundle can't smuggle in javascript: links.
		if (/^https?:\/\//i.test(listing.website)) {
			link.href = listing.website;
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			const p = el("p");
			p.append(link);
			parts.push(p);
		}
	}
	return parts;
}

const embedId = new URLSearchParams(window.location.search).get("embed");
if (!embedId) {
	showProblem("This map link is missing its Embed id.");
} else {
	loadBundle(embedId).then(
		(bundle) => {
			if (!bundle) showProblem("This map hasn't been published yet.");
			else if (bundle.format !== BUNDLE_FORMAT_VERSION)
				showProblem("This map needs a newer version of the viewer.");
			else show(bundle);
		},
		(error: unknown) =>
			showProblem(error instanceof Error ? error.message : String(error)),
	);
}
