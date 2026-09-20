import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vite-plus/test";

import { WorkDeliveries } from "./WorkDeliveries.tsx";

function render(projects: never) {
  return createElement(WorkDeliveries, {
    projects,
    threads: [],
    deliveries: [],
    pending: false,
    onMark: async () => true,
    onReopen: async () => true,
  });
}

function projectSelect(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ id: "work-delivery-project" });
}

describe("WorkDeliveries", () => {
  it("selects the first asynchronously loaded project without replacing a valid choice", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(render([] as never));
    });

    const projects = [{ id: "project-a" }, { id: "project-b" }] as never;
    act(() => {
      renderer!.update(render(projects));
    });
    expect(projectSelect(renderer!).props.value).toBe("project-a");

    act(() => {
      projectSelect(renderer!).props.onChange({ target: { value: "project-b" } });
      renderer!.update(render(projects));
    });
    expect(projectSelect(renderer!).props.value).toBe("project-b");
  });
});
