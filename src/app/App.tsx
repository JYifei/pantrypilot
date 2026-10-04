import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { openDatabase } from "@/db/openDatabase";
import i18n from "@/lib/i18n";
import { createAppServices, type AppServices } from "@/services/appServices";
import { AppProvider, type InitialAppData } from "./AppProvider";
import { AppShell } from "./AppShell";

type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; services: AppServices; initial: InitialAppData };

async function boot(): Promise<{ services: AppServices; initial: InitialAppData }> {
  const database = await openDatabase();
  const services = await createAppServices(database);
  const [settings, definitions, sources, lots, recipes] = await Promise.all([
    services.repositories.settings.load(),
    services.ingredients.listAll(),
    services.ingredients.listSources(),
    services.inventory.listLots(),
    services.recipes.listAll(),
  ]);
  await i18n.changeLanguage(settings.language);
  return { services, initial: { settings, definitions, sources, lots, recipes } };
}

export default function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<BootState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    boot()
      .then((result) => {
        if (!cancelled) setState({ status: "ready", ...result });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setState({ status: "error", message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        {t("app.loading")}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">{t("app.startupError")}</h1>
        <p className="text-muted-foreground">{t("app.startupErrorHint")}</p>
        <pre className="overflow-auto rounded-lg bg-muted p-4 text-sm">{state.message}</pre>
        <Button
          className="self-start"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          {t("app.retry")}
        </Button>
      </div>
    );
  }

  return (
    <AppProvider services={state.services} initial={state.initial}>
      <TooltipProvider delayDuration={300}>
        <AppShell />
        <Toaster />
      </TooltipProvider>
    </AppProvider>
  );
}
