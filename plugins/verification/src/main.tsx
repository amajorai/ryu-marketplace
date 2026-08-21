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
			<div className="eyebrow">RYU PLUGIN VERIFICATION · 17 AUG 2026</div>
			<section className="hero">
				<div>
					<div className="kicker">ChatGPT Web</div>
					<h1>A browser-backed provider that stays inside Ryu.</h1>
					<p className="lede">
						The plugin is installed as a managed Node sidecar, calls only Ryu’s
						Browser capability, and exposes a normal OpenAI-compatible
						completion contract.
					</p>
				</div>
				<div aria-hidden="true" className="hero-mark">
					<span>◎</span>
					<span>↗</span>
					<span>▦</span>
				</div>
			</section>

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
				<div className="panel flow-panel">
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

			<style>{`
        :root {
          color: #f3efe7;
          background: #171713;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-synthesis: none;
          text-rendering: optimizeLegibility;
        }
        * { box-sizing: border-box; }
        body { margin: 0; min-width: 320px; }
        .page-shell { margin: 0 auto; max-width: 1180px; padding: 42px 34px 28px; }
        .eyebrow, .panel-label, .kicker, .card-topline, footer, .status-strip { letter-spacing: .12em; text-transform: uppercase; }
        .eyebrow { color: #a5a394; font-size: 11px; font-weight: 700; }
        .hero { align-items: end; border-bottom: 1px solid #393a32; display: flex; gap: 30px; justify-content: space-between; padding: 48px 0 42px; }
        .kicker { color: #c7f36b; font-size: 12px; font-weight: 800; margin-bottom: 16px; }
        h1 { font-size: clamp(42px, 6vw, 76px); letter-spacing: -.065em; line-height: .96; margin: 0; max-width: 790px; }
        .lede { color: #b8b6aa; font-size: 17px; line-height: 1.5; margin: 24px 0 0; max-width: 600px; }
        .hero-mark { align-items: end; color: #c7f36b; display: flex; font-size: 32px; gap: 9px; padding-bottom: 4px; }
        .hero-mark span:nth-child(2) { color: #f1a56d; font-size: 48px; transform: translateY(-7px); }
        .status-strip { border-bottom: 1px solid #393a32; display: grid; font-size: 10px; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 18px 0; }
        .status-strip div { align-items: center; display: flex; flex-wrap: wrap; gap: 9px; }
        .status-strip strong { color: #f3efe7; font-size: 11px; letter-spacing: .08em; }
        .status-strip span:last-child { color: #8f8e84; letter-spacing: .02em; text-transform: none; }
        .status-dot { border-radius: 999px; display: inline-block; flex: 0 0 auto; height: 9px; width: 9px; }
        .status-dot.pass { background: #c7f36b; box-shadow: 0 0 0 4px #c7f36b1c; }
        .status-dot.expected { background: #f1a56d; box-shadow: 0 0 0 4px #f1a56d1c; }
        .evidence-grid { display: grid; gap: 12px; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 26px 0 14px; }
        .evidence-card { background: #20201b; border: 1px solid #35362e; min-height: 190px; padding: 19px; }
        .evidence-card:last-child { border-color: #6b4a35; }
        .card-topline { align-items: center; color: #8f8e84; display: flex; font-size: 9px; font-weight: 700; gap: 9px; }
        .evidence-card h2 { font-size: 20px; letter-spacing: -.03em; line-height: 1.1; margin: 33px 0 11px; }
        .evidence-card p { color: #aaa89d; font-size: 13px; line-height: 1.45; margin: 0; }
        .lower-grid { display: grid; gap: 12px; grid-template-columns: 1.35fr .65fr; padding-top: 12px; }
        .panel { background: #1c1c18; border: 1px solid #35362e; padding: 22px; }
        .panel-label { color: #a5a394; font-size: 10px; font-weight: 800; }
        .flow-line { align-items: start; display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); margin: 33px 0 28px; }
        .flow-step { border-top: 1px solid #55564a; padding-top: 11px; position: relative; }
        .flow-step span { color: #c7f36b; display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; margin-bottom: 12px; }
        .flow-step strong { font-size: 14px; letter-spacing: -.02em; }
        .flow-step b { color: #6f7064; font-size: 18px; font-weight: 400; position: absolute; right: 10px; top: 34px; }
        .contract-note { border-left: 2px solid #f1a56d; color: #aaa89d; font-size: 13px; line-height: 1.5; max-width: 650px; padding-left: 13px; }
        .checks-panel ul { list-style: none; margin: 27px 0 0; padding: 0; }
        .checks-panel li { align-items: center; border-bottom: 1px solid #30312a; color: #cfcdc2; display: flex; font-size: 13px; gap: 10px; padding: 11px 0; }
        .checks-panel li:last-child { border-bottom: 0; }
        .checkmark { color: #c7f36b; font-size: 16px; }
        footer { border-top: 1px solid #393a32; color: #77776d; display: flex; font-size: 9px; justify-content: space-between; margin-top: 24px; padding-top: 17px; }
        @media (max-width: 930px) {
          .evidence-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .evidence-card:last-child { grid-column: span 2; min-height: auto; }
        }
        @media (max-width: 680px) {
          .page-shell { padding: 28px 18px 20px; }
          .hero { align-items: start; flex-direction: column; padding: 38px 0 30px; }
          .hero-mark { display: none; }
          .status-strip, .lower-grid { grid-template-columns: 1fr; }
          .evidence-grid { grid-template-columns: 1fr; }
          .evidence-card:last-child { grid-column: auto; }
          .flow-line { gap: 14px; grid-template-columns: repeat(2, 1fr); }
          .flow-step b { display: none; }
          footer { gap: 10px; line-height: 1.4; }
        }
      `}</style>
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
