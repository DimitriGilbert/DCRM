import "@/global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider } from "@/contexts/app-theme-context";
import { queryClient } from "@/utils/trpc";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function Layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <AppThemeProvider>
            <HeroUINativeProvider>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="client/[id]"
                  options={{ title: "Client Details" }}
                />
                <Stack.Screen
                  name="project/[id]"
                  options={{ title: "Project Details" }}
                />
                <Stack.Screen
                  name="ticket/[id]"
                  options={{ title: "Ticket Details" }}
                />
                <Stack.Screen
                  name="exchange/[id]"
                  options={{ title: "Exchange" }}
                />
                <Stack.Screen
                  name="create-client"
                  options={{ presentation: "modal", title: "New Client" }}
                />
                <Stack.Screen
                  name="create-project"
                  options={{ presentation: "modal", title: "New Project" }}
                />
                <Stack.Screen
                  name="create-ticket"
                  options={{ presentation: "modal", title: "New Ticket" }}
                />
                <Stack.Screen
                  name="create-exchange"
                  options={{ presentation: "modal", title: "New Exchange" }}
                />
                <Stack.Screen
                  name="modal"
                  options={{ title: "Modal", presentation: "modal" }}
                />
              </Stack>
            </HeroUINativeProvider>
          </AppThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
