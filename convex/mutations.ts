import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { CONFIG } from "./config";

/**
 * Ensure device user exists, create if not
 */
export const ensureDeviceUser = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deviceUsers")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .first();
    
    if (existing) {
      // Update last seen
      await ctx.db.patch(existing._id, { lastSeenAt: Date.now() });
      return existing._id;
    }
    
    // Create new device user
    const id = await ctx.db.insert("deviceUsers", {
      deviceId: args.deviceId,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      scanCount: 0,
    });
    
    return id;
  },
});

/**
 * Create a new menu scan record
 * Returns the scan ID for tracking
 */
export const createMenuScan = mutation({
  args: { 
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    // Ensure device user exists
    const user = await ctx.db
      .query("deviceUsers")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .first();
    
    if (!user) {
      throw new Error("Device user not found. Call ensureDeviceUser first.");
    }
    
    // Create scan record
    const scanId = await ctx.db.insert("menuScans", {
      deviceId: args.deviceId,
      status: "pending",
      totalDishes: 0,
      dishesExtracted: 0,
      imagesGenerated: 0,
      imagesRequested: 0,
      estimatedCostUsd: CONFIG.COSTS.VISION_PARSE, // Vision parsing is always done
      actualCostUsd: 0,
      createdAt: Date.now(),
    });
    
    // Increment user scan count
    await ctx.db.patch(user._id, { 
      scanCount: user.scanCount + 1,
      lastSeenAt: Date.now(),
    });
    
    return scanId;
  },
});

/**
 * Generate upload URL for menu image
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Store the uploaded image reference
 */
