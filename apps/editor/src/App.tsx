import type { Draft } from "@kestrel/domain";
import { useCallback, useEffect, useState } from "react";
import { api, type MapDetails, type SignedInUser } from "./api.ts";
import { Editor } from "./editor/Editor.tsx";
import { MapPicker, SignIn } from "./screens.tsx";

type Screen =
	| { name: "loading" }
	| { name: "signedOut" }
	| { name: "maps"; user: SignedInUser }
	| { name: "editor"; map: MapDetails; initial: { seq: number; draft: Draft } };

const mapInUrl = () => new URLSearchParams(window.location.search).get("map");

function setMapInUrl(id: string | null) {
	const url = new URL(window.location.href);
	if (id) url.searchParams.set("map", id);
	else url.searchParams.delete("map");
	window.history.pushState(null, "", url);
}

export function App() {
	const [screen, setScreen] = useState<Screen>({ name: "loading" });
	const [problem, setProblem] = useState<string | null>(null);

	/** Works out where to be from the session and the URL. */
	const route = useCallback(async () => {
		setProblem(null);
		try {
			const user = await api.currentUser();
			if (!user) return setScreen({ name: "signedOut" });
			const mapId = mapInUrl();
			if (!mapId) return setScreen({ name: "maps", user });
			const [map, initial] = await Promise.all([
				api.getMap(mapId),
				api.getDraft(mapId),
			]);
			setScreen({ name: "editor", map, initial });
		} catch (e) {
			setProblem(e instanceof Error ? e.message : String(e));
			setScreen({ name: "signedOut" });
		}
	}, []);

	useEffect(() => {
		void route();
		const onBack = () => void route();
		window.addEventListener("popstate", onBack);
		return () => window.removeEventListener("popstate", onBack);
	}, [route]);

	const open = (id: string | null) => {
		setMapInUrl(id);
		void route();
	};

	if (screen.name === "loading") return <p style={{ padding: 24 }}>Loading…</p>;
	if (screen.name === "signedOut")
		return <SignIn problem={problem} onSignedIn={route} />;
	if (screen.name === "maps") {
		return (
			<MapPicker
				user={screen.user}
				onOpen={(id) => open(id)}
				onSignOut={async () => {
					await api.signOut();
					open(null);
				}}
			/>
		);
	}
	return (
		<Editor
			key={screen.map.id}
			map={screen.map}
			initial={screen.initial}
			onExit={() => open(null)}
		/>
	);
}
