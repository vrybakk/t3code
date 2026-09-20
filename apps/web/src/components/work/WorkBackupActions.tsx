import type { WorkExport } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { Button } from "../ui/button";

const download = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function WorkBackupActions({
  pending,
  onExport,
  onImport,
}: {
  readonly pending: boolean;
  readonly onExport: () => Promise<WorkExport | null>;
  readonly onImport: (backup: WorkExport) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const exportBackup = async () => {
    const backup = await onExport();
    if (!backup) return;
    download(
      `work-ledger-v${backup.version}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    setMessage("Backup downloaded.");
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as WorkExport;
      setMessage((await onImport(backup)) ? "Backup merged." : "Backup could not be merged.");
    } catch {
      setMessage("Choose a valid Work JSON backup.");
    }
  };
  return (
    <section className="rounded-lg border p-5 print:hidden" aria-labelledby="work-backup-heading">
      <h2 id="work-backup-heading" className="font-medium">
        Backup and export
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        JSON backups merge with local history and never replace it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => void exportBackup()}>
          Download JSON backup
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>
          Import JSON backup
        </Button>
        <input
          ref={input}
          className="hidden"
          type="file"
          accept="application/json"
          onChange={(event) => void importBackup(event.target.files?.[0])}
        />
      </div>
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
