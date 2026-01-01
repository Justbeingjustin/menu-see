import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * MenuSee Database Schema
 * 
 * Tables:
 * - deviceUsers: Anonymous device tracking (no login v1)
 * - menuScans: Each menu photo scan with processing status
 * - dishes: Individual dishes extracted from scans
 */

export default defineSchema({
  // Anonymous device users (no auth for v1)
  deviceUsers: defineTable({
    deviceId: v.string(), // Stable ID from SecureStore
    createdAt: v.number(),
    lastSeenAt: v.number(),
    scanCount: v.number(),
  }).index("by_deviceId", ["deviceId"]),

  // Menu scan records
  menuScans: defineTable({
    deviceId: v.string(),
    
    // Image storage
    imageStorageId: v.optional(v.id("_storage")), // Convex file storage
    imageUrl: v.optional(v.string()), // Public URL after upload
    
    // Extracted metadata
    restaurantName: v.optional(v.string()),
    
    // Processing status
    status: v.union(
      v.literal("pending"),      // Just created
      v.literal("uploading"),    // Image uploading
      v.literal("processing"),   // Vision AI running
      v.literal("extracting"),   // Creating dishes
      v.literal("generating"),   // Generating images
      v.literal("completed"),    // All done
      v.literal("failed")        // Error occurred
    ),
    statusMessage: v.optional(v.string()),
    
    // Progress tracking
    totalDishes: v.number(),
    dishesExtracted: v.number(),
    imagesGenerated: v.number(),
    imagesRequested: v.number(), // How many images were requested (auto + manual)
    
    // Cost tracking
    estimatedCostUsd: v.number(),
    actualCostUsd: v.number(),
    
    // Timestamps
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    
    // Error tracking
    errorMessage: v.optional(v.string()),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_deviceId_createdAt", ["deviceId", "createdAt"]),

  // Individual dishes from a scan
  dishes: defineTable({
    scanId: v.id("menuScans"),
    
    // From vision extraction
    name: v.string(),
    description: v.optional(v.string()),
    price: v.optional(v.string()),
    sectionName: v.optional(v.string()),
    displayOrder: v.number(),
    
    // Image generation
    imageStatus: v.union(
      v.literal("pending"),     // Not yet queued
      v.literal("queued"),      // In queue for generation
      v.literal("generating"),  // Currently generating
      v.literal("completed"),   // Image ready
      v.literal("failed"),      // Generation failed
      v.literal("skipped")      // Skipped (cost control)
    ),
    imageStorageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    imageProvider: v.optional(v.string()), // "openai" | "nano_banana"
    imageCostUsd: v.optional(v.number()),
    imageError: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.number(),
    imageGeneratedAt: v.optional(v.number()),
  })
    .index("by_scanId", ["scanId"])
    .index("by_scanId_order", ["scanId", "displayOrder"]),
});

// ============================================
// AI I/O Contract Types (for vision parsing)
// ============================================

/**
 * Expected output schema from Vision AI menu parsing
 * This is the contract the LLM must follow
 */
export type VisionMenuOutput = {
  restaurantName?: string;
  sections: MenuSection[];
  itemsFallback?: MenuItem[]; // Items without clear section
};

export type MenuSection = {
  name: string;
  items: MenuItem[];
};

export type MenuItem = {
  name: string;
  description?: string;
  price?: string;
};

// JSON Schema for LLM structured output
export const VISION_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    restaurantName: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                price: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
        required: ["name", "items"],
      },
    },
    itemsFallback: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  required: ["sections"],
} as const;

