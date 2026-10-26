import { BUNDLE_FORMAT_VERSION } from "@kestrel/publish";
import { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

// Buildings without a georeference render on a plain background (ADR 0003).
new MapLibreMap({
	container: "map",
	style: {
		version: 8,
		sources: {},
		layers: [
			{
				id: "background",
				type: "background",
				paint: { "background-color": "#f6f7f9" },
			},
		],
	},
	center: [0, 0],
	zoom: 18,
});

console.info(`Kestrel embed, bundle format v${BUNDLE_FORMAT_VERSION}`);
