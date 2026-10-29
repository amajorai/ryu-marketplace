import "./verification.css";
import { createRoot } from "react-dom/client";

type Status = "pass" | "expected";

const evidence: Array<{
	detail: string;
	label: string;
	status: Status;
	title: string;
}> = [
	{
		detail: "@ryu/chatgpt-web · 0.1.0 · backend SHA-256 verified by Core",
		label: "Manifest integrity",
		status: "pass",
		title: "Bundle accepted",
	},
	{
		detail: "GET /status → 200 · provider chatgpt-web · temporary chat true",
		label: "Managed provider",
		status: "pass",
		title: "Ryu sidecar healthy",
	},
	{
		detail: "browser.control → Browser sidecar → POST / capability envelope",
		label: "Capability routing",
		status: "pass",
		title: "Browser hop connected",
	},
	{
		detail:
			"Fake ChatGPT: Hello from fake ChatGPT · 5 advertised models · SSE pass",
		label: "Completion contract",
		status: "pass",
		title: "OpenAI response translated",
	},
	{
		detail: "Live profile reports available: true, signed_in: false",
		label: "Live sign-in gate",
		status: "expected",
		title: "401 login_required",
	},
];

const checks = [
	"40 Browser control tests",
	"5 manifest/security tests",
	"1 managed extension-host test",
	"Ultracite targeted check",
	"Ryu Core install + enable",
];

function App() {
	return (
		<main className="page-shell">
			<header className="verification-header">
				<div>
					<h1>ChatGPT Web verification</h1>
					<p className="lede">
						Verify the managed sidecar route, capability handoff, completion
						translation, and explicit sign-in behavior.
					</p>
				</div>
			</header>

			<section aria-label="Verification summary" className="status-strip">
				<div>
					<span className="status-dot pass" />
					<strong>Ryu route live</strong>
					<span>Core → capability broker → Browser → ChatGPT Web</span>
				</div>
				<div>
					<span className="status-dot expected" />
					<strong>Sign-in required</strong>
					<span>
						Safe, explicit 401 until the Ryu Browser profile is signed in
					</span>
				</div>
			</section>

			<section aria-label="Evidence" className="evidence-grid">
				{evidence.map((item) => (
					<article className="evidence-card" key={item.label}>
						<div className="card-topline">
							<span className={`status-dot ${item.status}`} />
							<span>{item.label}</span>
						</div>
						<h2>{item.title}</h2>
						<p>{item.detail}</p>
					</article>
				))}
			</section>

			<section className="lower-grid">
				<div className="panel">
					<div className="panel-label">Request flow</div>
					<div className="flow-line">
						{["OpenAI", "Ryu Core", "Browser", "ChatGPT Web"].map(
							(step, index) => (
								<div className="flow-step" key={step}>
									<span>{String(index + 1).padStart(2, "0")}</span>
									<strong>{step}</strong>
									{index < 3 && <b aria-hidden="true">→</b>}
								</div>
							)
						)}
					</div>
					<div className="contract-note">
						Temporary Chat URL is fixed in the backend. No cookies, API tokens,
						private backend endpoint, or browser eval route is used.
					</div>
				</div>

				<div className="panel checks-panel">
					<div className="panel-label">Proof ledger</div>
					<ul>
						{checks.map((check) => (
							<li key={check}>
								<span className="checkmark">✓</span>
								{check}
							</li>
						))}
					</ul>
				</div>
			</section>

			<footer>
				<span>Experimental · text-only · Temporary Chat per completion</span>
				<span>Ryu-native implementation</span>
			</footer>
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
