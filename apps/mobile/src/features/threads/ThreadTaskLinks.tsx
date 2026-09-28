import type { ThreadClickUpTaskLink } from "@t3tools/contracts";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";

export function ThreadTaskLinks({ tasks }: { tasks: ReadonlyArray<ThreadClickUpTaskLink> }) {
  const [expanded, setExpanded] = useState(false);
  if (tasks.length === 0) return null;
  const primary = tasks.find((task) => task.primary) ?? tasks[0]!;
  const open = async (task: ThreadClickUpTaskLink) => {
    if (
      !(await tryOpenExternalUrl(
        `https://app.clickup.com/t/${encodeURIComponent(task.taskId)}`,
        "task",
      ))
    ) {
      Alert.alert("Unable to open task", "The ClickUp task could not be opened.");
    }
  };
  return (
    <View className="border-b border-border px-4 py-2">
      <View className="flex-row items-center gap-3">
        <Pressable
          className="min-w-0 flex-1"
          accessibilityRole="link"
          accessibilityLabel={`Task: ${primary.name}`}
          onPress={() => void open(primary)}
        >
          <Text className="text-xs text-muted-foreground">Task</Text>
          <Text className="text-sm text-foreground" numberOfLines={1}>
            {primary.name}
          </Text>
        </Pressable>
        {tasks.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
          >
            <Text className="text-xs text-foreground">Linked tasks ({tasks.length})</Text>
          </Pressable>
        ) : null}
      </View>
      {expanded && tasks.length > 1 ? (
        <ScrollView className="max-h-48" nestedScrollEnabled>
          {tasks.map((task) => (
            <Pressable
              key={`${task.workspaceId}:${task.taskId}`}
              className="py-2"
              accessibilityRole="link"
              onPress={() => void open(task)}
            >
              <Text className="text-sm text-foreground">{task.name}</Text>
              <Text className="text-xs text-muted-foreground">
                {task.primary ? "Primary" : "Context"} · #{task.taskId}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
