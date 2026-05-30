import { Chip } from "heroui-native";

type ChipColor = "accent" | "default" | "success" | "warning" | "danger";

const COLOR_MAP: Record<string, ChipColor> = {
  planning: "default",
  active: "success",
  on_hold: "warning",
  completed: "accent",
  archived: "default",
  open: "success",
  in_progress: "warning",
  resolved: "accent",
  closed: "default",
  low: "default",
  medium: "warning",
  high: "danger",
  urgent: "danger",
  task: "default",
  bug: "danger",
  feature: "accent",
  question: "warning",
  new: "default",
  contacted: "accent",
  qualified: "warning",
  proposal: "accent",
  negotiation: "warning",
  won: "success",
  lost: "danger",
  email: "accent",
  note: "default",
  call: "success",
  meeting: "warning",
  comment: "accent",
  incoming: "success",
  outgoing: "accent",
};

function StatusBadge({ status }: { status: string }) {
  const color = COLOR_MAP[status] ?? "default";
  return (
    <Chip variant="soft" color={color} size="sm">
      {status.replace(/_/g, " ")}
    </Chip>
  );
}

export { StatusBadge };
