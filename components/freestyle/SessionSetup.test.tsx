import { describe, it, expect, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/renderWithIntl";
import { delayedResponse } from "@/test/delayedResponse";
import { SessionSetup } from "./SessionSetup";

describe("SessionSetup", () => {
  it("starts a conversation at the chosen level with a scenario", async () => {
    const fetchMock = vi.fn(() =>
      delayedResponse({
        mode: "conversation",
        level: "A2",
        setup: { scenarioId: "a2-weekend" },
        messages: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onStarted = vi.fn();
    const onLevelChange = vi.fn();
    renderWithIntl(
      <SessionSetup
        mode="conversation"
        levels={["A1", "A2"]}
        activeLevel="A1"
        grammarTopics={[]}
        onStarted={onStarted}
        onLevelChange={onLevelChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Level"), {
      target: { value: "A2" },
    });
    expect(onLevelChange).toHaveBeenCalledWith("A2");
    fireEvent.click(
      screen.getByRole("radio", { name: "Talking about the weekend" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/freestyle/conversation/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "A2",
          setup: { scenarioId: "a2-weekend" },
        }),
      },
    );
  });

  it("needs a topic for a grammar drill, offering the level’s grammar lessons", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithIntl(
      <SessionSetup
        mode="grammar_drill"
        levels={["B1"]}
        activeLevel="B1"
        grammarTopics={["Relativsätze", "Passiv"]}
        onStarted={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Passiv" }));
    expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled();
  });

  it("fills a reading topic from a suggestion chip and shows start errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        delayedResponse(
          { error: "x", code: "level_locked", params: { level: "A1" } },
          { ok: false, status: 403 },
        ),
      ),
    );
    renderWithIntl(
      <SessionSetup
        mode="free_reading"
        levels={["A1"]}
        activeLevel="A1"
        grammarTopics={[]}
        onStarted={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Football" }));
    expect(screen.getByLabelText("Topic")).toHaveValue("Football");
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Level A1 is locked",
    );
  });

  it("makes one start call on a double click", async () => {
    const fetchMock = vi.fn(() =>
      delayedResponse({ mode: "free_writing", level: "A1", setup: {}, messages: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onStarted = vi.fn();
    renderWithIntl(
      <SessionSetup
        mode="free_writing"
        levels={["A1"]}
        activeLevel="A1"
        grammarTopics={[]}
        onStarted={onStarted}
      />,
    );
    const button = screen.getByRole("button", { name: "Start" });
    // Both clicks land in one batch, before `busy` disables the button.
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
