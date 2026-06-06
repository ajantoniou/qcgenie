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
  { label: "Agent Workflow", icon: Code2, view: "agents" },
  { label: "Readiness", icon: BarChart3, view: "readiness" },
  { label: "Billing", icon: CircleDollarSign, view: "dashboard" }
] satisfies Array<{ label: string; icon: typeof Rocket; view: View }>;

const workflowSteps = [
  "/check final-upload.mp4",
  "UploadCheck inspects frames, audio, captions, and format",
  "agent receives timestamped evidence",
  "agent fixes captions, checklists, and source-level issues it can reach"
] as const;

const agentFindings = [
  { time: "00:12.4", issue: "frozen frame detected", evidence: "frame hash held for 2.9s" },
  { time: "01:08.7", issue: "right-channel audio dropout", evidence: "waveform evidence saved" },
  { time: "02:44.0", issue: "caption mismatch", evidence: "subtitle differs from spoken words" },
  { time: "09:16.2", issue: "black frame before end card", evidence: "visual evidence requires review" }
] as const;

const packageOptions = [
  { name: "@uploadcheck/cli", detail: "Run checks from terminal, scripts, or CI before upload." },
  { name: "@uploadcheck/mcp", detail: "Expose UploadCheck tools to Claude Code, Codex, and MCP-capable agents." },
  { name: "uploadcheck", detail: "MCP server name for connector setup and agent manifests." }
] as const;

const pricingTiers = [
  {
    name: "Creator",
    label: "Best for most creators",
    price: "$99/mo",
    minutes: "1,200",
    overage: "$0.12/min",
    detail: "Built for creators who publish weekly, batch clips, and want every final export checked before upload."
  },
  {
    name: "Studio",
    label: "Best value for teams",
    price: "$299/mo",
    minutes: "5,000",
    overage: "$0.09/min",
    detail: "For editors, agencies, and teams checking multiple shows, clients, or channels."
  },
  {
    name: "Network",
    label: "High-volume",
    price: "$799/mo",
    minutes: "18,000",
    overage: "$0.06/min",
    detail: "For high-volume teams running daily uploads, large clip batches, or multi-channel operations."
  }
] as const;

const usageProfiles = [
  { label: "Most creators", range: "300-900 min", detail: "weekly long uploads, clips, and 1-2 re-checks" },
  { label: "Heavy users", range: "2,500-4,500 min", detail: "multiple shows, clients, or batch editing weeks" },
  { label: "Super heavy", range: "10,000-16,000 min", detail: "daily uploads, networks, and large clip pipelines" }
] as const;

const searchTopics = [
  {
    title: "Video quality checker before YouTube upload",
    href: "/youtube-video-qc/",
    detail: "Run a full-timeline pass for freezes, black frames, format issues, captions, and upload-readiness notes."
  },
  {
    title: "Podcast audio QC before publishing",
    href: "/podcast-audio-qc/",
    detail: "Check clipping, dropouts, dead air, transcript alignment, and episode handoff notes before release."
  },
  {
    title: "Shorts and Reels clip quality check",
    href: "/shorts-reels-qc/",
    detail: "Review caption safe-area, mobile crop risk, loudness, trim points, and repeated clip export mistakes."
  },
  {
    title: "Audio garble and dropout checker",
    href: "/audio-garble-checker/",
    detail: "Surface timestamped audio evidence so editors and agents can tell whether the source or render needs a pass."
  },
  {
    title: "Caption safe-area and transcript grounding",
    href: "/youtube-video-qc/",
    detail: "Compare spoken content, captions, and visible placement before the final file reaches the upload screen."
  },
  {
    title: "Agentic media QC API and MCP server",
    href: "/agentic-media-qc-api/",
    detail: "Use @uploadcheck/cli, @uploadcheck/mcp, or the uploadcheck MCP server to bring reports into creator agents."
  }
] as const;

