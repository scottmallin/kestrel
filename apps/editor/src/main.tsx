import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { DrawingPrototype } from "./prototype-drawing/DrawingPrototype.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// PROTOTYPE: ?prototype=drawing mounts the drawing-tools prototype (dev only).
const showPrototype =
	import.meta.env.DEV &&
	new URLSearchParams(location.search).get("prototype") === "drawing";

createRoot(root).render(
	<StrictMode>{showPrototype ? <DrawingPrototype /> : <App />}</StrictMode>,
);
