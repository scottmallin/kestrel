import type { Space } from "@kestrel/domain";
import { polygonArea } from "@kestrel/geometry";
import { useEffect, useState } from "react";
import { Layer, Line, Stage, Text } from "react-konva";

// Pixels per metre until the Level has a real scale.
const SCALE = 40;

const sampleSpace: Space = {
	id: "sample",
	levelId: "level-0",
	kind: "unit",
	reference: "Unit 1",
	outline: [
		{ x: 2, y: 2 },
		{ x: 8, y: 2 },
		{ x: 8, y: 6 },
		{ x: 2, y: 6 },
	],
};

function useWindowSize() {
	const [size, setSize] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});
	useEffect(() => {
		const onResize = () =>
			setSize({ width: window.innerWidth, height: window.innerHeight });
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return size;
}

export function App() {
	const { width, height } = useWindowSize();
	const points = sampleSpace.outline.flatMap((p) => [p.x * SCALE, p.y * SCALE]);
	const label = `${sampleSpace.reference} · ${polygonArea(sampleSpace.outline)} m²`;

	return (
		<Stage width={width} height={height}>
			<Layer>
				<Line
					points={points}
					closed
					fill="#dbe7ff"
					stroke="#3b6fd8"
					strokeWidth={2}
				/>
				<Text
					x={2.2 * SCALE}
					y={2.2 * SCALE}
					text={label}
					fontSize={14}
					fill="#1d3b78"
				/>
			</Layer>
		</Stage>
	);
}
