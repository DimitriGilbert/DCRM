import { useLocalSearchParams } from "expo-router";

import { TicketFormScreen } from "@/components/crm-ui";

export default function EditTicketRoute() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  return <TicketFormScreen ticketId={ticketId} />;
}
