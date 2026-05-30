import { useLocalSearchParams } from "expo-router";

import { ClientDetailScreen } from "@/components/crm-ui";

export default function ClientDetailRoute() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  return <ClientDetailScreen clientId={clientId} />;
}
