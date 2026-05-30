import { useLocalSearchParams } from "expo-router";

import { ProjectDetailScreen } from "@/components/crm-ui";

export default function ProjectDetailRoute() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return <ProjectDetailScreen projectId={projectId} />;
}
