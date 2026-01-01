/**
 * Capture Screen - Camera + Image Picker + Upload
 */

import { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Image, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useAction } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/convex/_generated/api";
import { useDevice } from "./_layout";
import { colors, spacing, borderRadius, typography } from "@/lib/theme";

type CaptureState = "camera" | "preview" | "uploading";

export default function CaptureScreen() {
  const router = useRouter();
  const { deviceId } = useDevice();
  const cameraRef = useRef<CameraView>(null);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<CaptureState>("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Convex mutations/actions
  const createScan = useMutation(api.mutations.createMenuScan);
  const generateUploadUrl = useMutation(api.mutations.generateUploadUrl);
  const storeMenuImage = useMutation(api.mutations.storeMenuImage);
  const startProcessing = useAction(api.actions.startProcessingScan);

  // Handle taking a photo
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      
      if (photo?.uri) {
        setCapturedImage(photo.uri);
        setState("preview");
      }
    } catch (error) {
      console.error("Failed to capture:", error);
      Alert.alert("Error", "Failed to capture photo");
    }
  };

  // Handle picking from gallery
  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    
    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      setState("preview");
    }
  };

  // Handle retaking photo
  const handleRetake = () => {
    setCapturedImage(null);
    setState("camera");
  };

  // Handle submitting the image
  const handleSubmit = async () => {
    if (!capturedImage || !deviceId) return;
    
    setIsProcessing(true);
    setState("uploading");
    
    try {
      // 1. Create scan record
      const scanId = await createScan({ deviceId });
      
      // 2. Get upload URL
      const uploadUrl = await generateUploadUrl();
      
      // 3. Upload image to Convex storage
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      });
      
      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }
      
      const { storageId } = await uploadResponse.json();
      
      // 4. Store image reference
      await storeMenuImage({ scanId, storageId });
      
      // 5. Start processing pipeline
      await startProcessing({ scanId });
      
      // 6. Navigate to scan detail
      router.replace(`/scan/${scanId}`);
      
    } catch (error) {
      console.error("Failed to process:", error);
      Alert.alert(
        "Upload Failed", 
        "Failed to upload and process the menu. Please try again."
      );
      setState("preview");
    } finally {
      setIsProcessing(false);
    }
  };

  // Permission not determined yet
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color={colors.text.tertiary} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          MenuSee needs camera access to scan menus. You can also upload photos from your gallery.
        </Text>
        <View style={styles.permissionButtons}>
          <Pressable 
            style={[styles.button, styles.buttonSecondary]}
            onPress={handlePickImage}
          >
            <Ionicons name="images-outline" size={20} color={colors.text.primary} />
            <Text style={styles.buttonSecondaryText}>Choose Photo</Text>
          </Pressable>
          <Pressable 
            style={[styles.button, styles.buttonPrimary]}
            onPress={requestPermission}
          >
            <Ionicons name="camera-outline" size={20} color={colors.text.inverse} />
            <Text style={styles.buttonPrimaryText}>Grant Access</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Preview state
  if (state === "preview" && capturedImage) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedImage }} style={styles.previewImage} />
        
        {/* Overlay */}
        <View style={styles.previewOverlay}>
          <Text style={styles.previewTitle}>Ready to scan?</Text>
          <Text style={styles.previewSubtitle}>
            Make sure the menu is clearly visible
          </Text>
        </View>
        
        {/* Actions */}
        <View style={styles.previewActions}>
          <Pressable 
            style={[styles.button, styles.buttonSecondary, styles.previewButton]}
            onPress={handleRetake}
            disabled={isProcessing}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.text.primary} />
            <Text style={styles.buttonSecondaryText}>Retake</Text>
          </Pressable>
          
          <Pressable 
            style={[styles.button, styles.buttonPrimary, styles.previewButton]}
            onPress={handleSubmit}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator size="small" color={colors.text.inverse} />
                <Text style={styles.buttonPrimaryText}>Processing...</Text>
              </>
            ) : (
              <>
                <Ionicons name="scan-outline" size={20} color={colors.text.inverse} />
                <Text style={styles.buttonPrimaryText}>Scan Menu</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // Uploading state
  if (state === "uploading") {
    return (
      <View style={styles.uploadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.uploadingTitle}>Uploading menu...</Text>
        <Text style={styles.uploadingSubtitle}>
          Our AI will analyze it shortly
        </Text>
      </View>
    );
  }

  // Camera state
  return (
    <View style={styles.container}>
      <CameraView 
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* Framing guide */}
        <View style={styles.frameGuide}>
          <View style={styles.frameCorner} />
          <View style={[styles.frameCorner, styles.frameCornerTR]} />
          <View style={[styles.frameCorner, styles.frameCornerBL]} />
          <View style={[styles.frameCorner, styles.frameCornerBR]} />
        </View>
        
        {/* Instructions */}
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>
            Position the menu within the frame
          </Text>
        </View>
        
        {/* Camera controls */}
        <View style={styles.cameraControls}>
          <Pressable 
            style={styles.galleryButton}
            onPress={handlePickImage}
          >
            <Ionicons name="images-outline" size={28} color={colors.text.primary} />
          </Pressable>
          
          <Pressable 
            style={styles.captureButton}
            onPress={handleCapture}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>
          
          <Pressable 
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={28} color={colors.text.primary} />
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  
  // Camera
  camera: {
    flex: 1,
  },
  frameGuide: {
    flex: 1,
    margin: spacing.xl,
  },
  frameCorner: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: colors.accent.primary,
    borderTopLeftRadius: 8,
  },
  frameCornerTR: {
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 3,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
  },
  frameCornerBL: {
    top: undefined,
    bottom: 0,
    borderTopWidth: 0,
    borderBottomWidth: 3,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 8,
  },
  frameCornerBR: {
    top: undefined,
    bottom: 0,
    left: undefined,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderTopLeftRadius: 0,
    borderBottomRightRadius: 8,
  },
  instructionContainer: {
    position: "absolute",
    top: spacing.xxl,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  instructionText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    backgroundColor: colors.bg.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    overflow: "hidden",
  },
  cameraControls: {
    position: "absolute",
    bottom: spacing.xxl,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xxl,
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.bg.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "transparent",
    borderWidth: 4,
    borderColor: colors.text.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.text.primary,
  },
  closeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.bg.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  
  // Preview
  previewImage: {
    flex: 1,
    resizeMode: "contain",
    backgroundColor: "#000",
  },
  previewOverlay: {
    position: "absolute",
    top: spacing.xxl,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  previewTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewSubtitle: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    marginTop: spacing.xs,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewActions: {
    position: "absolute",
    bottom: spacing.xxl,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    gap: spacing.md,
  },
  previewButton: {
    flex: 1,
  },
  
  // Buttons
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.accent.primary,
  },
  buttonPrimaryText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.md,
    fontWeight: "600",
  },
  buttonSecondary: {
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  buttonSecondaryText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: "600",
  },
  
  // Permission state
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  permissionTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: "600",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  permissionText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  permissionButtons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  
  // Uploading state
  uploadingContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  uploadingTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: "600",
    marginTop: spacing.lg,
  },
  uploadingSubtitle: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    marginTop: spacing.sm,
  },
});