export const storeMenuImage = mutation({
  args: {
    scanId: v.id("menuScans"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    
    // Get the public URL
    const imageUrl = await ctx.storage.getUrl(args.storageId);
    
    await ctx.db.patch(args.scanId, {
      imageStorageId: args.storageId,
      imageUrl: imageUrl ?? undefined,
      status: "uploading",
    });
    
    return imageUrl;
  },
});

/**
 * Update scan status (internal use)
 */
export const updateScanStatus = mutation({
  args: {
    scanId: v.id("menuScans"),
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("extracting"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("failed")
    ),
    statusMessage: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { 
      status: args.status,
    };
    
    if (args.statusMessage !== undefined) {
      updates.statusMessage = args.statusMessage;
    }
    if (args.errorMessage !== undefined) {
      updates.errorMessage = args.errorMessage;
    }
    if (args.status === "completed") {
      updates.completedAt = Date.now();
    }
    
    await ctx.db.patch(args.scanId, updates);
  },
});

/**
 * Update scan progress counters
 */
export const updateScanProgress = mutation({
  args: {
    scanId: v.id("menuScans"),
    totalDishes: v.optional(v.number()),
    dishesExtracted: v.optional(v.number()),
    imagesGenerated: v.optional(v.number()),
    imagesRequested: v.optional(v.number()),
    restaurantName: v.optional(v.string()),
    addActualCost: v.optional(v.number()),
    addEstimatedCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    
    const updates: Record<string, unknown> = {};
    
    if (args.totalDishes !== undefined) updates.totalDishes = args.totalDishes;
    if (args.dishesExtracted !== undefined) updates.dishesExtracted = args.dishesExtracted;
    if (args.imagesGenerated !== undefined) updates.imagesGenerated = args.imagesGenerated;
    if (args.imagesRequested !== undefined) updates.imagesRequested = args.imagesRequested;
    if (args.restaurantName !== undefined) updates.restaurantName = args.restaurantName;
    
    if (args.addActualCost) {
      updates.actualCostUsd = scan.actualCostUsd + args.addActualCost;
    }
    if (args.addEstimatedCost) {
      updates.estimatedCostUsd = scan.estimatedCostUsd + args.addEstimatedCost;
    }
    
    await ctx.db.patch(args.scanId, updates);
  },
});

/**
 * Create a dish record
 */
export const createDish = mutation({
  args: {
    scanId: v.id("menuScans"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.optional(v.string()),
    sectionName: v.optional(v.string()),
    displayOrder: v.number(),
    imageStatus: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args) => {
    const dishId = await ctx.db.insert("dishes", {
      scanId: args.scanId,
      name: args.name,
      description: args.description,
      price: args.price,
      sectionName: args.sectionName,
      displayOrder: args.displayOrder,
      imageStatus: args.imageStatus,
      createdAt: Date.now(),
    });
    
    return dishId;
  },
});

/**
 * Update dish image status
 */
export const updateDishImage = mutation({
  args: {
    dishId: v.id("dishes"),
    imageStatus: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    imageStorageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    imageProvider: v.optional(v.string()),
    imageCostUsd: v.optional(v.number()),
    imageError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      imageStatus: args.imageStatus,
    };
    
    if (args.imageStorageId !== undefined) updates.imageStorageId = args.imageStorageId;
    if (args.imageUrl !== undefined) updates.imageUrl = args.imageUrl;
    if (args.imageProvider !== undefined) updates.imageProvider = args.imageProvider;
    if (args.imageCostUsd !== undefined) updates.imageCostUsd = args.imageCostUsd;
    if (args.imageError !== undefined) updates.imageError = args.imageError;
    
    if (args.imageStatus === "completed") {
      updates.imageGeneratedAt = Date.now();
    }
    
    await ctx.db.patch(args.dishId, updates);
  },
});

/**
 * Queue remaining dish images for generation
 * Called when user taps "Generate remaining images"
 */
export const queueRemainingImages = mutation({
  args: {
    scanId: v.id("menuScans"),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    
    // Get dishes without images
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .collect();
    
    const pendingDishes = dishes.filter(d => 
      d.imageStatus === "pending" || d.imageStatus === "skipped"
    );
    
    // Enforce max images per scan
    const alreadyRequested = scan.imagesRequested;
    const remainingSlots = CONFIG.MAX_IMAGES_PER_SCAN - alreadyRequested;
    const toQueue = Math.min(pendingDishes.length, remainingSlots);
    
    if (toQueue === 0) {
      return { queued: 0, message: "Max images per scan reached" };
    }
    
    // Queue dishes for image generation
    let queued = 0;
    for (let i = 0; i < toQueue; i++) {
      await ctx.db.patch(pendingDishes[i]._id, { imageStatus: "queued" });
      queued++;
    }
    
    // Update scan counters
    const newImagesRequested = alreadyRequested + queued;
    const estimatedCost = queued * CONFIG.COSTS.IMAGE_OPENAI;
    
    await ctx.db.patch(args.scanId, {
      imagesRequested: newImagesRequested,
      estimatedCostUsd: scan.estimatedCostUsd + estimatedCost,
      status: "generating",
    });
    
    return { 
      queued, 
      dishIds: pendingDishes.slice(0, toQueue).map(d => d._id),
      message: `Queued ${queued} images for generation` 
    };
  },
});

/**
 * Force complete a stuck scan
 * Marks any pending/queued/generating dishes as skipped and completes the scan
 */
export const forceCompleteScan = mutation({
  args: {
    scanId: v.id("menuScans"),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    
    // Get all dishes for this scan
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .collect();
    
    // Count completed images and mark stuck ones as skipped
    let completedImages = 0;
    for (const dish of dishes) {
      if (dish.imageStatus === "completed") {
        completedImages++;
      } else if (dish.imageStatus === "queued" || dish.imageStatus === "generating") {
        // Mark stuck jobs as skipped
        await ctx.db.patch(dish._id, { imageStatus: "skipped" });
      }
    }
    
    // Update scan to completed
    await ctx.db.patch(args.scanId, {
      status: "completed",
      imagesGenerated: completedImages,
      statusMessage: `Completed with ${completedImages} images`,
      completedAt: Date.now(),
    });
    
    return { completedImages, totalDishes: dishes.length };
  },
});

/**
 * Stop/cancel image generation for a scan
 * Marks queued dishes as skipped and completes the scan
 */
export const stopImageGeneration = mutation({
  args: {
    scanId: v.id("menuScans"),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    
    // Get all dishes for this scan
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .collect();
    
    // Mark queued dishes as skipped (generating ones will finish)
    let skipped = 0;
    let completed = 0;
    for (const dish of dishes) {
      if (dish.imageStatus === "queued") {
        await ctx.db.patch(dish._id, { imageStatus: "skipped" });
        skipped++;
      } else if (dish.imageStatus === "completed") {
        completed++;
      }
    }
    
    // Update scan status
    await ctx.db.patch(args.scanId, {
      status: "completed",
      imagesGenerated: completed,
      statusMessage: `Stopped - ${completed} images completed, ${skipped} skipped`,
      completedAt: Date.now(),
    });
    
    return { completed, skipped };
  },
});

/**
 * Update menu/restaurant name
 */
export const updateMenuName = mutation({
  args: {
    scanId: v.id("menuScans"),
    restaurantName: v.string(),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    
    await ctx.db.patch(args.scanId, {
      restaurantName: args.restaurantName.trim() || undefined,
    });
    
    return { success: true };
  },
});

/**
 * Delete a scan and all associated data
 */
export const deleteScan = mutation({
  args: {
    scanId: v.id("menuScans"),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) throw new Error("Scan not found");
    
    // Get all dishes for this scan
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .collect();
    
    // Delete dish images from storage and dish records
    for (const dish of dishes) {
      if (dish.imageStorageId) {
        await ctx.storage.delete(dish.imageStorageId);
      }
      await ctx.db.delete(dish._id);
    }
    
    // Delete menu image from storage
    if (scan.imageStorageId) {
      await ctx.storage.delete(scan.imageStorageId);
    }
    
    // Delete the scan
    await ctx.db.delete(args.scanId);
    
    // Decrement user scan count
    const user = await ctx.db
      .query("deviceUsers")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", scan.deviceId))
      .first();
    
    if (user && user.scanCount > 0) {
      await ctx.db.patch(user._id, { 
        scanCount: user.scanCount - 1 
      });
    }
    
    return { deleted: true, dishesDeleted: dishes.length };
  },
});

/**
 * Queue a single dish for image generation
 * Called when user taps on a dish to generate its image
 */
export const queueSingleDishImage = mutation({
  args: {
    dishId: v.id("dishes"),
  },
  handler: async (ctx, args) => {
    const dish = await ctx.db.get(args.dishId);
    if (!dish) throw new Error("Dish not found");
    
    // Only queue if not already generating or completed
    if (dish.imageStatus === "completed" || dish.imageStatus === "generating" || dish.imageStatus === "queued") {
      return { queued: false, message: "Image already generated or in progress" };
    }
    
    const scan = await ctx.db.get(dish.scanId);
    if (!scan) throw new Error("Scan not found");
    
    // Check max images limit
    if (scan.imagesRequested >= CONFIG.MAX_IMAGES_PER_SCAN) {
      return { queued: false, message: "Maximum images per scan reached" };
    }
    
    // Queue the dish
    await ctx.db.patch(args.dishId, { imageStatus: "queued" });
    
    // Update scan counters
    await ctx.db.patch(scan._id, {
      imagesRequested: scan.imagesRequested + 1,
      estimatedCostUsd: scan.estimatedCostUsd + CONFIG.COSTS.IMAGE_OPENAI,
      status: scan.status === "completed" ? "generating" : scan.status,
    });
    
    return { queued: true, dishId: args.dishId, scanId: dish.scanId };
  },
});

