import type { Space } from "@kestrel/domain";
import { containsPoint, type Overlap, type Point } from "@kestrel/geometry";
import { type MouseEvent as ReactMouseEvent, useEffect, useRef } from "react";
import { Image as KonvaImage, Layer, Stage } from "react-konva";
import { SpaceShapes } from "./shapes.tsx";
import type { PointerInfo, Tool } from "./tool.ts";
import type { Underlay } from "./underlay.ts";
import type { useViewport } from "./useViewport.ts";

type Props = {
	width: number;
	height: number;
	viewport: ReturnType<typeof useViewport>;
	tool: Tool;
	spaces: readonly Space[];
	selection: readonly string[];
	overlaps: readonly Overlap[];
	underlay: Underlay | null;
	underlayOpacity: number;
};

/** The Level drawing surface: Underlay, Spaces and the active tool's overlay, plus zoom and pan. */
export function LevelCanvas({
	width,
	height,
	viewport,
	tool,
	spaces,
	selection,
	overlaps,
	underlay,
	underlayOpacity,
}: Props) {
	const container = useRef<HTMLDivElement>(null);
	// Window listeners outlive a render, so they read the latest tool and spaces through refs.
	const latest = useRef({ tool, spaces, viewport });
	latest.current = { tool, spaces, viewport };
	const { view } = viewport;

	const screenPoint = (e: { clientX: number; clientY: number }) =>
		relativeTo(container.current, e);

	const pointerInfo = (e: MouseEvent | ReactMouseEvent): PointerInfo => {
		const point = latest.current.viewport.toWorld(screenPoint(e));
		const under = [...latest.current.spaces]
			.reverse()
			.find((s) => containsPoint(s.outline, point));
		return {
			point,
			shift: e.shiftKey,
			detail: e.detail,
			spaceId: under?.id ?? null,
		};
	};

	const onMouseDown = (e: ReactMouseEvent) => {
		e.preventDefault();
		const panning = viewport.startPan(screenPoint(e), e.button);
		if (!panning && e.button !== 0) return;
		if (!panning) tool.onPointerDown?.(pointerInfo(e));

		const move = (ev: MouseEvent) => {
			if (!latest.current.viewport.movePan(screenPoint(ev)))
				latest.current.tool.onPointerMove?.(pointerInfo(ev));
		};
		const up = (ev: MouseEvent) => {
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", up);
			if (!latest.current.viewport.endPan())
				latest.current.tool.onPointerUp?.(pointerInfo(ev));
		};
		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
	};

	// Hover only; while a button is held the window listener above takes over.
	const onMouseMove = (e: ReactMouseEvent) => {
		if (e.buttons === 0) tool.onPointerMove?.(pointerInfo(e));
	};

	useEffect(() => {
		const el = container.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			latest.current.viewport.zoomAt(
				relativeTo(el, e),
				e.deltaY > 0 ? 1 / 1.1 : 1.1,
			);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the drawing surface is pointer-driven; keyboard access is via shortcuts and the side panel
		<div
			ref={container}
			data-testid="level-canvas"
			data-scale={view.scale}
			data-origin-x={view.x}
			data-origin-y={view.y}
			style={{
				width,
				height,
				cursor: viewport.spaceHeld ? "grab" : "crosshair",
			}}
			onMouseDown={onMouseDown}
			onMouseMove={onMouseMove}
			onContextMenu={(e) => e.preventDefault()}
		>
			<Stage
				width={width}
				height={height}
				scaleX={view.scale}
				scaleY={view.scale}
				x={view.x}
				y={view.y}
				listening={false}
			>
				<Layer listening={false}>
					{underlay && (
						<KonvaImage
							image={underlay.image}
							width={underlay.image.naturalWidth / underlay.pixelsPerMetre}
							height={underlay.image.naturalHeight / underlay.pixelsPerMetre}
							opacity={underlayOpacity}
						/>
					)}
				</Layer>
				<Layer listening={false}>
					<SpaceShapes
						spaces={spaces}
						preview={tool.preview}
						selection={selection}
						overlaps={overlaps}
						scale={view.scale}
					/>
					{tool.overlay}
				</Layer>
			</Stage>
		</div>
	);
}

/** Mouse position relative to the element's top-left corner. */
function relativeTo(
	el: HTMLElement | null,
	e: { clientX: number; clientY: number },
): Point {
	const rect = el?.getBoundingClientRect();
	return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
}
