import { createFileRoute } from "@tanstack/react-router";
import { ClickUpPage } from "../components/clickup/ClickUpPage";

export const Route = createFileRoute("/tasks")({ component: ClickUpPage });
