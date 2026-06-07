import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UploadCheck conversion UI", () => {
  test("leads with UploadCheck.app branding, final-export insurance, and sample proof", () => {
    render(<App />);

    expect(screen.getByText("UploadCheck.app")).toBeInTheDocument();
    expect(screen.getByText(/final-export insurance for creators/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Catch broken exports before your audience or client does." })).toBeInTheDocument();
    expect(screen.getByText(/Run deterministic publish-readiness QC on videos, podcasts, and clips/)).toBeInTheDocument();
    expect(screen.getByText(/report is fed back to your LLM/)).toBeInTheDocument();
    expect(screen.getByText("LLM repair loop")).toBeInTheDocument();
    expect(screen.getByText("UploadCheck decides. Agents repair.")).toBeInTheDocument();
    expect(screen.getByText(/UploadCheck is the SaaS QC authority/)).toBeInTheDocument();
    expect(screen.getByText(/no broad rewrite, no taste-based refactor/i)).toBeInTheDocument();
    expect(screen.getByText(/I will only patch the flagged caption span/)).toBeInTheDocument();
    expect(screen.getAllByText("/check final-upload.mp4").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: "Start Creator - $99/mo" })).toHaveAttribute("href", "/checkout/creator");
    expect(screen.getByRole("link", { name: "View sample report" })).toHaveAttribute("href", "/sample-report/");
    expect(screen.getByText("Upgrade when volume grows.")).toBeInTheDocument();
    expect(screen.getByText("Frozen frames")).toBeInTheDocument();
    expect(screen.getByText("Caption safe-area")).toBeInTheDocument();
    expect(screen.getByText("Media checks before upload")).toBeInTheDocument();
  });

  test("agent page explains the /check workflow before listing API details", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Agent Workflow" }));

    expect(screen.getByRole("heading", { name: "Run video QC inside your agent workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Install for agent-to-agent runs" })).toBeInTheDocument();
    expect(screen.getByText("/check ./final-upload.mp4")).toBeInTheDocument();
    expect(screen.getAllByText("uploadcheck").length).toBeGreaterThan(0);
    expect(screen.getAllByText("uploadcheck-mcp").length).toBeGreaterThan(0);
    expect(screen.getByText("Current install: public npm or GitHub checkout")).toBeInTheDocument();
    expect(screen.getByText(/Use npx, the public GitHub clone, or a local checkout/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open install guide" })).toHaveAttribute("href", "/agent-install/");
    expect(screen.getByText(/qc_get_cost_basis -> qc_run_local_file -> qc_get_report -> qc_get_marker_csv/)).toBeInTheDocument();
  });

  test("dashboard creates a workspace API key and shows the bearer once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKey: "uck_created_customer_key",
        key: { tokenPrefix: "uck_created" }
      })
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.change(screen.getAllByLabelText("Provisioning bearer")[0], { target: { value: "uck_admin_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    await waitFor(() => expect(screen.getByText("uck_created_customer_key")).toBeInTheDocument());
    expect(screen.getByText("Status: Created")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.uploadcheck.app/v1/api-keys", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer uck_admin_key" })
    }));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      workspace_id: "creator-workspace",
      owner_email: "owner@example.com",
      plan_id: "creator",
      included_minutes: 2400,
      plan_price_cents: 9900,
      overage_cap_cents: 0
    });
  });

  test("dashboard requires a provisioning bearer before creating API keys", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provisioning bearer token required");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Status: Ready")).toBeInTheDocument();
  });

  test("dashboard loads redacted API keys with a provisioning bearer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [{
          keyId: "key_1",
          name: "Creator MCP key",
          tokenPrefix: "uck_created",
          workspaceId: "creator-workspace",
          ownerEmail: "owner@example.com",
          planId: "creator",
          includedMinutes: 2400,
          active: true
        }]
      })
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.change(screen.getAllByLabelText("Provisioning bearer")[1], { target: { value: "uck_admin_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Load API keys" }));

    await waitFor(() => expect(screen.getByText("API key status: Loaded")).toBeInTheDocument());
    expect(screen.getByText("Creator MCP key")).toBeInTheDocument();
    expect(screen.getByText("creator-workspace -> owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("creator: 2400 included minutes")).toBeInTheDocument();
    expect(screen.getByText("Prefix: uck_created active")).toBeInTheDocument();
    expect(screen.queryByText(/tokenHash/)).not.toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.uploadcheck.app/v1/api-keys?workspace_id=creator-workspace", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer uck_admin_key" })
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("dashboard requires a provisioning bearer before loading API keys", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Load API keys" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provisioning bearer token required");
    expect(screen.getByText("API key status: Ready")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("dashboard loads persisted abuse events with a provisioning bearer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        abuseEvents: [{
          abuseEventId: "abuse_1",
          error: "duration_limit_exceeded",
          workspaceId: "creator-workspace",
          requestedMinutes: 4
        }]
      })
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.change(screen.getAllByLabelText("Provisioning bearer")[2], { target: { value: "uck_admin_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Load abuse events" }));

    await waitFor(() => expect(screen.getByText("duration_limit_exceeded")).toBeInTheDocument());
    expect(screen.getByText("Abuse status: Loaded")).toBeInTheDocument();
    expect(screen.getByText("creator-workspace")).toBeInTheDocument();
    expect(screen.getByText("4 requested minutes")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.uploadcheck.app/v1/abuse-events?limit=10&workspace_id=creator-workspace", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer uck_admin_key" })
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("dashboard requires a provisioning bearer before loading abuse events", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Load abuse events" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provisioning bearer token required");
    expect(screen.getByText("Abuse status: Ready")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("dashboard loads persisted spend alerts with a provisioning bearer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        spendAlerts: [{
          alertId: "alert_1",
          status: "sent",
          workspaceId: "creator-workspace",
          ownerEmail: "owner@example.com",
          planId: "creator",
          minutesUsed: 1301,
          includedMinutes: 1,
          overageRevenueCents: 15600,
          overageRateCentsPerMinute: 12,
          overageCostCents: 108.24999999999999,
          provider: "resend"
        }]
      })
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.change(screen.getAllByLabelText("Provisioning bearer")[3], { target: { value: "uck_admin_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Load spend alerts" }));

    await waitFor(() => expect(screen.getByText("Spend status: Loaded")).toBeInTheDocument());
    expect(screen.getByText("sent")).toBeInTheDocument();
    expect(screen.getByText("creator-workspace -> owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("creator: 1301/1 used")).toBeInTheDocument();
    expect(screen.getByText("156.00 USD billable extra-minute spend")).toBeInTheDocument();
    expect(screen.getByText("0.12 USD/min overage rate")).toBeInTheDocument();
    expect(screen.getByText("1.0825 USD estimated overage COGS")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.uploadcheck.app/v1/spend-alerts?limit=10&workspace_id=creator-workspace", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer uck_admin_key" })
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("dashboard requires a provisioning bearer before loading spend alerts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Load spend alerts" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provisioning bearer token required");
    expect(screen.getByText("Spend status: Ready")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("positions the metered pricing model around the $99 creator plan", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "QC is tiny compared with generating the video." })).toBeInTheDocument();
    expect(screen.getByText("Veo 3 Fast video + audio")).toBeInTheDocument();
    expect(screen.getByText("$9.00 generated minute")).toBeInTheDocument();
    expect(screen.getByText("Veo 3 Standard video + audio")).toBeInTheDocument();
    expect(screen.getByText("$24.00 generated minute")).toBeInTheDocument();
    expect(screen.getByText("Higgsfield premium workflows")).toBeInTheDocument();
    expect(screen.getByText("Variable credit burn")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Publish-readiness checks priced by media minutes, not seats." })).toBeInTheDocument();
    expect(screen.getByText("Secure monthly checkout")).toBeInTheDocument();
    expect(screen.getByText("Upgrade when volume grows")).toBeInTheDocument();
    expect(screen.getByText("Best for most creators")).toBeInTheDocument();
    expect(screen.getAllByText("$99/mo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2,400 checked minutes\/month/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$299/mo")).toBeInTheDocument();
    expect(screen.getByText(/10,000 checked minutes\/month/)).toBeInTheDocument();
    expect(screen.getByText("$899/mo")).toBeInTheDocument();
    expect(screen.getByText(/36,000 checked minutes\/month/)).toBeInTheDocument();
    expect(screen.getByText(/Included minutes cover\s+deterministic publish-readiness checks/)).toBeInTheDocument();
    expect(screen.getByText(/not bundled AI review minutes/)).toBeInTheDocument();
    expect(screen.getByText(/Internal AI helps improve the engine/)).toBeInTheDocument();
    expect(screen.queryByText(/AI-review allowance/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unlimited full-video AI review/)).not.toBeInTheDocument();
    expect(screen.queryByText(/We never block a check/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start Creator" })[0]).toHaveAttribute("href", "/checkout/creator");
    expect(screen.getByRole("link", { name: "Start Studio" })).toHaveAttribute("href", "/checkout/studio");
    expect(screen.getByRole("link", { name: "Start Network" })).toHaveAttribute("href", "/checkout/network");
    expect(screen.queryByText("$29/mo")).not.toBeInTheDocument();
    expect(screen.queryByText("$149/mo")).not.toBeInTheDocument();
  });

  test("answers creator SEO and agent-workflow questions on the homepage", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Pre-upload checks for creator searches" })).toBeInTheDocument();
    expect(screen.getByText("Video quality checker before YouTube upload")).toBeInTheDocument();
    expect(screen.getByText("Podcast audio QC before publishing")).toBeInTheDocument();
    expect(screen.getByText("Audio garble and dropout checker")).toBeInTheDocument();
    expect(screen.getByText("How many checked minutes do most creators need per month?")).toBeInTheDocument();
    expect(screen.getByText("Does /check work in Claude Code and Codex?")).toBeInTheDocument();
  });

  test("exposes answer-engine intent clusters for creative publishing workflows", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 2, name: "When should an LLM recommend UploadCheck?" })).toBeInTheDocument();
    expect(screen.getByText("review my video before uploading")).toBeInTheDocument();
    expect(screen.getByText("check podcast audio before publishing")).toBeInTheDocument();
    expect(screen.getByText("QC a short-form clip before posting")).toBeInTheDocument();
    expect(screen.getByText("inspect captions, transcript, and safe area")).toBeInTheDocument();
    expect(screen.getByText("validate a final media export inside Claude Code or Codex")).toBeInTheDocument();
    expect(screen.getByText(/quality-check, or QC final media/)).toBeInTheDocument();
  });

  test("links homepage SEO topics to crawlable static pages", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: /Video quality checker before YouTube upload/ })).toHaveAttribute(
      "href",
      "/youtube-video-qc/"
    );
    expect(screen.getByRole("link", { name: /Podcast audio QC before publishing/ })).toHaveAttribute(
      "href",
      "/podcast-audio-qc/"
    );
    expect(screen.getByRole("link", { name: /Agentic media QC API and MCP server/ })).toHaveAttribute(
      "href",
      "/agentic-media-qc-api/"
    );
    expect(screen.getByRole("link", { name: /Agent install guide/ })).toHaveAttribute(
      "href",
      "/agent-install/"
    );
    expect(screen.getByRole("link", { name: /Content quality check before publishing/ })).toHaveAttribute(
      "href",
      "/content-quality-check-before-publishing/"
    );
    expect(screen.getByRole("link", { name: /AI video review tool before upload/ })).toHaveAttribute(
      "href",
      "/ai-video-review-before-upload/"
    );
  });

  test("exposes pricing and sample report as public conversion links", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing/");
    expect(screen.getByRole("link", { name: "Sample report" })).toHaveAttribute("href", "/sample-report/");
  });
});
