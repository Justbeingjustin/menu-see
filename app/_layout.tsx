/**
 * Root Layout - Convex Provider + Navigation Setup
 */

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CONVEX_URL } from "@/lib/convex";
import { getDeviceId } from "@/lib/deviceId";
import { colors, typography } from "@/lib/theme";
import { api } from "@/convex/_generated/api";

// Initialize Convex client
const convex = new ConvexReactClient(CONVEX_URL);

// Device context for sharing deviceId across screens
import { createContext, useContext } from "react";

type DeviceContextType = {
  deviceId: string | null;
  isLoading: boolean;
};

export const DeviceContext = createContext<DeviceContextType>({
  deviceId: null,
  isLoading: true,
});

export function useDevice() {
  return useContext(DeviceContext);
}

// Inner component that handles device initialization
function AppContent() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function initDevice() {
      try {
        const id = await getDeviceId();
        setDeviceId(id);
        
        // Ensure device user exists in Convex
        await convex.mutation(api.mutations.ensureDeviceUser, { deviceId: id });
      } catch (error) {
        console.error("Failed to initialize device:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    initDevice();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading MenuSee...</Text>
      </View>
    );
  }

  return (
    <DeviceContext.Provider value={{ deviceId, isLoading }}>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.bg.primary,
          },
          headerTintColor: colors.text.primary,
          headerTitleStyle: {
            fontWeight: "600",
          },
          contentStyle: {
            backgroundColor: colors.bg.primary,
          },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            title: "MenuSee",
            headerLargeTitle: true,
          }} 
        />
        <Stack.Screen 
          name="capture" 
          options={{ 
            title: "Scan Menu",
            presentation: "modal",
          }} 
        />
        <Stack.Screen 
          name="scan/[id]" 
          options={{ 
            title: "Menu",
          }} 
        />
      </Stack>
      <StatusBar style="light" />
    </DeviceContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConvexProvider client={convex}>
        <AppContent />
      </ConvexProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg.primary,
    gap: 16,
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
});

