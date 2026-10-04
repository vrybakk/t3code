import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
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
  type DragStartEvent,
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
  ChevronRightIcon,
  CircleDashedIcon,
  FolderIcon,
  MessageCircleQuestionIcon,
  MessagesSquareIcon,
  PinIcon,
  PinOffIcon,
  SquarePenIcon,
} from "lucide-react";
import { useRef, type MouseEvent, type ReactNode } from "react";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useUiStateStore } from "../../uiStateStore";
import { cn } from "~/lib/utils";
import { SidebarDragLifecycle } from "../Sidebar.pointer";
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
  pinned: boolean;
  onTogglePinned: () => void;
  onReorderThread: (activeKey: string, overKey: string) => void;
  activeThreadKey: string | null;
  threadSensors: ReturnType<typeof useSensors>;
  contextDrag: boolean;
  onThreadDragStart: (event: DragStartEvent) => void;
  onThreadDragFinish: () => void;
  onThreadDragUnmount: () => void;
  renderThread: (thread: EnvironmentThreadShell) => ReactNode;
  onContextMenu: (position: { x: number; y: number }) => void;
  onNewThread: (() => void) | undefined;
}

interface SortableSidebarProjectGroupListProps {
  groups: readonly ProjectThreadGroup[];
  onReorder: (activeProjectKey: string, overProjectKey: string) => void;
  renderGroup: (group: ProjectThreadGroup) => ReactNode;
  pinnedProjectKeys: readonly string[];
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
    <li role="presentation" className="contents">
      <DndContext
        sensors={sensors}
        collisionDetection={(args) =>
          projectGroupCollisionDetection({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (container) =>
                props.pinnedProjectKeys.includes(String(container.id)) ===
                props.pinnedProjectKeys.includes(String(args.active.id)),
            ),
          })
        }
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragEnd={handleDragEnd}
      >
        <ul role="presentation" className="contents">
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
  const visibleThreads = expanded
    ? props.group.threads
    : props.group.threads.filter(
        (thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) ===
          props.activeThreadKey,
      );
  const threadSensors = useSensors(
    ...props.threadSensors,
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
      role="presentation"
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
          <span className="flex shrink-0 items-center gap-1.5 text-3xs leading-none">
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
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`${props.pinned ? "Unpin" : "Pin"} group ${label}`}
                onClick={props.onTogglePinned}
                className={cn(
                  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                  !props.pinned &&
                    "opacity-0 group-hover/project-row:opacity-100 focus-visible:opacity-100",
                )}
              />
            }
          >
            {props.pinned ? (
              <PinIcon aria-hidden className="size-3.5" />
            ) : (
              <PinOffIcon aria-hidden className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipPopup side="top">{props.pinned ? "Unpin group" : "Pin group"}</TooltipPopup>
        </Tooltip>
        {props.onNewThread ? (
          <span className="pointer-events-none flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100 group-hover/project-row:pointer-events-auto group-hover/project-row:opacity-100">
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
          </span>
        ) : null}
      </div>
      {visibleThreads.length > 0 ? (
        <DndContext
          sensors={threadSensors}
          autoScroll={!props.contextDrag}
          onDragStart={props.onThreadDragStart}
          onDragCancel={props.onThreadDragFinish}
          collisionDetection={(args) => {
            const pinnedKeys = new Set(
              props.group.threads
                .filter((thread) => thread.pinnedAt != null)
                .map((thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
            );
            return projectGroupCollisionDetection({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) =>
                  pinnedKeys.has(String(container.id)) === pinnedKeys.has(String(args.active.id)),
              ),
            });
          }}
          modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
          onDragEnd={(event) => {
            if (event.over !== null)
              props.onReorderThread(String(event.active.id), String(event.over.id));
            props.onThreadDragFinish();
          }}
        >
          <SidebarDragLifecycle onUnmount={props.onThreadDragUnmount} />
          <SortableContext
            items={visibleThreads.map((thread) =>
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
            )}
            strategy={verticalListSortingStrategy}
          >
            <ul
              role="presentation"
              className="flex flex-col gap-px border-l border-sidebar-border/50"
            >
              {visibleThreads.map((thread) => props.renderThread(thread))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
    </li>
  );
}
