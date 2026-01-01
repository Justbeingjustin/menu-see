/**
 * Device ID management for anonymous user tracking
 * Uses SecureStore to persist a stable device identifier
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "menusee_device_id";

/**
 * Generate a random UUID-like string
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomPart}-${randomPart2}`;
}

/**
 * Get or create a stable device ID
 * Falls back to in-memory ID for web platform
 */
let webDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  // Web doesn't support SecureStore
  if (Platform.OS === "web") {
    if (!webDeviceId) {
      // Try localStorage for web
      try {
        webDeviceId = localStorage.getItem(DEVICE_ID_KEY);
        if (!webDeviceId) {
          webDeviceId = generateId();
          localStorage.setItem(DEVICE_ID_KEY, webDeviceId);
        }
      } catch {
        webDeviceId = generateId();
      }
    }
    return webDeviceId;
  }
  
  // Native platforms use SecureStore
  try {
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    
    if (!deviceId) {
      deviceId = generateId();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.error("Error accessing SecureStore:", error);
    // Fallback to generated ID (won't persist across app restarts)
    return generateId();
  }
}

/**
 * Clear device ID (for testing/debug)
 */
export async function clearDeviceId(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(DEVICE_ID_KEY);
      webDeviceId = null;
    } catch {}
    return;
  }
  
  try {
    await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
  } catch (error) {
    console.error("Error clearing device ID:", error);
  }
}

