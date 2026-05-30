import { useLocalSearchParams } from "expo-router";

import { TicketDetailScreen } from "@/components/crm-ui";

export default function TicketDetailRoute() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  return <TicketDetailScreen ticketId={ticketId} />;
}
