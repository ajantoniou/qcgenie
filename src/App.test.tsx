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
});
