import type { Point, Polygon, WallMask } from "@kestrel/geometry";

/** An uploaded plan shown under a Level. Its pixels map to metres via pixelsPerMetre. */
export type Underlay = {
	readonly image: HTMLImageElement;
	readonly pixelsPerMetre: number;
};

/** Until the scale-setting step exists, assume 20px per metre. */
export const DEFAULT_PIXELS_PER_METRE = 20;

/** Larger images are scaled down so filling and snapping stay fast. */
const MAX_PIXELS = 2000;

async function decode(src: string): Promise<HTMLImageElement> {
	const image = new Image();
	image.src = src;
	await image.decode();
	return image;
}

/** Loads a saved Underlay (already at most MAX_PIXELS, as converted for upload). */
export async function loadUnderlay(
	src: string,
	pixelsPerMetre = DEFAULT_PIXELS_PER_METRE,
): Promise<Underlay> {
	return { image: await decode(src), pixelsPerMetre };
}

/**
 * Converts any image the browser can read (PNG, JPEG, SVG…) into a PNG of at most MAX_PIXELS on a white
 * background, ready to upload. The server only stores raster images, so an SVG never reaches it.
 */
export async function toUploadablePng(file: Blob): Promise<Blob> {
	const url = URL.createObjectURL(file);
	try {
		const image = await decode(url);
		const ratio = Math.min(
			1,
			MAX_PIXELS / Math.max(image.naturalWidth, image.naturalHeight),
		);
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(image.naturalWidth * ratio);
		canvas.height = Math.round(image.naturalHeight * ratio);
		const g = canvas.getContext("2d");
		if (!g) throw new Error("Canvas is not available");
		g.fillStyle = "#fff";
		g.fillRect(0, 0, canvas.width, canvas.height);
		g.drawImage(image, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(blob) =>
					blob
						? resolve(blob)
						: reject(new Error("Couldn't convert the image")),
				"image/png",
			),
		);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** A line drawn across an opening (e.g. a shopfront) so Magic fill treats it as a wall. Metres. */
export type ClosedOpening = readonly [Point, Point];

/** Reads the Underlay's pixels into walls (dark pixels), adding any closed openings as walls. */
export function wallMaskFrom(
	underlay: Underlay,
	darkness: number,
	openings: readonly ClosedOpening[],
): WallMask {
	const { image, pixelsPerMetre } = underlay;
	const width = image.naturalWidth;
	const height = image.naturalHeight;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const g = canvas.getContext("2d", { willReadFrequently: true });
	if (!g) throw new Error("Canvas is not available");
	g.fillStyle = "#fff";
	g.fillRect(0, 0, width, height);
	g.drawImage(image, 0, 0);
	g.strokeStyle = "#000";
	g.lineWidth = 4;
	for (const [a, b] of openings) {
		g.beginPath();
		g.moveTo(a.x * pixelsPerMetre, a.y * pixelsPerMetre);
		g.lineTo(b.x * pixelsPerMetre, b.y * pixelsPerMetre);
		g.stroke();
	}
	const { data } = g.getImageData(0, 0, width, height);
	const walls = new Uint8Array(width * height);
	for (let i = 0; i < walls.length; i++) {
		const luminance =
			0.299 * (data[i * 4] ?? 255) +
			0.587 * (data[i * 4 + 1] ?? 255) +
			0.114 * (data[i * 4 + 2] ?? 255);
		walls[i] = luminance < darkness ? 1 : 0;
	}
	return { width, height, walls };
}

export const toPixels = (outline: Polygon, pixelsPerMetre: number): Polygon =>
	outline.map((p) => ({ x: p.x * pixelsPerMetre, y: p.y * pixelsPerMetre }));

export const toMetres = (outline: Polygon, pixelsPerMetre: number): Polygon =>
	outline.map((p) => ({ x: p.x / pixelsPerMetre, y: p.y / pixelsPerMetre }));
