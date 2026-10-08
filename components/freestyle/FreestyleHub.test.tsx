import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/renderWithIntl";
import { delayedResponse } from "@/test/delayedResponse";
import { FreestyleHub } from "./FreestyleHub";

const FOUR = ["conversation", "grammar_drill", "free_reading", "free_writing"];

describe("FreestyleHub", () => {
  it("lists the enabled modes, marking an open session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        delayedResponse({
          modes: [
            { mode: "conversation", enabled: true, open: true },
            { mode: "grammar_drill", enabled: true, open: false },
            { mode: "free_reading", enabled: true, open: false },
            { mode: "free_writing", enabled: true, open: false },
          ],
          aiAvailable: true,
          levels: ["A1", "A2", "B1"],
        }),
      ),
    );
    renderWithIntl(<FreestyleHub />);
    expect(
      await screen.findByRole("link", {
        name: /Conversation.*Continue your session/,
      }),
    ).toHaveAttribute("href", "/freestyle/conversation");
    expect(screen.getByRole("link", { name: /Grammar drill/ })).toHaveAttribute(
      "href",
      "/freestyle/grammar_drill",
    );
    expect(screen.queryByText(/Spoken/)).not.toBeInTheDocument();
  });

  // S17: no provider -> the modes show as unavailable (not links), with the alert and a Settings link.
  it("explains that Freestyle needs an AI provider, with a Settings link, and shows the modes as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        delayedResponse({
          modes: FOUR.map((mode) => ({ mode, enabled: true, open: false })),
          aiAvailable: false,
          levels: ["A1"],
        }),
      ),
    );
    const { container } = renderWithIntl(<FreestyleHub />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Freestyle needs a working AI provider.",
    );
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(
      4,
    );
  });

  it("shows a load error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => delayedResponse({}, { ok: false, status: 500 })),
    );
    renderWithIntl(<FreestyleHub />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load Freestyle",
    );
  });
});
