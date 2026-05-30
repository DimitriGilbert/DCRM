import { useLocalSearchParams } from "expo-router";

import { ProjectFormScreen } from "@/components/crm-ui";

export default function EditProjectRoute() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return <ProjectFormScreen projectId={projectId} />;
}
