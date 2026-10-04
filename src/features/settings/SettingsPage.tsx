import { Database, Download, Info, ShieldCheck, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useLocale } from "@/app/appContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_CONFIG } from "@/config/app";
import { parseBackup, serializeBackup, type BackupFile } from "@/domain/backup/backup";
import { todayIsoDate } from "@/domain/common/dates";
import { SUPPORTED_LOCALES, type LocaleCode } from "@/domain/common/localizedText";
import {
  CURRENCIES,
  REGIONS,
  THEMES,
  type CurrencyCode,
  type RegionCode,
  type ThemePreference,
} from "@/domain/settings/settings";
import { openTextFile, saveTextFile } from "@/lib/fileTransfer";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 max-w-md text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { settings, updateSettings, services, reload } = useApp();
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);

  async function exportData() {
    try {
      const backup = await services.backup.exportAll();
      const path = await saveTextFile(
        `${APP_CONFIG.backupFormat}-${todayIsoDate()}.json`,
        serializeBackup(backup),
      );
      if (path) toast.success(t("settings.exported", { path }));
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    }
  }

  async function chooseImportFile() {
    try {
      const text = await openTextFile();
      if (text === null) return;
      const result = parseBackup(text);
      if (!result.ok) {
        const { error } = result;
        toast.error(
          t(`settings.importErrors.${error.code}`, {
            version: "version" in error ? error.version : "",
            details: "details" in error ? error.details : "",
          }),
        );
        return;
      }
      setPendingImport(result.backup);
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const backup = pendingImport;
    setPendingImport(null);
    try {
      const result = await services.backup.importReplacingAll(backup);
      if (!result.ok) {
        toast.error(
          t("settings.importErrors.references", {
            details: result.problems.slice(0, 3).join("; "),
          }),
        );
        return;
      }
      await updateSettings(backup.data.settings);
      await reload();
      toast.success(t("settings.importDone"));
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    }
  }

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.general")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow label={t("settings.language")}>
              <Select
                value={settings.language}
                onValueChange={(v) => void updateSettings({ language: v as LocaleCode })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {t(`languages.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label={t("settings.theme")}>
              <div className="flex rounded-lg bg-muted p-0.5 text-sm">
                {THEMES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => void updateSettings({ theme: theme as ThemePreference })}
                    className={cn(
                      "rounded-md px-3 py-1.5",
                      settings.theme === theme
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(`settings.theme${theme.charAt(0).toUpperCase()}${theme.slice(1)}`)}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label={t("settings.currency")}>
              <Select
                value={settings.currency}
                onValueChange={(v) => void updateSettings({ currency: v as CurrencyCode })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label={t("settings.region")} hint={t("settings.regionHint")}>
              <Select
                value={settings.region}
                onValueChange={(v) => void updateSettings({ region: v as RegionCode })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`settings.regions.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" />
              {t("settings.data")}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow label={t("settings.dataLocation")}>
              <code className="max-w-full rounded bg-muted px-2 py-1 text-xs break-all">
                {services.database.description}
              </code>
            </SettingRow>
            <SettingRow label={t("settings.export")} hint={t("settings.exportHint")}>
              <Button variant="outline" onClick={() => void exportData()}>
                <Download />
                {t("settings.export")}
              </Button>
            </SettingRow>
            <SettingRow label={t("settings.import")} hint={t("settings.importHint")}>
              <Button variant="outline" onClick={() => void chooseImportFile()}>
                <Upload />
                {t("settings.import")}
              </Button>
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              {t("settings.privacy")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{t("settings.privacyStatement")}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-4 text-muted-foreground" />
              {t("settings.about")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">
              {t("app.name")} · {t("settings.version", { version: APP_CONFIG.version })}
            </div>
            <p>{t("settings.demoNotice")}</p>
            <p>{t("settings.licenseNotice")}</p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        destructive
        title={t("settings.importConfirmTitle")}
        description={
          pendingImport
            ? t("settings.importConfirmBody", {
                date: formatDate(pendingImport.exportedAt.slice(0, 10), locale),
                lots: pendingImport.data.inventoryLots.length,
                ingredients: pendingImport.data.ingredients.length,
                transactions: pendingImport.data.transactions.length,
              })
            : ""
        }
        confirmLabel={t("settings.importConfirm")}
        onConfirm={confirmImport}
      />
    </>
  );
}
