import {
	BUNDLE_FORMAT_VERSION,
	type DirectoryEntry,
	type PublishedBundle,
	SPACE_KIND_COLOURS,
	SPACE_KIND_LABELS,
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
const results = element<HTMLUListElement>("results");
const count = element<HTMLParagraphElement>("results-count");
const heading = element<HTMLHeadingElement>("directory-heading");

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

/** [west, south, east, north] of one Space. */
function boundsOf(feature: SpaceFeature): [number, number, number, number] {
	const ring = feature.geometry.coordinates[0] ?? [];
	const lngs = ring.map(([lng]) => lng);
	const lats = ring.map(([, lat]) => lat);
	return [
		Math.min(...lngs),
		Math.min(...lats),
		Math.max(...lngs),
		Math.max(...lats),
	];
}

function centreOf(feature: SpaceFeature): [number, number] {
	const [west, south, east, north] = boundsOf(feature);
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

function show(bundle: PublishedBundle) {
	document.title = bundle.map.name;
	heading.textContent = bundle.map.name;
	const features = new Map(
		bundle.spaces.features.map((f) => [f.properties.id, f]),
	);
	let selected: string | null = null;

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
					paint: {
						"fill-color": FILL_COLOUR,
					},
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
	for (const entry of bundle.directory) {
		const feature = features.get(entry.spaceId);
		if (!feature) continue;
		const label = document.createElement("div");
		label.className = "label";
		label.textContent = entry.label;
		new Marker({ element: label }).setLngLat(centreOf(feature)).addTo(map);
	}

	const select = (spaceId: string) => {
		if (selected)
			map.setFeatureState(
				{ source: "spaces", id: selected },
				{ selected: false },
			);
		selected = spaceId;
		map.setFeatureState({ source: "spaces", id: spaceId }, { selected: true });
		const feature = features.get(spaceId);
		// Keep the surroundings in view: centre the Space, zooming in only if it would be tiny on screen.
		if (feature) {
			const camera = map.cameraForBounds(boundsOf(feature), { padding: 80 });
			const comfortable = (camera?.zoom ?? map.getZoom()) - 1.5;
			map.easeTo({
				center: centreOf(feature),
				zoom: Math.max(map.getZoom(), Math.min(comfortable, map.getZoom() + 2)),
			});
		}
		for (const button of results.querySelectorAll("button")) {
			button.setAttribute(
				"aria-pressed",
				String(button.dataset.spaceId === spaceId),
			);
		}
	};

	map.on("click", "space-fill", (e) => {
		const id = e.features?.[0]?.properties?.id;
		if (typeof id === "string") select(id);
	});

	const render = (entries: readonly DirectoryEntry[]) => {
		results.replaceChildren(
			...entries.map((entry) => {
				const item = document.createElement("li");
				const button = document.createElement("button");
				button.type = "button";
				button.dataset.spaceId = entry.spaceId;
				button.setAttribute("aria-pressed", String(entry.spaceId === selected));
				const name = document.createElement("span");
				name.textContent = entry.label;
				const kind = document.createElement("span");
				kind.className = "kind";
				kind.textContent = SPACE_KIND_LABELS[entry.kind];
				button.append(name, kind);
				button.addEventListener("click", () => select(entry.spaceId));
				item.append(button);
				return item;
			}),
		);
		count.textContent =
			entries.length === 1 ? "1 place" : `${entries.length} places`;
	};

	search.disabled = false;
	search.addEventListener("input", () => {
		const query = search.value.trim().toLowerCase();
		render(
			bundle.directory.filter(
				(e) =>
					e.label.toLowerCase().includes(query) ||
					SPACE_KIND_LABELS[e.kind].toLowerCase().includes(query),
			),
		);
	});
	render(bundle.directory);
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
