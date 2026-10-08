"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiErrorText } from "@/components/useApiErrorText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { pickText, type ContentLanguage } from "@/lib/i18n/localizedText";
import { scenariosFor } from "@/lib/freestyle/scenarios";
import type { SessionView } from "@/lib/freestyle/sessionViews";
import type { FreestyleMode } from "@/lib/freestyle/modes";
import type { CefrLevel } from "@/lib/types";

const FREE = "__free";
const READING_SUGGESTIONS = ["travel", "food", "sport", "weather"] as const;
const WRITING_SUGGESTIONS = [
  "weekend",
  "family",
  "dreamJob",
  "holiday",
] as const;

interface Props {
  mode: FreestyleMode;
  levels: CefrLevel[];
  activeLevel: CefrLevel;
  grammarTopics: string[];
  onStarted: (view: SessionView) => void;
  // S16: the topics depend on the level, so the parent refetches them when it changes.
  onLevelChange?: (level: CefrLevel) => void;
}

export function SessionSetup({
  mode,
  levels,
  activeLevel,
  grammarTopics,
  onStarted,
  onLevelChange,
}: Props) {
  const t = useTranslations("freestyle");
  const errorText = useApiErrorText();
  const language = useLocale() as ContentLanguage;
  const [level, setLevel] = useState<CefrLevel>(
    levels.includes(activeLevel) ? activeLevel : levels[0],
  );
  // conversation: a scenario id or FREE; grammar drill: a lesson title or FREE ('' = nothing chosen yet).
  const [choice, setChoice] = useState(mode === "conversation" ? FREE : "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // A double click lands before `busy` re-renders; the ref makes it one start call.
  const starting = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const scenarios = scenariosFor(level);
  const trimmed = text.trim();
  const choiceList =
    mode === "conversation" ? scenarios.map((s) => s.id) : grammarTopics;
  const effectiveChoice =
    choice === FREE || choiceList.includes(choice)
      ? choice
      : mode === "conversation"
        ? FREE
        : "";

  function changeLevel(next: CefrLevel) {
    setLevel(next);
    if (mode === "conversation") setChoice(FREE);
    onLevelChange?.(next);
  }

  function buildSetup(): Record<string, string> | null {
    if (mode === "conversation") {
      if (effectiveChoice !== FREE) return { scenarioId: effectiveChoice };
      return trimmed ? { topic: trimmed } : {};
    }
    if (mode === "grammar_drill") {
      const topic = effectiveChoice === FREE ? trimmed : effectiveChoice;
      return topic ? { topic } : null;
    }
    if (mode === "free_reading") return trimmed ? { topic: trimmed } : null;
    return trimmed ? { prompt: trimmed } : {};
  }

  const setup = buildSetup();

  async function start() {
    if (!setup || starting.current) return;
    starting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/freestyle/${mode}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, setup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorText(data, t("startFailed")));
        return;
      }
      onStarted(data as SessionView);
    } catch {
      setError(t("startFailed"));
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }

  function choiceRow(value: string, label: string) {
    return (
      <div key={value} className="flex items-center gap-3">
        <RadioGroupItem
          id={`fs-choice-${value}`}
          value={value}
          className="size-5"
        />
        <label htmlFor={`fs-choice-${value}`} className="flex-1 py-2 text-base">
          {label}
        </label>
      </div>
    );
  }

  const suggestions =
    mode === "free_reading"
      ? READING_SUGGESTIONS
      : mode === "free_writing"
        ? WRITING_SUGGESTIONS
        : null;
  const suggestionNs =
    mode === "free_reading" ? "readingSuggestions" : "writingSuggestions";
  const choosing = mode === "conversation" || mode === "grammar_drill";
  const showInput = !choosing || effectiveChoice === FREE;

  return (
    // Not a <form>: Radix radios inside one render a bubble input that needs ResizeObserver (absent in jsdom).
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="freestyle-level" className="text-sm font-medium">
          {t("level")}
        </label>
        <NativeSelect
          id="freestyle-level"
          value={level}
          onChange={(e) => changeLevel(e.target.value as CefrLevel)}
        >
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </div>

      {choosing && (
        <RadioGroup
          value={effectiveChoice}
          onValueChange={setChoice}
          aria-label={mode === "conversation" ? t("scenario") : t("topic")}
        >
          {mode === "conversation"
            ? scenarios.map((s) => choiceRow(s.id, pickText(s.title, language)))
            : grammarTopics.map((topic) => choiceRow(topic, topic))}
          {choiceRow(FREE, t("freeTopic"))}
        </RadioGroup>
      )}

      {showInput && (
        <div className="flex flex-col gap-2">
          <label htmlFor="freestyle-text" className="text-sm font-medium">
            {choosing
              ? t("freeTopic")
              : mode === "free_writing"
                ? t("prompt")
                : t("topic")}
          </label>
          <Input
            id="freestyle-text"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void start();
            }}
          />
        </div>
      )}

      {suggestions && (
        <div
          role="group"
          aria-label={t("suggestions")}
          className="flex flex-wrap gap-2"
        >
          {suggestions.map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setText(t(`${suggestionNs}.${key}`))}
            >
              {t(`${suggestionNs}.${key}`)}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        onClick={() => void start()}
        disabled={!setup || busy}
        className="h-12 text-base"
      >
        {busy ? t("starting") : t("start")}
      </Button>
    </div>
  );
}
