import { createFileRoute } from "@tanstack/react-router";
import { WorkSettingsPanel } from "../components/settings/WorkSettings";

export const Route = createFileRoute("/settings/work")({ component: WorkSettingsPanel });
