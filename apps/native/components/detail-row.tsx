import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

function DetailRow({
  icon,
  label,
  value,
  muted,
  hideIfEmpty = true,
}: {
  icon: string;
  label: string;
  value: string | null | undefined;
  muted: string;
  hideIfEmpty?: boolean;
}) {
  if (hideIfEmpty && !value) return null;
  return (
    <View className="flex-row items-center py-1.5">
      <Ionicons name={icon as "mail-outline"} size={16} color={muted} />
      <View className="ml-2.5 flex-1">
        <Text className="text-muted text-xs">{label}</Text>
        <Text className="text-foreground text-sm">{value}</Text>
      </View>
    </View>
  );
}

export { DetailRow };
