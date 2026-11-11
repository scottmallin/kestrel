import {
	type Placement,
	type Point,
	type Polygon,
	type TraceOptions,
	type TraceResult,
	toImage,
	toPlane,
	traceRoom,
	type WallMask,
} from "@kestrel/geometry";

/** An uploaded plan shown under a Level, and where it sits on the plane (ADR 0008). */
export type Underlay = {
	readonly image: HTMLImageElement;
	readonly placement: Placement;
};

/** Larger images are scaled down so filling and snapping stay fast. */
const MAX_PIXELS = 2000;

async function decode(src: string): Promise<HTMLImageElement> {
	const image = new Image();
	image.src = src;
	await image.decode();
	return image;
}

/** Loads a saved Underlay's image (already at most MAX_PIXELS, as converted for upload). */
export const loadUnderlayImage = (src: string): Promise<HTMLImageElement> =>
	decode(src);

/**
 * Converts any image the browser can read (PNG, JPEG, SVG…) into a PNG of at most MAX_PIXELS on a white
 * background, ready to upload. The server only stores raster images, so an SVG never reaches it.
 */
export async function toUploadablePng(
	file: Blob,
	maxPixels = MAX_PIXELS,
): Promise<Blob> {
	const url = URL.createObjectURL(file);
	try {
		const image = await decode(url);
		const ratio = Math.min(
			1,
			maxPixels / Math.max(image.naturalWidth, image.naturalHeight),
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

const luminance = (data: Uint8ClampedArray, i: number) =>
	0.299 * (data[i * 4] ?? 255) +
	0.587 * (data[i * 4 + 1] ?? 255) +
	0.114 * (data[i * 4 + 2] ?? 255);

/** How many of the plan's pixels have each luminance (256 counts), for suggesting a Wall darkness. */
export function planHistogram(image: HTMLImageElement): number[] {
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
	const { data } = g.getImageData(0, 0, width, height);
	const histogram = new Array<number>(256).fill(0);
	for (let i = 0; i < width * height; i++) {
		const l = Math.round(luminance(data, i));
		histogram[l] = (histogram[l] ?? 0) + 1;
	}
	return histogram;
}

/** Reads the Underlay's pixels into walls (dark pixels), adding any closed openings as walls. */
export function wallMaskFrom(
	underlay: Underlay,
	darkness: number,
	openings: readonly ClosedOpening[],
): WallMask {
	const { image, placement } = underlay;
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
		const from = toImage(placement, a);
		const to = toImage(placement, b);
		g.moveTo(from.x, from.y);
		g.lineTo(to.x, to.y);
		g.stroke();
	}
	const { data } = g.getImageData(0, 0, width, height);
	const walls = new Uint8Array(width * height);
	for (let i = 0; i < walls.length; i++) {
		walls[i] = luminance(data, i) < darkness ? 1 : 0;
	}
	return { width, height, walls };
}

/**
 * Magic fill on a placed plan: traces the room at `point` (metres on the plane) in the plan's pixels,
 * treating `occupied` outlines (also on the plane) as walls, and returns the outline on the plane.
 */
export function traceOnPlan(
	mask: WallMask,
	placement: Placement,
	point: Point,
	options: TraceOptions = {},
): TraceResult {
	const toPixels = (outline: Polygon) =>
		outline.map((p) => toImage(placement, p));
	const result = traceRoom(mask, toImage(placement, point), {
		...options,
		...(options.occupied && { occupied: options.occupied.map(toPixels) }),
	});
	return result.ok
		? { ok: true, outline: result.outline.map((p) => toPlane(placement, p)) }
		: result;
}