const faqItems = [
  {
    question: "How many checked minutes do most creators need per month?",
    answer:
      "Most serious solo creators fit around 300-900 checked minutes per month. The Creator plan includes 1,200 checked minutes so weekly uploads, clip batches, and a few re-checks fit without making every export feel metered."
  },
  {
    question: "Does /check work in Claude Code and Codex?",
    answer:
      "Yes. The intended workflow is /check inside Claude Code, Codex, or another slash-command capable workspace. The agent calls UploadCheck through the CLI, MCP server, or API, then reports timestamped evidence back in the same workspace."
  },
  {
    question: "Do re-checks count against included minutes?",
    answer:
      "Yes. Re-checks count because UploadCheck analyzes the actual media file each time. We never block a check; if you regularly go over, the plan should recommend the cheaper monthly path."
  },
  {
    question: "What can UploadCheck fix automatically?",
    answer:
      "UploadCheck returns evidence your agent can act on. Agents can usually fix captions, checklists, metadata, and reachable source files, while frozen video, garbled audio, and render defects may need a source or editor pass."
  },
  {
    question: "Is UploadCheck only for video?",
    answer:
      "No. The same pre-upload gate is positioned for videos, podcasts, and clips because creator teams need visual, audio, caption, and format evidence before publishing."
  }
] as const;

