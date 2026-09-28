import type { EnvironmentId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { getClientSettings } from "../hooks/useSettings";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  playNotificationSound,
} from "../threadNotifications";
import { toastManager } from "./ui/toast";

export function presentActivityNotification({
  environmentId,
  title,
  body,
  tag,
  kind,
  type,
  icon,
  showInApp = true,
  actionLabel,
  onOpen,
  onNotification,
}: {
  environmentId: EnvironmentId;
  title: string;
  body: string;
  tag: string;
  kind: "completion" | "input";
  type: "success" | "error" | "warning";
  icon?: ReactNode;
  showInApp?: boolean;
  actionLabel: string;
  onOpen: () => void;
  onNotification: (environmentId: EnvironmentId, notification: Notification) => void;
}) {
  const settings = getClientSettings();
  if (hasNotificationSound(settings.notificationMode)) {
    void playNotificationSound(kind, () =>
      hasNotificationSound(getClientSettings().notificationMode),
    );
  }
  const focused = document.visibilityState === "visible" && document.hasFocus();
  if (settings.inAppNotificationsEnabled && focused && showInApp) {
    const id = toastManager.add({
      title,
      description: body,
      type,
      data: { hideCopyButton: true, leadingIcon: icon },
      actionProps: {
        children: actionLabel,
        onClick: () => {
          toastManager.close(id);
          onOpen();
        },
      },
    });
    return;
  }
  if (
    !hasDesktopNotifications(settings.notificationMode) ||
    focused ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return;
  try {
    const notification = new Notification(title, { body, tag, silent: true });
    onNotification(environmentId, notification);
    notification.addEventListener("click", () => {
      notification.close();
      window.focus();
      onOpen();
    });
  } catch {
    // Some browsers expose Notification but reject desktop presentation.
  }
}
