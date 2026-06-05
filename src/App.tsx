import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  FileVideo,
  Gauge,
  KeyRound,
  ListChecks,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Webhook
} from "lucide-react";
import { PLANS } from "./lib/billing";
import {
  activeRun,
  agentApiEndpoints,
  editorHandoff,
  expertPanels,
  gates,
  mcpTools,
  readinessTasks,
  recentJobs,
  usage
} from "./data/demo";

type View = "home" | "dashboard" | "agents" | "readiness";

const nav = [
  { label: "Home", icon: Rocket, view: "home" },
  { label: "Dashboard", icon: FileVideo, view: "dashboard" },
  { label: "Agent API", icon: Code2, view: "agents" },
  { label: "Readiness", icon: BarChart3, view: "readiness" },
  { label: "Billing", icon: CircleDollarSign, view: "dashboard" }
] satisfies Array<{ label: string; icon: typeof Rocket; view: View }>;

export function App() {
  const [view, setView] = useState<View>("home");

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">Q</div>
          <div>
            <strong>QC Genie</strong>
            <span>Pre-publish video QC</span>
          </div>
        </div>

        <nav className="nav" aria-label="Primary navigation">
          {nav.map((item) => (
            <button
              className={view === item.view ? "navItem active" : "navItem"}
              key={item.label}
              onClick={() => setView(item.view)}
              type="button"
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebarFooter">
          <span>Studio plan</span>
          <strong>${PLANS.studio.monthlyPrice}/mo</strong>
          <small>{PLANS.studio.monthlyMinutes.toLocaleString()} QC minutes included</small>
        </div>
      </aside>

      <section className="workspace">
        {view === "home" && <LandingView onOpenDashboard={() => setView("dashboard")} onOpenAgents={() => setView("agents")} />}
        {view === "dashboard" && <DashboardView />}
        {view === "agents" && <AgentView />}
        {view === "readiness" && <ReadinessView />}
      </section>
    </main>
  );
}

function LandingView({ onOpenDashboard, onOpenAgents }: { onOpenDashboard: () => void; onOpenAgents: () => void }) {
  return (
    <div className="pageStack">
      <section className="landingHero">
        <div className="heroCopy">
          <h1>Catch video mistakes before YouTube does.</h1>
          <p>
            QC Genie scans every upload for frozen frames, audio glitches, caption problems, format mistakes, and
            evidence-backed review notes before a creator, editor, or client hits publish.
          </p>
          <div className="heroActions">
            <button onClick={onOpenDashboard} type="button">
              <Play size={17} />
              Run sample QC
            </button>
            <button className="secondaryButton" onClick={onOpenAgents} type="button">
              <Code2 size={17} />
              Connect an agent
            </button>
          </div>
        </div>
        <div className="heroProof">
          <div className="verdictMini">
            <span>Current sample</span>
            <strong className={activeRun.verdict.toLowerCase()}>{activeRun.verdict}</strong>
            <p>1 issue needs review before publish.</p>
          </div>
          <div className="proofGrid">
            <span>Full-timeline scan</span>
            <span>Editor notes</span>
            <span>API + MCP ready</span>
            <span>Client reports</span>
          </div>
        </div>
      </section>

      <section className="proofBand">
        <article>
          <BadgeCheck size={22} />
          <strong>No invented hard-fails</strong>
          <p>Advisory notes must be backed by transcript or hard-check evidence before they appear in a report.</p>
        </article>
        <article>
          <ListChecks size={22} />
          <strong>Built for creator defects</strong>
          <p>Freeze/loop, audio garble, captions, aspect ratio, transcript grounding, and editor-ready timestamps.</p>
        </article>
        <article>
          <Webhook size={22} />
          <strong>Self-serve or programmatic</strong>
          <p>Paste a YouTube URL, upload a cut, or let Claude/Codex start QC through the agent API.</p>
        </article>
      </section>

      <section className="pricingBand">
        <div>
          <h2>Pricing that maps to production volume</h2>
          <p>Minutes are metered, but the product is sold around fewer revision loops and safer publishing.</p>
        </div>
        <div className="priceCards">
          <article>
            <span>Creator</span>
            <strong>$29/mo</strong>
            <p>Light Shorts and personal channel checks.</p>
          </article>
          <article className="featuredPrice">
            <span>Studio</span>
            <strong>${PLANS.studio.monthlyPrice}/mo</strong>
            <p>{PLANS.studio.monthlyMinutes.toLocaleString()} minutes, reports, and agent access.</p>
          </article>
          <article>
            <span>Agency</span>
            <strong>$149/mo</strong>
            <p>Team workspaces, webhooks, marker exports, and client links.</p>
          </article>
        </div>
      </section>
    </div>
  );
}

function DashboardView() {
  return (
    <div className="pageStack">
      <header className="topbar">
        <div>
          <h1>Video QC command center</h1>
          <p>Automated checks decide the verdict. Evidence-backed review notes explain what to fix.</p>
        </div>
        <div className="usagePill">
          <Gauge size={18} />
          <span>{usage.minutesUsed} min used</span>
          <strong>{usage.percentUsed}%</strong>
        </div>
      </header>

      <section className="grid">
        <div className="primaryColumn">
          <section className="importPanel">
            <div className="importCopy">
              <UploadCloud size={28} />
              <div>
                <h2>Import a YouTube URL or upload a cut</h2>
                <p>Run full-timeline checks before a creator publishes or sends client approval.</p>
              </div>
            </div>
            <div className="importControls">
              <input aria-label="Video source" defaultValue="https://youtube.com/watch?v=creator-cut" />
              <button type="button">
                <Play size={17} />
                Run QC
              </button>
            </div>
          </section>

          <GatePanel />
          <EditorHandoffPanel />
          <ReviewTimeline />
          <ReportsPanel />
        </div>

        <aside className="inspector">
          <section className="verdictCard">
            <span>Current run</span>
            <strong className={activeRun.verdict.toLowerCase()}>{activeRun.verdict}</strong>
            <p>{activeRun.title}</p>
          </section>

          <section className="meterCard">
            <div className="meterHeader">
              <ShieldCheck size={19} />
              <strong>Usage meter</strong>
            </div>
            <div className="meterTrack">
              <div style={{ width: `${usage.percentUsed}%` }} />
            </div>
            <p>{usage.minutesRemaining.toLocaleString()} minutes remaining this month.</p>
          </section>

          <section className="proofCard">
            <BadgeCheck size={20} />
            <strong>No invented hard-fails</strong>
            <p>Review notes are filtered against evidence before they can appear in a customer report.</p>
          </section>

          <section className="planCard">
            <span>Ready for creator clients</span>
            <strong>API + app workflow</strong>
            <p>Designed for YouTube first, with the same gate model extensible to ads, product demos, and courses.</p>
            <button type="button">{PLANS.studio.checkoutLabel}</button>
          </section>
        </aside>
      </section>
    </div>
  );
}

function GatePanel() {
  return (
    <section className="gatePanel">
      <div className="sectionTitle">
        <ListChecks size={19} />
        <h2>Pre-publish check results</h2>
      </div>
      <div className="gateList">
        {gates.map((gate) => (
          <article className="gateRow" key={gate.id}>
            <div className={gate.state === "Clean" ? "gateIcon clean" : "gateIcon warn"}>
              {gate.state === "Clean" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            </div>
            <div>
              <strong>{gate.name}</strong>
              <p>{gate.detail}</p>
            </div>
            <span className={gate.state === "Clean" ? "status cleanText" : "status warnText"}>{gate.state}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function EditorHandoffPanel() {
  return (
    <section className="timelinePanel">
      <div className="sectionTitle">
        <FileVideo size={19} />
        <h2>Editor handoff</h2>
      </div>
      <div className="handoffList">
        {editorHandoff.map((item) => (
          <article key={`${item.timestamp}-${item.issue}`}>
            <time>{item.timestamp}</time>
            <div>
              <strong>{item.issue}</strong>
              <p>{item.action} · {item.export}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewTimeline() {
  return (
    <section className="timelinePanel">
      <div className="sectionTitle">
        <Sparkles size={19} />
        <h2>Evidence-backed review notes</h2>
      </div>
      <div className="timeline">
        {activeRun.omniFlags.map((flag) => (
          <article className="timelineItem" key={`${flag.timestamp}-${flag.summary}`}>
            <time>{flag.timestamp}</time>
            <div>
              <strong>{flag.summary}</strong>
              <p>Grounded on transcript evidence: “{flag.transcriptEvidence}”.</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsPanel() {
  return (
    <section className="reportsPanel">
      <div className="sectionTitle">
        <FileVideo size={19} />
        <h2>Recent reports</h2>
      </div>
      <div className="reportCards" aria-label="Recent reports">
        {recentJobs.map((job) => (
          <article key={job.title}>
            <div>
              <strong>{job.title}</strong>
              <p>{job.type} · {Math.ceil(job.minutes)} min · {job.date}</p>
            </div>
            <span className={`verdict ${job.verdict.toLowerCase()}`}>{job.verdict}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentView() {
  return (
    <div className="pageStack">
      <header className="topbar">
        <div>
          <h1>Agent and API workflow</h1>
          <p>Claude, Codex, and production systems call the same QC Genie job API as the web app.</p>
        </div>
        <div className="usagePill">
          <KeyRound size={18} />
          <span>API keys</span>
          <strong>Scoped</strong>
        </div>
      </header>

      <section className="agentGrid">
        <section className="reportsPanel">
          <div className="sectionTitle">
            <Code2 size={19} />
            <h2>MCP tools</h2>
          </div>
          <div className="toolList">
            {mcpTools.map((tool) => (
              <article key={tool.name}>
                <strong>{tool.name}</strong>
                <p>{tool.purpose}</p>
                <code>inputs: {tool.inputs.join(", ")}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="reportsPanel">
          <div className="sectionTitle">
            <Webhook size={19} />
            <h2>REST endpoints</h2>
          </div>
          <div className="toolList">
            {agentApiEndpoints.map((endpoint) => (
              <article key={endpoint.methodPath}>
                <strong>{endpoint.methodPath}</strong>
                <p>{endpoint.purpose}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function ReadinessView() {
  return (
    <div className="pageStack">
      <header className="topbar">
        <div>
          <h1>Launch readiness panel</h1>
          <p>Recommendations from product, QC, agentic integration, conversion, mobile, SEO, and AEO review.</p>
        </div>
      </header>

      <section className="panelGrid">
        {expertPanels.map((panel) => (
          <article className="expertCard" key={panel.title}>
            <span>{panel.experts}</span>
            <strong>{panel.title}</strong>
            <ul>
              {panel.recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="reportsPanel">
        <div className="sectionTitle">
          <ListChecks size={19} />
          <h2>Task list before launch</h2>
        </div>
        <div className="taskList">
          {readinessTasks.map((task) => (
            <article key={`${task.phase}-${task.item}`}>
              <span>{task.phase}</span>
              <strong>{task.item}</strong>
              <em>{task.status}</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
