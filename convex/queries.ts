import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Get or create a device user record
 */
export const getDeviceUser = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("deviceUsers")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .first();
    return user;
  },
});

/**
 * Get all scans for a device, sorted by most recent first
 */
export const getScansForDevice = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const scans = await ctx.db
      .query("menuScans")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .collect();
    return scans;
  },
});

/**
 * Get a single scan by ID with progress info
 */
export const getScan = query({
  args: { scanId: v.id("menuScans") },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) return null;
    
    // Calculate progress percentage
    let progress = 0;
    switch (scan.status) {
      case "pending": progress = 0; break;
      case "uploading": progress = 10; break;
      case "processing": progress = 25; break;
      case "extracting": progress = 50; break;
      case "generating":
        // Progress based on images generated
        const imageProgress = scan.imagesRequested > 0 
          ? (scan.imagesGenerated / scan.imagesRequested) * 40 
          : 0;
        progress = 60 + imageProgress;
        break;
      case "completed": progress = 100; break;
      case "failed": progress = 0; break;
    }
    
    return { ...scan, progress };
  },
});

/**
 * Get all dishes for a scan, sorted by display order
 */
export const getDishesForScan = query({
  args: { scanId: v.id("menuScans") },
  handler: async (ctx, args) => {
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_scanId_order", (q) => q.eq("scanId", args.scanId))
      .collect();
    return dishes;
  },
});

/**
 * Get scan with dishes (combined query for convenience)
 */
export const getScanWithDishes = query({
  args: { scanId: v.id("menuScans") },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) return null;
    
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_scanId_order", (q) => q.eq("scanId", args.scanId))
      .collect();
    
    // Group dishes by section
    const sections: Record<string, typeof dishes> = {};
    const noSection: typeof dishes = [];
    
    for (const dish of dishes) {
      if (dish.sectionName) {
        if (!sections[dish.sectionName]) {
          sections[dish.sectionName] = [];
        }
        sections[dish.sectionName].push(dish);
      } else {
        noSection.push(dish);
      }
    }
    
    // Calculate progress
    let progress = 0;
    switch (scan.status) {
      case "pending": progress = 0; break;
      case "uploading": progress = 10; break;
      case "processing": progress = 25; break;
      case "extracting": progress = 50; break;
      case "generating":
        const imageProgress = scan.imagesRequested > 0 
          ? (scan.imagesGenerated / scan.imagesRequested) * 40 
          : 0;
        progress = 60 + imageProgress;
        break;
      case "completed": progress = 100; break;
      case "failed": progress = 0; break;
    }
    
    return {
      scan: { ...scan, progress },
      dishes,
      sections,
      noSection,
    };
  },
});

/**
 * Get stats for a device (total scans, total dishes, etc.)
 */
export const getDeviceStats = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const scans = await ctx.db
      .query("menuScans")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .collect();
    
    const totalScans = scans.length;
    const completedScans = scans.filter(s => s.status === "completed").length;
    const totalDishes = scans.reduce((acc, s) => acc + s.totalDishes, 0);
    const totalImages = scans.reduce((acc, s) => acc + s.imagesGenerated, 0);
    const totalCost = scans.reduce((acc, s) => acc + s.actualCostUsd, 0);
    
    return {
      totalScans,
      completedScans,
      totalDishes,
      totalImages,
      totalCostUsd: totalCost,
    };
  },
});

