/** Raster formats only: an uploaded SVG could run script on the API's origin. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Largest upload accepted (floor plans are the big ones). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const isImageUpload = (
	contentType: string | undefined,
	body: unknown,
): body is Buffer =>
	IMAGE_TYPES.includes(contentType ?? "") && Buffer.isBuffer(body);

export const EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
};
