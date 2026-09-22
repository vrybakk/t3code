import type { WorkProfile } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { browserTimeZone } from "../../state/workTracking";

export function WorkProfileForm({
  profile,
  pending,
  onSave,
}: {
  readonly profile: WorkProfile | null;
  readonly pending: boolean;
  readonly onSave: (input: {
    displayName: string;
    timeZone: string;
    trackingEnabled: boolean;
  }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [timeZone, setTimeZone] = useState(profile?.timeZone ?? browserTimeZone());
  const [trackingEnabled, setTrackingEnabled] = useState(profile?.trackingEnabled ?? true);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !timeZone.trim()) {
      setError("Display name and reporting timezone are required.");
      return;
    }
    setError("");
    await onSave({ displayName: displayName.trim(), timeZone: timeZone.trim(), trackingEnabled });
  };
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-profile-heading">
      <h2 id="work-profile-heading" className="font-medium">
        {profile ? "Work profile" : "Set up Work tracking"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Recording begins only after local tracking is enabled. Calendar reporting uses this
        timezone.
      </p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-display-name">Display name</Label>
          <Input
            id="work-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-timezone">Reporting timezone</Label>
          <Input
            id="work-timezone"
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            placeholder="Europe/Madrid"
          />
        </div>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <Label htmlFor="work-tracking-enabled">Enable local Work tracking</Label>
          <Switch
            id="work-tracking-enabled"
            checked={trackingEnabled}
            onCheckedChange={setTrackingEnabled}
            disabled={pending}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : profile ? "Save profile" : "Enable Work tracking"}
          </Button>
        </div>
      </form>
    </section>
  );
}