export function App() {
  const [view, setView] = useState<View>("home");

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">U</div>
          <div>
            <strong>UploadCheck.app</strong>
            <span>Media checks before upload</span>
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
          <span>{PLANS.studio.name} plan</span>
          <strong>${PLANS.studio.monthlyPrice}/mo</strong>
          <small>{PLANS.studio.monthlyMinutes.toLocaleString()} check minutes included</small>
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
          <h1>Give your agent eyes and ears before upload.</h1>
          <p>Quality check videos, podcasts, and clips before you upload.</p>
          <p className="heroSupport">
            Run <code>/check</code> from Claude Code, Codex, or another creator workspace. UploadCheck returns
            timestamped frame, audio, caption, and format evidence so your agent can list issues and fix what it can.
          </p>
          <div className="heroActions">
            <button onClick={onOpenAgents} type="button">
              <Code2 size={17} />
              Run /check workflow
            </button>
            <button className="secondaryButton" onClick={onOpenDashboard} type="button">
              <Play size={17} />
              Try sample video
            </button>
          </div>
          <div className="workflowStrip" aria-label="UploadCheck agent workflow">
            {workflowSteps.map((step) => (
              <span key={step}>{step}</span>
            ))}
          </div>
        </div>
        <AgentTranscript />
      </section>

      <section className="proofBand">
        <article>
          <Sparkles size={22} />
          <strong>Multimodal sensory layer</strong>
          <p>Agents get structured visual, audio, caption, and transcript signals they cannot infer from code alone.</p>
        </article>
        <article>
          <BadgeCheck size={22} />
          <strong>Evidence over vibes</strong>
          <p>Findings carry timecodes, severity, evidence notes, and clear boundaries around what needs human review.</p>
        </article>
        <article>
          <Webhook size={22} />
          <strong>Same report everywhere</strong>
          <p>Use the web app, CLI, MCP server, REST API, or webhooks without changing the core report format.</p>
        </article>
      </section>

      <section className="workflowPanel">
        <div>
          <h2>Built for the moment before publish</h2>
          <p>
            UploadCheck is a repeatable pre-upload gate for creator teams using agents to produce, edit, caption, and
            package media.
          </p>
        </div>
        <div className="workflowCards">
          <article>
            <strong>Videos</strong>
            <p>Freeze, black frame, aspect, caption safe-area, transcript grounding, and export checks.</p>
          </article>
          <article>
            <strong>Podcasts</strong>
            <p>Audio dropout, clipping, dead air, transcript alignment, and episode handoff notes.</p>
          </article>
          <article>
            <strong>Clips</strong>
            <p>Shorts-safe captions, mobile crop risk, loudness, intro/outro trim, and upload-ready reports.</p>
          </article>
        </div>
      </section>

      <section className="pricingBand">
        <div className="pricingIntro">
          <h2>Quality check every upload before your audience sees it.</h2>
          <p>
            UploadCheck checks videos, podcasts, and clips for publish-blocking issues before they go live. Plans are
            based on media minutes checked, not seats.
          </p>
        </div>
        <div className="priceCards">
          {pricingTiers.map((tier) => (
            <article className={tier.name === "Creator" ? "featuredPrice" : undefined} key={tier.name}>
              <span>{tier.label}</span>
              <strong>{tier.price}</strong>
              <p>
                {tier.minutes} checked minutes/month. {tier.detail}
              </p>
              <small>{tier.overage} overage after included minutes</small>
            </article>
          ))}
        </div>
        <div className="usageModel" aria-label="Monthly checked-minute usage model">
          {usageProfiles.map((profile) => (
            <article key={profile.label}>
              <span>{profile.label}</span>
              <strong>{profile.range}</strong>
              <p>{profile.detail}</p>
            </article>
          ))}
        </div>
        <p className="pricingNote">
          Overage is billed only when you exceed your included minutes. Re-checks count because UploadCheck analyzes the
          actual media file each time.
        </p>
      </section>

      <section className="seoPanel">
        <div className="seoIntro">
          <h2>Pre-upload checks for creator searches</h2>
          <p>
            UploadCheck is positioned around the practical jobs creators search for when they are one bad export away
            from publishing the wrong file.
          </p>
        </div>
        <div className="seoTopicGrid">
          {searchTopics.map((topic) => (
            <a className="seoTopicCard" href={topic.href} key={topic.title}>
              <strong>{topic.title}</strong>
              <p>{topic.detail}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="faqPanel">
        <div className="seoIntro">
          <h2>Answers for creators and agents</h2>
          <p>Short answers for search engines, answer engines, and humans deciding whether UploadCheck fits the workflow.</p>
        </div>
        <div className="faqGrid">
          {faqItems.map((item) => (
            <article key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function AgentTranscript() {
  return (
    <aside className="agentTranscript" aria-label="Sample UploadCheck agent transcript">
      <div className="terminalHeader">
        <span>Claude Code / Codex</span>
        <strong>/check final-upload.mp4</strong>
      </div>
      <div className="terminalBody">
        <p className="terminalLine success">Running UploadCheck...</p>
        <p>Found 4 review items before upload:</p>
        <ol>
          {agentFindings.map((finding) => (
            <li key={`${finding.time}-${finding.issue}`}>
              <time>{finding.time}</time>
              <span>{finding.issue}</span>
              <em>{finding.evidence}</em>
            </li>
          ))}
        </ol>
        <p className="terminalLine">
          I can fix the caption file and update the render checklist now. Frozen video and audio stem issues need a
          source/render pass.
        </p>
      </div>
    </aside>
  );
}

function DashboardView() {
  return (
    <div className="pageStack">
      <header className="topbar">
        <div>
          <h1>Upload quality command center</h1>
          <p>Automated checks decide the verdict. Evidence-backed notes explain what to fix before upload.</p>
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
                <p>Run full-timeline checks before a creator publishes, uploads, or sends client approval.</p>
              </div>
            </div>
            <div className="importControls">
              <input aria-label="Video source" defaultValue="https://youtube.com/watch?v=creator-cut" />
              <button type="button">
                <Play size={17} />
                Run check
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
            <p>Review notes are filtered against evidence before they can appear in an upload report.</p>
          </section>

          <section className="planCard">
            <span>Ready for creator workflows</span>
            <strong>App + CLI + MCP</strong>
            <p>Designed for video first, with the same gate model extensible to podcasts, ads, demos, and courses.</p>
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
        <h2>Pre-upload check results</h2>
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
              <p>Grounded on transcript evidence: "{flag.transcriptEvidence}".</p>
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
          <h1>Run video QC inside your agent workspace</h1>
          <p>
            UploadCheck gives Claude Code, Codex, and MCP-capable agents a quality-check loop for media they could not
            inspect on their own.
          </p>
        </div>
        <div className="usagePill">
          <KeyRound size={18} />
          <span>MCP server</span>
          <strong>uploadcheck</strong>
        </div>
      </header>

      <section className="agentRunPanel">
        <div className="quickstart">
          <div className="sectionTitle">
            <Code2 size={19} />
            <h2>Agent QC in 60 seconds</h2>
          </div>
          <div className="commandBlock">
            <code>npm install -g @uploadcheck/cli</code>
            <code>uploadcheck mcp install</code>
            <code>/check ./final-upload.mp4</code>
          </div>
          <p>
            The agent starts the check, waits for results, summarizes evidence, then updates captions, render checklists,
            or source files where it has access.
          </p>
          <p>agent fixes captions, checklists, and source-level issues it can reach</p>
        </div>
        <AgentTranscript />
      </section>

      <section className="packageGrid" aria-label="UploadCheck packages">
        {packageOptions.map((option) => (
          <article key={option.name}>
            <strong>{option.name}</strong>
            <p>{option.detail}</p>
          </article>
        ))}
      </section>

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
            <h2>REST reference</h2>
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
