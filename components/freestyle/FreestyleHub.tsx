"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  MessageCircle,
  PenLine,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FREESTYLE_MODES, type FreestyleMode } from "@/lib/freestyle/modes";

interface Overview {
  modes: { mode: FreestyleMode; enabled: boolean; open: boolean }[];
  aiAvailable: boolean;
}

const ICONS: Partial<Record<FreestyleMode, LucideIcon>> = {
  conversation: MessageCircle,
  grammar_drill: Puzzle,
  free_reading: BookOpen,
  free_writing: PenLine,
};

export function FreestyleHub() {
  const t = useTranslations("freestyle");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stale = false;
    fetch("/api/freestyle")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as Overview;
        if (!stale) setOverview(data);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, []);

  if (failed) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t("loadFailed")}</AlertDescription>
      </Alert>
    );
  }
  if (!overview)
    return (
      <p role="status" className="text-text-muted">
        {t("loading")}
      </p>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {!overview.aiAvailable && (
        <Alert role="alert">
          <AlertDescription>
            <span>{t("noAi")}</span>{" "}
            <Link href="/settings" className="font-medium underline">
              {t("openSettings")}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <ul className="flex flex-col gap-3">
        {overview.modes.map(({ mode, open }) => {
          const key = FREESTYLE_MODES.find((m) => m.mode === mode)?.labelKey;
          if (!key) return null;
          const Icon = ICONS[mode] ?? MessageCircle;
          const body = (
            <>
              <Icon aria-hidden className="size-6 shrink-0 text-primary" />
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-lg font-semibold">
                  {t(`modes.${key}`)}
                </span>
                <span className="text-sm text-text-muted">
                  {t(`descriptions.${key}`)}
                </span>
              </span>
              {!overview.aiAvailable && (
                <Badge variant="outline">{t("unavailable")}</Badge>
              )}
              {overview.aiAvailable && open && <Badge>{t("continue")}</Badge>}
            </>
          );
          return (
            <li key={mode}>
              {overview.aiAvailable ? (
                <Link
                  href={`/freestyle/${mode}`}
                  className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Card className="flex-row items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-raised">
                    {body}
                  </Card>
                </Link>
              ) : (
                <Card
                  aria-disabled="true"
                  className="flex-row items-center gap-4 px-5 py-4 opacity-60"
                >
                  {body}
                </Card>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
