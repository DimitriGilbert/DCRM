import { useLocalSearchParams } from "expo-router";

import { ClientFormScreen } from "@/components/crm-ui";

export default function EditClientRoute() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  return <ClientFormScreen clientId={clientId} />;
}
