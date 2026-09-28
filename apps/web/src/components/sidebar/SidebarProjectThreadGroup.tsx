import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  FolderIcon,
  MessageCircleQuestionIcon,
  MessagesSquareIcon,
  SquarePenIcon,
} from "lucide-react";
import { useRef, type MouseEvent, type ReactNode } from "react";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useUiStateStore } from "../../uiStateStore";
import { cn } from "~/lib/utils";
import { ProjectFavicon } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  resolveSidebarProjectGroupExpanded,
  sidebarProjectThreadGroupExpansionKey,
  type SidebarProjectThreadGroup,
  type SidebarProjectThreadSection,
  type SidebarProjectThreadStatusCounts,
} from "../Sidebar.grouped";

type ProjectThreadGroup = SidebarProjectThreadGroup<SidebarProjectSnapshot, EnvironmentThreadShell>;

interface SidebarProjectThreadGroupProps {
  group: ProjectThreadGroup;
  section: SidebarProjectThreadSection;
  statusCounts: SidebarProjectThreadStatusCounts;
  sortable?: boolean;
  renderThread: (thread: EnvironmentThreadShell) => ReactNode;
  onContextMenu: (position: { x: number; y: number }) => void;
  onNewThread: (() => void) | undefined;
  onSettleAll: (() => void) | undefined;
}

interface SortableSidebarProjectGroupListProps {
  groups: readonly ProjectThreadGroup[];
  onReorder: (activeProjectKey: string, overProjectKey: string) => void;
  renderGroup: (group: ProjectThreadGroup) => ReactNode;
}

const projectGroupCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

export function SortableSidebarProjectGroupList(props: SortableSidebarProjectGroupListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over === null) return;
    props.onReorder(String(event.active.id), String(event.over.id));
  };

  return (
    <li className="contents">
      <DndContext
        sensors={sensors}
        collisionDetection={projectGroupCollisionDetection}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragEnd={handleDragEnd}
      >
        <ul className="contents">
          <SortableContext
            items={props.groups.map((group) => group.key)}
            strategy={verticalListSortingStrategy}
          >
            {props.groups.map(props.renderGroup)}
          </SortableContext>
        </ul>
      </DndContext>
    </li>
  );
}

