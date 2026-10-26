import type { Point } from "@kestrel/geometry";
import { useCallback, useEffect, useRef, useState } from "react";

/** Screen pixels per metre, and where the Level's origin sits on screen. */
export type View = {
	readonly scale: number;
	readonly x: number;
	readonly y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 400;

/** Zoom with the wheel; pan by dragging with Space held or the middle mouse button. */
export function useViewport(width: number, height: number) {
	const [view, setView] = useState<View>({ scale: 20, x: 40, y: 40 });
	const [spaceHeld, setSpaceHeld] = useState(false);
	const pan = useRef<{ from: Point; view: View } | null>(null);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (
				e.code !== "Space" ||
				(e.target as HTMLElement).closest("input, textarea, select")
			)
				return;
			e.preventDefault();
			setSpaceHeld(true);
		};
		const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(false);
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, []);

	/** Fits a width x height (metres) area into the canvas with a margin. */
	const fit = useCallback(
		(w: number, h: number) => {
			const scale = Math.min(width / w, height / h) * 0.9;
			setView({
				scale,
				x: (width - w * scale) / 2,
				y: (height - h * scale) / 2,
			});
		},
		[width, height],
	);

	const toWorld = (screen: Point): Point => ({
		x: (screen.x - view.x) / view.scale,
		y: (screen.y - view.y) / view.scale,
	});

	const zoomAt = (screen: Point, factor: number) =>
		setView((v) => {
			const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
			const wx = (screen.x - v.x) / v.scale;
			const wy = (screen.y - v.y) / v.scale;
			return { scale, x: screen.x - wx * scale, y: screen.y - wy * scale };
		});

	/** Starts a pan if this press should pan; returns whether it did. */
	const startPan = (screen: Point, button: number) => {
		if (!spaceHeld && button !== 1) return false;
		pan.current = { from: screen, view };
		return true;
	};
	const movePan = (screen: Point) => {
		const p = pan.current;
		if (!p) return false;
		setView({
			...p.view,
			x: p.view.x + screen.x - p.from.x,
			y: p.view.y + screen.y - p.from.y,
		});
		return true;
	};
	const endPan = () => {
		const panning = pan.current !== null;
		pan.current = null;
		return panning;
	};

	return { view, spaceHeld, fit, toWorld, zoomAt, startPan, movePan, endPan };
}
