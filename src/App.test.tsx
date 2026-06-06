import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { App } from "./App";

describe("UploadCheck conversion UI", () => {
  test("leads with UploadCheck.app branding, tagline, and slash-command workflow", () => {
    render(<App />);

    expect(screen.getByText("UploadCheck.app")).toBeInTheDocument();
    expect(screen.getByText("Quality check videos, podcasts, and clips before you upload.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Give your agent eyes and ears before upload." })).toBeInTheDocument();
    expect(screen.getAllByText("/check final-upload.mp4")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Run /check workflow" })).toBeInTheDocument();
    expect(screen.queryByText("QC Genie")).not.toBeInTheDocument();
  });

  test("agent page explains the /check workflow before listing API details", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Agent Workflow" }));

    expect(screen.getByRole("heading", { name: "Run video QC inside your agent workspace" })).toBeInTheDocument();
    expect(screen.getByText("/check ./final-upload.mp4")).toBeInTheDocument();
    expect(screen.getByText("@uploadcheck/cli")).toBeInTheDocument();
    expect(screen.getByText("@uploadcheck/mcp")).toBeInTheDocument();
    expect(screen.getAllByText("uploadcheck").length).toBeGreaterThan(0);
    expect(screen.getByText(/summarizes evidence, then updates captions/)).toBeInTheDocument();
  });

  test("positions the metered pricing model around the $99 creator plan", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Quality check every upload before your audience sees it." })).toBeInTheDocument();
    expect(screen.getByText("Best for most creators")).toBeInTheDocument();
    expect(screen.getAllByText("$99/mo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1,200 checked minutes\/month/)).toBeInTheDocument();
    expect(screen.getByText("$299/mo")).toBeInTheDocument();
    expect(screen.getByText(/5,000 checked minutes\/month/)).toBeInTheDocument();
    expect(screen.getByText("$799/mo")).toBeInTheDocument();
    expect(screen.getByText(/18,000 checked minutes\/month/)).toBeInTheDocument();
    expect(screen.getByText(/Included minutes cover deterministic pre-upload QC/)).toBeInTheDocument();
    expect(screen.getByText(/95% gross-margin target/)).toBeInTheDocument();
    expect(screen.getByText(/downgrades expensive model-backed checks or blocks the run before spend/)).toBeInTheDocument();
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
  });

  test("exposes pricing and sample report as public conversion links", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing/");
    expect(screen.getByRole("link", { name: "Sample report" })).toHaveAttribute("href", "/sample-report/");
  });
});