function StatusCount(props: {
  count: number;
  label: string;
  className: string;
  children: ReactNode;
}) {
  const accessibleLabel = `${props.count} ${props.label}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={accessibleLabel}
            className={cn("inline-flex items-center gap-0.5 tabular-nums", props.className)}
          />
        }
      >
        {props.children}
        <span>{props.count}</span>
      </TooltipTrigger>
      <TooltipPopup side="top">{accessibleLabel}</TooltipPopup>
    </Tooltip>
  );
}

export function SidebarProjectThreadGroupRow(props: SidebarProjectThreadGroupProps) {
  const suppressClickAfterContextMenuRef = useRef(false);
  const ignoreContextMenuClick = (event: MouseEvent) => {
    if (suppressClickAfterContextMenuRef.current || event.ctrlKey) {
      suppressClickAfterContextMenuRef.current = false;
      return true;
    }
    return false;
  };
  const expansionKey = sidebarProjectThreadGroupExpansionKey(props.section, props.group.key);
  const expanded = useUiStateStore((state) =>
    resolveSidebarProjectGroupExpanded(state.projectExpandedById, expansionKey),
  );
  const setProjectExpanded = useUiStateStore((state) => state.setProjectExpanded);
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: props.group.key, disabled: !props.sortable });
  const label = props.group.project?.displayName ?? "Unavailable project";
  const style = props.sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "list-none rounded-md",
        isDragging && "relative z-10 opacity-70",
        isOver && !isDragging && "ring-1 ring-inset ring-ring/50",
      )}
      data-testid={`sidebar-project-group-${props.section}`}
    >
      <div
        className="group/project-row relative flex h-9 w-full items-center rounded-md text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
        onPointerDownCapture={(event) => {
          if (event.button === 0 && !event.ctrlKey) {
            suppressClickAfterContextMenuRef.current = false;
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          suppressClickAfterContextMenuRef.current = true;
          props.onContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <button
          ref={props.sortable ? setActivatorNodeRef : undefined}
          type="button"
          {...(props.sortable ? attributes : {})}
          {...(props.sortable ? listeners : {})}
          aria-expanded={expanded}
          aria-label={`${label}, ${props.statusCounts.total} chats, ${props.statusCounts.running} running, ${props.statusCounts.pending} pending`}
          onClick={(event) => {
            if (ignoreContextMenuClick(event)) return;
            setProjectExpanded(expansionKey, !expanded);
          }}
          onPointerDownCapture={(event) => {
            if (event.button !== 0 || event.ctrlKey) event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              suppressClickAfterContextMenuRef.current = false;
            }
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              props.onContextMenu({ x: bounds.left, y: bounds.bottom });
              return;
            }
            if (event.key !== "Enter") listeners?.onKeyDown?.(event);
          }}
          className={cn(
            "flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring active:translate-y-px",
            props.sortable && "cursor-grab active:cursor-grabbing",
          )}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-icon-muted transition-transform",
              expanded && "rotate-90",
            )}
          />
          {props.group.project ? (
            <ProjectFavicon project={props.group.project} className="size-4 shrink-0" />
          ) : (
            <FolderIcon aria-hidden className="size-4 shrink-0 text-icon-muted" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium text-sidebar-foreground/90">
            {label}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-3xs leading-none transition-opacity group-hover/project-row:pointer-events-none group-hover/project-row:absolute group-hover/project-row:right-2 group-hover/project-row:opacity-0 group-has-[:focus-visible]/project-row:pointer-events-none group-has-[:focus-visible]/project-row:absolute group-has-[:focus-visible]/project-row:right-2 group-has-[:focus-visible]/project-row:opacity-0">
            {props.statusCounts.idle > 0 ? (
              <StatusCount
                count={props.statusCounts.idle}
                label={props.statusCounts.idle === 1 ? "chat" : "chats"}
                className="text-sidebar-muted-foreground/60"
              >
                <MessagesSquareIcon aria-hidden className="size-3" />
              </StatusCount>
            ) : null}
            {props.statusCounts.running > 0 ? (
              <StatusCount count={props.statusCounts.running} label="running" className="text-info">
                <CircleDashedIcon aria-hidden className="size-3" />
              </StatusCount>
            ) : null}
            {props.statusCounts.pending > 0 ? (
              <StatusCount
                count={props.statusCounts.pending}
                label="pending"
                className="text-warning"
              >
                <MessageCircleQuestionIcon aria-hidden className="size-3" />
              </StatusCount>
            ) : null}
          </span>
        </button>
        {props.onNewThread || props.onSettleAll ? (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:static has-[:focus-visible]:opacity-100 group-hover/project-row:pointer-events-auto group-hover/project-row:static group-hover/project-row:opacity-100">
            {props.onNewThread ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`New thread in ${label}`}
                      onClick={(event) => {
                        if (!ignoreContextMenuClick(event)) props.onNewThread?.();
                      }}
                      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  }
                >
                  <SquarePenIcon aria-hidden className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="top">New thread in project</TooltipPopup>
              </Tooltip>
            ) : null}
            {props.onSettleAll ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Settle all chats in ${label}`}
                      onClick={(event) => {
                        if (!ignoreContextMenuClick(event)) props.onSettleAll?.();
                      }}
                      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  }
                >
                  <CheckIcon aria-hidden className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="top">Settle all chats</TooltipPopup>
              </Tooltip>
            ) : null}
          </span>
        ) : null}
      </div>
      {expanded ? (
        <ul className="flex flex-col gap-px border-l border-sidebar-border/50">
          {props.group.threads.map((thread) => props.renderThread(thread))}
        </ul>
      ) : null}
    </li>
  );
}
