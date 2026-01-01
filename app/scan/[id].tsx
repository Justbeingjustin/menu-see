/**
 * Scan Detail Screen - Shows dishes with realtime updates
 */

import { useState } from "react";
import { 
  View, Text, StyleSheet, ScrollView, Pressable, 
  Image, ActivityIndicator, Alert, Modal, Dimensions
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useAction, useMutation } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { colors, spacing, borderRadius, typography, shadows } from "@/lib/theme";

// Type for selected dish in modal
type SelectedDish = {
  name: string;
  description?: string;
  price?: string;
  imageUrl: string;
} | null;

export default function ScanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [isStopping, setIsStopping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedDish, setSelectedDish] = useState<SelectedDish>(null);
  
  // Realtime subscription to scan + dishes
  const data = useQuery(
    api.queries.getScanWithDishes, 
    id ? { scanId: id as Id<"menuScans"> } : "skip"
  );
  
  const generateSingleImage = useAction(api.actions.generateSingleDishImage);
  const stopGeneration = useMutation(api.mutations.stopImageGeneration);
  const forceComplete = useMutation(api.mutations.forceCompleteScan);
  const deleteScan = useMutation(api.mutations.deleteScan);

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading menu...</Text>
      </View>
    );
  }

  const { scan, dishes, sections: rawSections, noSection } = data;
  
  // Show processing screen during initial extraction
  const isProcessing = ["pending", "uploading", "processing", "extracting"].includes(scan.status);
  
  if (isProcessing) {
    const getProcessingMessage = () => {
      switch (scan.status) {
        case "pending": return "Preparing...";
        case "uploading": return "Uploading image...";
        case "processing": return "Analyzing menu...";
        case "extracting": return "Reading menu items...";
        default: return "Processing...";
      }
    };
    
    const getProcessingSubtext = () => {
      switch (scan.status) {
        case "pending": return "Getting ready to process your menu";
        case "uploading": return "Sending your photo to the cloud";
        case "processing": return "AI is examining the menu layout";
        case "extracting": return "Identifying dishes, prices, and descriptions";
        default: return "This may take a moment";
      }
    };
    
    return (
      <View style={styles.processingContainer}>
        <View style={styles.processingContent}>
          <View style={styles.processingIconContainer}>
            <Ionicons name="restaurant" size={48} color={colors.accent.primary} />
          </View>
          <ActivityIndicator 
            size="large" 
            color={colors.accent.primary} 
            style={styles.processingSpinner}
          />
          <Text style={styles.processingTitle}>{getProcessingMessage()}</Text>
          <Text style={styles.processingSubtext}>{getProcessingSubtext()}</Text>
          
          {/* Progress indicator */}
          <View style={styles.processingProgressContainer}>
            <View style={styles.processingProgressTrack}>
              <View 
                style={[
                  styles.processingProgressBar, 
                  { width: `${scan.progress}%` }
                ]} 
              />
            </View>
            <Text style={styles.processingProgressText}>{Math.round(scan.progress)}%</Text>
          </View>
        </View>
        
        {/* Cancel button */}
        <Pressable
          style={({ pressed }) => [
            styles.processingCancelButton,
            pressed && styles.processingCancelButtonPressed,
          ]}
          onPress={() => {
            Alert.alert(
              "Cancel Scan?",
              "This will stop processing and delete the scan.",
              [
                { text: "Continue", style: "cancel" },
                {
                  text: "Cancel Scan",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await deleteScan({ scanId: id as Id<"menuScans"> });
                      router.back();
                    } catch (error) {
                      console.error("Failed to cancel:", error);
                    }
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.processingCancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }
  
  // Normalize sections to array format (handles both old object and new array format)
  const sections = Array.isArray(rawSections) 
    ? rawSections 
    : Object.entries(rawSections || {}).map(([name, items]) => ({ 
        name, 
        items: items as typeof dishes 
      }));

  const handleStop = async () => {
    if (isStopping) return;
    
    Alert.alert(
      "Stop Generation?",
      "This will skip any remaining queued images. Images currently generating will finish.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            setIsStopping(true);
            try {
              await stopGeneration({ scanId: id as Id<"menuScans"> });
            } catch (error) {
              console.error("Failed to stop:", error);
              Alert.alert("Error", "Failed to stop generation");
            } finally {
              setIsStopping(false);
            }
          },
        },
      ]
    );
  };

  const handleForceComplete = async () => {
    Alert.alert(
      "Force Complete?",
      "This will mark any stuck jobs as skipped and complete the scan.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Force Complete",
          onPress: async () => {
            try {
              await forceComplete({ scanId: id as Id<"menuScans"> });
            } catch (error) {
              console.error("Failed to force complete:", error);
              Alert.alert("Error", "Failed to complete scan");
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Menu?",
      "This will permanently delete this menu and all generated images. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteScan({ scanId: id as Id<"menuScans"> });
              router.back();
            } catch (error) {
              console.error("Failed to delete:", error);
              Alert.alert("Error", "Failed to delete menu");
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return "checkmark-circle";
      case "generating": return "sync";
      case "queued": return "time";
      case "failed": return "alert-circle";
      default: return "image-outline";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return colors.status.completed;
      case "generating": return colors.status.generating;
      case "queued": return colors.status.processing;
      case "failed": return colors.status.failed;
      default: return colors.text.tertiary;
    }
  };

  const handleDishPress = async (dish: typeof dishes[0]) => {
    // If image exists, show full screen view
    if (dish.imageUrl) {
      setSelectedDish({
        name: dish.name,
        description: dish.description,
        price: dish.price,
        imageUrl: dish.imageUrl,
      });
      return;
    }
    
    // If pending or skipped, generate image
    if (dish.imageStatus === "pending" || dish.imageStatus === "skipped" || dish.imageStatus === "failed") {
      try {
        await generateSingleImage({ dishId: dish._id as Id<"dishes"> });
      } catch (error) {
        console.error("Failed to generate image:", error);
        Alert.alert("Error", "Failed to start image generation");
      }
    }
  };

  // Check if dish can be tapped (has image OR can generate)
  const isDishTappable = (dish: typeof dishes[0]) => {
    return dish.imageUrl || 
           dish.imageStatus === "pending" || 
           dish.imageStatus === "skipped" || 
           dish.imageStatus === "failed";
  };

  const renderDishCard = (dish: typeof dishes[0]) => (
    <Pressable 
      key={dish._id} 
      style={({ pressed }) => [
        styles.dishCard,
        isDishTappable(dish) && pressed && styles.dishCardPressed,
      ]}
      onPress={() => handleDishPress(dish)}
      disabled={!isDishTappable(dish)}
    >
      {/* Image */}
      <View style={styles.dishImageContainer}>
        {dish.imageUrl ? (
          <Image source={{ uri: dish.imageUrl }} style={styles.dishImage} />
        ) : (
          <View style={styles.dishImagePlaceholder}>
            {dish.imageStatus === "generating" || dish.imageStatus === "queued" ? (
              <ActivityIndicator size="small" color={colors.accent.secondary} />
            ) : (
              <View style={styles.tapToGenerateContainer}>
                <Ionicons 
                  name="sparkles-outline" 
                  size={24} 
                  color={colors.accent.primary} 
                />
                <Text style={styles.tapToGenerateText}>Tap to{'\n'}generate</Text>
              </View>
            )}
          </View>
        )}
        
        {/* Status badge */}
        {dish.imageStatus !== "completed" && dish.imageStatus !== "pending" && (
          <View style={[
            styles.imageStatusBadge, 
            { backgroundColor: getStatusColor(dish.imageStatus) }
          ]}>
            <Text style={styles.imageStatusText}>
              {dish.imageStatus === "generating" ? "AI Generating..." : dish.imageStatus}
            </Text>
          </View>
        )}
      </View>
      
      {/* Info */}
      <View style={styles.dishInfo}>
        <Text style={styles.dishName} numberOfLines={1}>{dish.name}</Text>
        {dish.description && (
          <Text style={styles.dishDescription} numberOfLines={1}>
            {dish.description}
          </Text>
        )}
        {dish.price && (
          <Text style={styles.dishPrice}>{dish.price}</Text>
        )}
      </View>
    </Pressable>
  );

  const renderSection = (sectionName: string, sectionDishes: typeof dishes) => (
    <View key={sectionName} style={styles.section}>
      <Text style={styles.sectionTitle}>{sectionName}</Text>
      <View style={styles.dishesGrid}>
        {sectionDishes.map(renderDishCard)}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Image generation progress header */}
      {scan.status === "generating" && (
        <View style={styles.progressHeader}>
          <View style={styles.progressRow}>
            <View style={styles.progressInfo}>
              <ActivityIndicator size="small" color={colors.accent.primary} />
              <Text style={styles.progressText}>Generating images...</Text>
            </View>
            <Pressable 
              style={styles.stopButton}
              onPress={handleStop}
              disabled={isStopping}
            >
              <Ionicons name="stop-circle" size={16} color={colors.accent.error} />
              <Text style={styles.stopButtonText}>
                {isStopping ? "Stopping..." : "Stop"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${scan.progress}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressStats}>
            {scan.imagesGenerated}/{scan.imagesRequested} images
          </Text>
        </View>
      )}
      
      {/* Error banner */}
      {scan.status === "failed" && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.accent.error} />
          <Text style={styles.errorText}>
            {scan.errorMessage || "Processing failed"}
          </Text>
        </View>
      )}
      
      {/* Restaurant header */}
      <View style={styles.restaurantHeader}>
        <View style={styles.restaurantInfo}>
          <Text style={styles.restaurantName}>
            {scan.restaurantName || "Menu Scan"}
          </Text>
          <Text style={styles.dishCount}>{dishes.length} dishes</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
          ]}
          onPress={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.accent.error} />
          ) : (
            <Ionicons name="trash-outline" size={22} color={colors.accent.error} />
          )}
        </Pressable>
      </View>
      
      {/* Dishes list */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Sections */}
        {sections.map((section) => 
          renderSection(section.name, section.items)
        )}
        
        {/* Items without section */}
        {noSection.length > 0 && (
          <View style={styles.section}>
            {sections.length > 0 && (
              <Text style={styles.sectionTitle}>Other Items</Text>
            )}
            <View style={styles.dishesGrid}>
              {noSection.map(renderDishCard)}
            </View>
          </View>
        )}
        
        {/* Cost info */}
        <View style={styles.costInfo}>
          <Text style={styles.costLabel}>Estimated cost</Text>
          <Text style={styles.costValue}>
            ${scan.estimatedCostUsd.toFixed(2)}
          </Text>
          {scan.actualCostUsd > 0 && (
            <>
              <Text style={styles.costLabel}>Actual cost</Text>
              <Text style={styles.costValue}>
                ${scan.actualCostUsd.toFixed(2)}
              </Text>
            </>
          )}
        </View>
        
      </ScrollView>

      {/* Full-screen dish image modal */}
      <Modal
        visible={selectedDish !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedDish(null)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setSelectedDish(null)}
        >
          <View style={styles.modalContent}>
            {selectedDish && (
              <>
                <Image 
                  source={{ uri: selectedDish.imageUrl }} 
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                <View style={styles.modalInfo}>
                  <Text style={styles.modalDishName}>{selectedDish.name}</Text>
                  {selectedDish.description && (
                    <Text style={styles.modalDishDescription}>
                      {selectedDish.description}
                    </Text>
                  )}
                  {selectedDish.price && (
                    <Text style={styles.modalDishPrice}>{selectedDish.price}</Text>
                  )}
                </View>
              </>
            )}
            <Pressable 
              style={styles.modalCloseButton}
              onPress={() => setSelectedDish(null)}
            >
              <Ionicons name="close-circle" size={36} color={colors.text.primary} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    marginTop: spacing.md,
  },
  
  // Processing screen (during extraction)
  processingContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  processingContent: {
    alignItems: "center",
    maxWidth: 300,
  },
  processingIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accent.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  processingSpinner: {
    marginBottom: spacing.lg,
  },
  processingTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: "600",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  processingSubtext: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  processingProgressContainer: {
    width: "100%",
    alignItems: "center",
  },
  processingProgressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: colors.bg.tertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  processingProgressBar: {
    height: "100%",
    backgroundColor: colors.accent.primary,
    borderRadius: 3,
  },
  processingProgressText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
  },
  processingCancelButton: {
    position: "absolute",
    bottom: spacing.xxl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  processingCancelButtonPressed: {
    opacity: 0.7,
  },
  processingCancelText: {
    fontSize: typography.fontSize.md,
    color: colors.text.tertiary,
    fontWeight: "500",
  },
  
  // Progress header
  progressHeader: {
    backgroundColor: colors.bg.secondary,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  progressInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  progressText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: "500",
    flex: 1,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.accent.error + "20",
    borderRadius: borderRadius.sm,
  },
  stopButtonText: {
    color: colors.accent.error,
    fontSize: typography.fontSize.sm,
    fontWeight: "600",
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: colors.bg.tertiary,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: colors.accent.primary,
    borderRadius: 2,
  },
  progressStats: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  
  // Error banner
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent.error + "20",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent.error + "40",
  },
  errorText: {
    color: colors.accent.error,
    fontSize: typography.fontSize.md,
    flex: 1,
  },
  
  // Restaurant header
  restaurantHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  restaurantInfo: {
    flex: 1,
  },
  restaurantName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: "700",
    color: colors.text.primary,
  },
  deleteButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accent.error + "15",
  },
  deleteButtonPressed: {
    opacity: 0.7,
    backgroundColor: colors.accent.error + "25",
  },
  dishCount: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  
  // Section
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: "600",
    color: colors.accent.secondary,
    marginBottom: spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  dishesGrid: {
    gap: spacing.md,
  },
  
  // Dish card
  dishCard: {
    flexDirection: "row",
    backgroundColor: colors.bg.secondary,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.sm,
  },
  dishImageContainer: {
    width: 100,
    height: 100,
    position: "relative",
  },
  dishImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  dishImagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.bg.tertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  tapToGenerateContainer: {
    alignItems: "center",
    gap: 4,
  },
  tapToGenerateText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent.primary,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
  },
  imageStatusBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  imageStatusText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.xs,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "capitalize",
  },
  dishInfo: {
    flex: 1,
    padding: spacing.md,
    justifyContent: "center",
  },
  dishName: {
    fontSize: typography.fontSize.md,
    fontWeight: "600",
    color: colors.text.primary,
  },
  dishDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  dishPrice: {
    fontSize: typography.fontSize.md,
    fontWeight: "700",
    color: colors.accent.secondary,
    marginTop: spacing.xs,
  },
  
  // Cost info
  costInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    marginTop: spacing.lg,
  },
  costLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  costValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  
  // Dish card pressed state
  dishCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  
  // Full-screen modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxl,
  },
  modalImage: {
    width: Dimensions.get("window").width - spacing.lg * 2,
    height: Dimensions.get("window").width - spacing.lg * 2,
    borderRadius: borderRadius.lg,
  },
  modalInfo: {
    marginTop: spacing.xl,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  modalDishName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },
  modalDishDescription: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  modalDishPrice: {
    fontSize: typography.fontSize.xl,
    fontWeight: "700",
    color: colors.accent.secondary,
    marginTop: spacing.md,
  },
  modalCloseButton: {
    position: "absolute",
    top: spacing.xxl + 20,
    right: spacing.lg,
  },
});

