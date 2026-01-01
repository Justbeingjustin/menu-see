/**
 * Home Screen - List of previous scans + CTA to capture
 */

import { View, Text, StyleSheet, FlatList, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/convex/_generated/api";
import { useDevice } from "./_layout";
import { colors, spacing, borderRadius, typography, shadows } from "@/lib/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { deviceId } = useDevice();
  
  // Fetch scans for this device
  const scans = useQuery(
    api.queries.getScansForDevice, 
    deviceId ? { deviceId } : "skip"
  );
  
  const stats = useQuery(
    api.queries.getDeviceStats,
    deviceId ? { deviceId } : "skip"
  );

  const handleCapture = () => {
    router.push("/capture");
  };

  const handleScanPress = (scanId: string) => {
    router.push(`/scan/${scanId}`);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return colors.status.completed;
      case "failed": return colors.status.failed;
      case "generating": return colors.status.generating;
      default: return colors.status.processing;
    }
  };

  const renderScanItem = ({ item }: { item: NonNullable<typeof scans>[0] }) => (
    <Pressable 
      style={({ pressed }) => [
        styles.scanCard,
        pressed && styles.scanCardPressed,
      ]}
      onPress={() => handleScanPress(item._id)}
    >
      {/* Thumbnail */}
      <View style={styles.thumbnail}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumbnailImage} />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="restaurant-outline" size={24} color={colors.text.tertiary} />
          </View>
        )}
      </View>
      
      {/* Info */}
      <View style={styles.scanInfo}>
        <Text style={styles.restaurantName} numberOfLines={1}>
          {item.restaurantName || "Menu Scan"}
        </Text>
        <Text style={styles.scanMeta}>
          {item.totalDishes} dishes • {formatDate(item.createdAt)}
        </Text>
        
        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status === "generating" 
              ? `${item.imagesGenerated}/${item.imagesRequested} images`
              : item.status
            }
          </Text>
        </View>
      </View>
      
      {/* Chevron */}
      <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
    </Pressable>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="camera-outline" size={64} color={colors.text.tertiary} />
      </View>
      <Text style={styles.emptyTitle}>No menus scanned yet</Text>
      <Text style={styles.emptySubtitle}>
        Take a photo of a restaurant menu to see AI-generated dish images
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Stats header */}
      {stats && stats.totalScans > 0 && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalScans}</Text>
            <Text style={styles.statLabel}>Scans</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalDishes}</Text>
            <Text style={styles.statLabel}>Dishes</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalImages}</Text>
            <Text style={styles.statLabel}>Images</Text>
          </View>
        </View>
      )}
      
      {/* Scans list */}
      <FlatList
        data={scans || []}
        renderItem={renderScanItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={[
          styles.listContent,
          (!scans || scans.length === 0) && styles.emptyListContent,
        ]}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      />
      
      {/* Floating action button */}
      <Pressable 
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
        ]}
        onPress={handleCapture}
      >
        <Ionicons name="camera" size={28} color={colors.text.inverse} />
        <Text style={styles.fabText}>Scan Menu</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  
  // Stats
  statsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  statValue: {
    fontSize: typography.fontSize.xxl,
    fontWeight: "700",
    color: colors.text.primary,
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border.default,
  },
  
  // List
  listContent: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 100,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: "center",
  },
  
  // Scan card
  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.sm,
  },
  scanCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    backgroundColor: colors.bg.tertiary,
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  thumbnailPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  scanInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  restaurantName: {
    fontSize: typography.fontSize.lg,
    fontWeight: "600",
    color: colors.text.primary,
  },
  scanMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  
  // Empty state
  emptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.bg.secondary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 22,
  },
  
  // FAB
  fab: {
    position: "absolute",
    bottom: spacing.xl,
    right: spacing.lg,
    left: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
    ...shadows.lg,
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  fabText: {
    fontSize: typography.fontSize.lg,
    fontWeight: "600",
    color: colors.text.inverse,
  },
});

