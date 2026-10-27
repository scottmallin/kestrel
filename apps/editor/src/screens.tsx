import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import { api, type MapSummary, type SignedInUser } from "./api.ts";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SignIn({
	problem,
	onSignedIn,
}: {
	problem: string | null;
	onSignedIn: () => void;
}) {
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
	const [error, setError] = useState<string | null>(problem);
	const [busy, setBusy] = useState(false);

	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		const field = (name: string) => String(form.get(name) ?? "");
		setBusy(true);
		setError(null);
		try {
			if (mode === "signUp") {
				await api.signUp({
					name: field("name"),
					email: field("email"),
					password: field("password"),
					organisation: field("organisation"),
				});
			} else {
				await api.signIn(field("email"), field("password"));
			}
			onSignedIn();
		} catch (err) {
			setError(errorText(err));
			setBusy(false);
		}
	};

	return (
		<main style={page}>
			<h1>Kestrel</h1>
			<form onSubmit={submit} style={form}>
				<h2 style={{ margin: 0 }}>
					{mode === "signUp" ? "Create your account" : "Sign in"}
				</h2>
				{mode === "signUp" && (
					<>
						<label style={field}>
							Your name
							<input name="name" required autoComplete="name" />
						</label>
						<label style={field}>
							Organisation
							<input
								name="organisation"
								required
								placeholder="e.g. Trafford Centre"
							/>
						</label>
					</>
				)}
				<label style={field}>
					Email
					<input name="email" type="email" required autoComplete="email" />
				</label>
				<label style={field}>
					Password
					<input
						name="password"
						type="password"
						required
						minLength={8}
						autoComplete={
							mode === "signUp" ? "new-password" : "current-password"
						}
					/>
				</label>
				{error && (
					<p role="alert" style={{ color: "#b91c1c", margin: 0 }}>
						{error}
					</p>
				)}
				<button type="submit" disabled={busy}>
					{mode === "signUp" ? "Create account" : "Sign in"}
				</button>
				<button
					type="button"
					style={link}
					onClick={() => setMode(mode === "signUp" ? "signIn" : "signUp")}
				>
					{mode === "signUp"
						? "Already have an account? Sign in"
						: "New here? Create an account"}
				</button>
			</form>
		</main>
	);
}

export function MapPicker({
	user,
	onOpen,
	onSignOut,
}: {
	user: SignedInUser;
	onOpen: (mapId: string) => void;
	onSignOut: () => void;
}) {
	const [maps, setMaps] = useState<MapSummary[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api.listMaps().then(setMaps, (e) => setError(errorText(e)));
	}, []);

	const create = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
		try {
			onOpen((await api.createMap(name)).id);
		} catch (err) {
			setError(errorText(err));
		}
	};

	return (
		<main style={page}>
			<header
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					width: 360,
				}}
			>
				<h1>Your Maps</h1>
				<span>
					{user.name} ·{" "}
					<button type="button" style={link} onClick={onSignOut}>
						Sign out
					</button>
				</span>
			</header>
			{error && <p role="alert">{error}</p>}
			{maps === null ? (
				<p>Loading…</p>
			) : (
				<ul
					style={{ width: 360, padding: 0, listStyle: "none" }}
					aria-label="Maps"
				>
					{maps.length === 0 && <li>No Maps yet: create your first below.</li>}
					{maps.map((m) => (
						<li key={m.id}>
							<button
								type="button"
								style={{ ...link, fontSize: 16 }}
								onClick={() => onOpen(m.id)}
							>
								{m.name}
							</button>
						</li>
					))}
				</ul>
			)}
			<form
				onSubmit={create}
				style={{ ...form, flexDirection: "row", alignItems: "end" }}
			>
				<label style={field}>
					New Map
					<input name="name" required placeholder="e.g. Main mall" />
				</label>
				<button type="submit">Create</button>
			</form>
		</main>
	);
}

const page: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	padding: 40,
	font: "14px system-ui, sans-serif",
};
const form: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 12,
	width: 360,
};
const field: CSSProperties = { display: "grid", gap: 4 };
const link: CSSProperties = {
	background: "none",
	border: "none",
	padding: 0,
	color: "#1d4fc4",
	cursor: "pointer",
	font: "inherit",
	textAlign: "left",
};
