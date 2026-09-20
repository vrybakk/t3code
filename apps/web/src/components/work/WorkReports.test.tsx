import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vite-plus/test";

import { WorkReports } from "./WorkReports.tsx";

function render(defaultMonth: string, projects = [{ id: "project" }] as never) {
  return createElement(WorkReports, {
    projects,
    reports: [],
    defaultMonth,
    pending: false,
    onCreate: async () => true,
    onTransition: async () => true,
    onCsv: async () => {},
    onSnapshotCsv: async () => {},
    onPrintSnapshot: () => {},
  });
}

function projectSelect(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ id: "work-report-project" });
}

function monthInput(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ id: "work-report-month" });
}

describe("WorkReports", () => {
  it("adopts the first loaded default month without replacing a user choice", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(render(""));
    });
    expect(monthInput(renderer!).props.value).toBe("");

    act(() => {
      renderer!.update(render("2026-09"));
    });
    expect(monthInput(renderer!).props.value).toBe("2026-09");

    act(() => {
      monthInput(renderer!).props.onChange({ target: { value: "2026-08" } });
      renderer!.update(render("2026-10"));
    });
    expect(monthInput(renderer!).props.value).toBe("2026-08");
  });

  it("selects the first asynchronously loaded project without replacing a valid choice", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(render("", [] as never));
    });
    expect(projectSelect(renderer!).props.value).toBe("");

    const projects = [{ id: "project-a" }, { id: "project-b" }] as never;
    act(() => {
      renderer!.update(render("", projects));
    });
    expect(projectSelect(renderer!).props.value).toBe("project-a");

    act(() => {
      projectSelect(renderer!).props.onChange({ target: { value: "project-b" } });
      renderer!.update(render("", projects));
    });
    expect(projectSelect(renderer!).props.value).toBe("project-b");
  });
});
