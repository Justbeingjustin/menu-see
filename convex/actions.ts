import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { CONFIG, ImageProvider, isValidProvider } from "./config";
import { VisionMenuOutput, VISION_OUTPUT_SCHEMA } from "./schema";

// Type for dish from query
type Dish = {
  _id: Id<"dishes">;
  name: string;
  description?: string;
  price?: string;
  sectionName?: string;
  imageStatus: string;
};

/**
 * Start processing a menu scan
 * This kicks off the background pipeline
 */
export const startProcessingScan = action({
  args: {
    scanId: v.id("menuScans"),
    imageProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate provider
    const provider: ImageProvider = args.imageProvider && isValidProvider(args.imageProvider)
      ? args.imageProvider
      : CONFIG.DEFAULT_IMAGE_PROVIDER;
    
    // Update status to processing
    await ctx.runMutation(api.mutations.updateScanStatus, {
      scanId: args.scanId,
      status: "processing",
      statusMessage: "Analyzing menu image...",
    });
    
    // Schedule the pipeline action
    await ctx.scheduler.runAfter(0, internal.actions.processScanPipeline, {
      scanId: args.scanId,
      imageProvider: provider,
    });
    
    return { success: true, message: "Processing started" };
  },
});

/**
 * Main processing pipeline (internal action)
 * 1. Call Vision API to extract menu structure
 * 2. Create dish records
 * 3. Queue image generation for first N dishes
 */
export const processScanPipeline = internalAction({
  args: {
    scanId: v.id("menuScans"),
    imageProvider: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get scan with image URL
      const scan = await ctx.runQuery(api.queries.getScan, { scanId: args.scanId });
      if (!scan || !scan.imageUrl) {
        throw new Error("Scan or image not found");
      }
      
      // Update status
      await ctx.runMutation(api.mutations.updateScanStatus, {
        scanId: args.scanId,
        status: "processing",
        statusMessage: "Extracting menu items with AI...",
      });
      
      // Call Vision API
      const menuData = await callVisionAPI(scan.imageUrl);
      
      // Update to extracting status
      await ctx.runMutation(api.mutations.updateScanStatus, {
        scanId: args.scanId,
        status: "extracting",
        statusMessage: "Creating dish records...",
      });
      
      // Count total dishes
      let totalDishes = 0;
      for (const section of menuData.sections) {
        totalDishes += section.items.length;
      }
      if (menuData.itemsFallback) {
        totalDishes += menuData.itemsFallback.length;
      }
      
      // Update progress with restaurant name and total
      await ctx.runMutation(api.mutations.updateScanProgress, {
        scanId: args.scanId,
        restaurantName: menuData.restaurantName,
        totalDishes,
        addActualCost: CONFIG.COSTS.VISION_PARSE,
      });
      
      // Create dish records
      let displayOrder = 0;
      const dishIds: Id<"dishes">[] = [];
      
      // Process sections
      for (const section of menuData.sections) {
        for (const item of section.items) {
          const shouldAutoGenerate = displayOrder < CONFIG.AUTO_IMAGE_LIMIT;
          
          const dishId = await ctx.runMutation(api.mutations.createDish, {
            scanId: args.scanId,
            name: item.name,
            description: item.description,
            price: item.price,
            sectionName: section.name,
            displayOrder,
            imageStatus: shouldAutoGenerate ? "queued" : "pending",
          });
          
          if (shouldAutoGenerate) {
            dishIds.push(dishId);
          }
          displayOrder++;
        }
      }
      
      // Process fallback items (no section)
      if (menuData.itemsFallback) {
        for (const item of menuData.itemsFallback) {
          const shouldAutoGenerate = displayOrder < CONFIG.AUTO_IMAGE_LIMIT;
          
          const dishId = await ctx.runMutation(api.mutations.createDish, {
            scanId: args.scanId,
            name: item.name,
            description: item.description,
            price: item.price,
            displayOrder,
            imageStatus: shouldAutoGenerate ? "queued" : "pending",
          });
          
          if (shouldAutoGenerate) {
            dishIds.push(dishId);
          }
          displayOrder++;
        }
      }
      
      // Update progress
      const imagesRequested = Math.min(totalDishes, CONFIG.AUTO_IMAGE_LIMIT);
      const estimatedImageCost = imagesRequested * 
        (args.imageProvider === "openai" ? CONFIG.COSTS.IMAGE_OPENAI : CONFIG.COSTS.IMAGE_NANO_BANANA);
      
      await ctx.runMutation(api.mutations.updateScanProgress, {
        scanId: args.scanId,
        dishesExtracted: totalDishes,
        imagesRequested,
        addEstimatedCost: estimatedImageCost,
      });
      
      // Update to generating status
      await ctx.runMutation(api.mutations.updateScanStatus, {
        scanId: args.scanId,
        status: "generating",
        statusMessage: `Generating images for ${imagesRequested} dishes...`,
      });
      
      // Schedule image generation for queued dishes
      for (const dishId of dishIds) {
        await ctx.scheduler.runAfter(0, internal.actions.generateDishImage, {
          dishId,
          scanId: args.scanId,
          provider: args.imageProvider as ImageProvider,
        });
      }
      
      // If no images to generate, mark as completed
      if (dishIds.length === 0) {
        await ctx.runMutation(api.mutations.updateScanStatus, {
          scanId: args.scanId,
          status: "completed",
          statusMessage: "Menu processed successfully!",
        });
      }
      
    } catch (error) {
      console.error("Pipeline error:", error);
      await ctx.runMutation(api.mutations.updateScanStatus, {
        scanId: args.scanId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

/**
 * Generate image for a single dish (internal action)
 */
export const generateDishImage = internalAction({
  args: {
    dishId: v.id("dishes"),
    scanId: v.id("menuScans"),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get dish details
      const dishes = await ctx.runQuery(api.queries.getDishesForScan, { scanId: args.scanId });
      const dish = dishes.find((d: Dish) => d._id === args.dishId);
      if (!dish) {
        throw new Error("Dish not found");
      }
      
      // Update status to generating
      await ctx.runMutation(api.mutations.updateDishImage, {
        dishId: args.dishId,
        imageStatus: "generating",
      });
      
      // Generate prompt
      const prompt = CONFIG.IMAGE_PROMPT_TEMPLATE
        .replace("{name}", dish.name)
        .replace("{description}", dish.description || "Delicious dish");
      
      // Call image generation API
      const provider = args.provider as ImageProvider;
      const result = await callImageAPI(prompt, provider);
      
      // Store image in Convex storage
      const response = await fetch(result.imageUrl);
      const imageBlob = await response.blob();
      
      // Upload to Convex storage
      const storageId = await ctx.storage.store(imageBlob);
      const storedUrl = await ctx.storage.getUrl(storageId);
      
      // Update dish with image
      await ctx.runMutation(api.mutations.updateDishImage, {
        dishId: args.dishId,
        imageStatus: "completed",
        imageStorageId: storageId,
        imageUrl: storedUrl!,
        imageProvider: provider,
        imageCostUsd: result.cost,
      });
      
      // Update scan progress
      const scan = await ctx.runQuery(api.queries.getScan, { scanId: args.scanId });
      if (scan) {
        const newImagesGenerated = scan.imagesGenerated + 1;
        
        await ctx.runMutation(api.mutations.updateScanProgress, {
          scanId: args.scanId,
          imagesGenerated: newImagesGenerated,
          addActualCost: result.cost,
        });
        
        // Check if all requested images are done
        if (newImagesGenerated >= scan.imagesRequested) {
          await ctx.runMutation(api.mutations.updateScanStatus, {
            scanId: args.scanId,
            status: "completed",
            statusMessage: "All images generated!",
          });
        }
      }
      
    } catch (error) {
      console.error("Image generation error:", error);
      
      await ctx.runMutation(api.mutations.updateDishImage, {
        dishId: args.dishId,
        imageStatus: "failed",
        imageError: error instanceof Error ? error.message : "Unknown error",
      });
      
      // Still update scan progress (count failed as "done" for progress)
      const scan = await ctx.runQuery(api.queries.getScan, { scanId: args.scanId });
      if (scan) {
        const newImagesGenerated = scan.imagesGenerated + 1;
        
        await ctx.runMutation(api.mutations.updateScanProgress, {
          scanId: args.scanId,
          imagesGenerated: newImagesGenerated,
        });
        
        if (newImagesGenerated >= scan.imagesRequested) {
          await ctx.runMutation(api.mutations.updateScanStatus, {
            scanId: args.scanId,
            status: "completed",
            statusMessage: "Processing complete (some images failed)",
          });
        }
      }
    }
  },
});

// Result type for queueRemainingImages mutation
type QueueResult = {
  queued: number;
  message: string;
  dishIds?: Id<"dishes">[];
};

/**
 * Generate remaining images (user-triggered)
 */
export const generateRemainingImages = action({
  args: {
    scanId: v.id("menuScans"),
    imageProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const provider: ImageProvider = args.imageProvider && isValidProvider(args.imageProvider)
      ? args.imageProvider
      : CONFIG.DEFAULT_IMAGE_PROVIDER;
    
    // Queue the dishes - explicit type cast
    const queueResult: QueueResult = await ctx.runMutation(
      api.mutations.queueRemainingImages,
      { scanId: args.scanId }
    );
    
    if (queueResult.queued === 0 || !queueResult.dishIds) {
      return { queued: queueResult.queued, message: queueResult.message, dishIds: [] as Id<"dishes">[] };
    }
    
    // Schedule generation for each queued dish
    for (const dishId of queueResult.dishIds) {
      await ctx.scheduler.runAfter(0, internal.actions.generateDishImage, {
        dishId,
        scanId: args.scanId,
        provider,
      });
    }
    
    return { queued: queueResult.queued, message: queueResult.message, dishIds: queueResult.dishIds };
  },
});

/**
 * Generate image for a single dish (user-triggered on tap)
 */
export const generateSingleDishImage = action({
  args: {
    dishId: v.id("dishes"),
    imageProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const provider: ImageProvider = args.imageProvider && isValidProvider(args.imageProvider)
      ? args.imageProvider
      : CONFIG.DEFAULT_IMAGE_PROVIDER;
    
    // Queue the dish
    const result = await ctx.runMutation(api.mutations.queueSingleDishImage, {
      dishId: args.dishId,
    }) as { queued: boolean; message?: string; dishId?: Id<"dishes">; scanId?: Id<"menuScans"> };
    
    if (!result.queued || !result.scanId) {
      return { success: false, message: result.message || "Could not queue image" };
    }
    
    // Schedule the image generation
    await ctx.scheduler.runAfter(0, internal.actions.generateDishImage, {
      dishId: args.dishId,
      scanId: result.scanId,
      provider,
    });
    
    return { success: true, message: "Image generation started" };
  },
});

// ============================================
// External API Helpers
// ============================================

/**
 * Call Vision API to extract menu structure
 * Uses OpenAI GPT-4 Vision by default
 */
async function callVisionAPI(imageUrl: string): Promise<VisionMenuOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  const systemPrompt = `You are a menu parser. Extract all menu items from the image into structured JSON.
Return ONLY valid JSON matching this schema:
${JSON.stringify(VISION_OUTPUT_SCHEMA, null, 2)}

Rules:
- Extract restaurant name if visible
- Group items by section/category if present
- Include price if visible (as string, e.g. "$12.99")
- Include description if visible
- If no clear sections, use a single section named "Menu" or put items in itemsFallback
- Be thorough - extract ALL visible menu items`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all menu items from this menu image:" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vision API error: ${error}`);
  }
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error("No content in Vision API response");
  }
  
  const parsed = JSON.parse(content) as VisionMenuOutput;
  
  // Validate basic structure
  if (!parsed.sections) {
    parsed.sections = [];
  }
  
  return parsed;
}

/**
 * Call Image Generation API
 * Supports OpenAI DALL-E and NanoBanana
 */
async function callImageAPI(
  prompt: string, 
  provider: ImageProvider
): Promise<{ imageUrl: string; cost: number }> {
  
  if (provider === "openai") {
    return callOpenAIImageAPI(prompt);
  } else if (provider === "nano_banana") {
    return callNanoBananaAPI(prompt);
  }
  
  throw new Error(`Unknown image provider: ${provider}`);
}

/**
 * OpenAI DALL-E 3 image generation
 */
async function callOpenAIImageAPI(prompt: string): Promise<{ imageUrl: string; cost: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  // DALL-E 2 doesn't support quality parameter
  const body: Record<string, unknown> = {
    model: CONFIG.OPENAI_IMAGE_MODEL,
    prompt: prompt,
    n: 1,
    size: CONFIG.IMAGE_SIZE,
  };
  
  // Only DALL-E 3 supports quality parameter
  if (CONFIG.OPENAI_IMAGE_MODEL === "dall-e-3") {
    body.quality = CONFIG.IMAGE_QUALITY;
  }
  
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Image API error: ${error}`);
  }
  
  const data = await response.json();
  const imageUrl = data.data[0]?.url;
  
  if (!imageUrl) {
    throw new Error("No image URL in OpenAI response");
  }
  
  return {
    imageUrl,
    cost: CONFIG.COSTS.IMAGE_OPENAI,
  };
}

/**
 * NanoBanana image generation (placeholder - implement based on their API)
 */
async function callNanoBananaAPI(prompt: string): Promise<{ imageUrl: string; cost: number }> {
  const apiKey = process.env.NANO_BANANA_API_KEY;
  if (!apiKey) {
    throw new Error("NANO_BANANA_API_KEY not configured");
  }
  
  // TODO: Implement actual NanoBanana API call
  // This is a placeholder - replace with actual API endpoint and format
  const response = await fetch("https://api.nanobanana.com/v1/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: prompt,
      width: 1024,
      height: 1024,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`NanoBanana API error: ${error}`);
  }
  
  const data = await response.json();
  const imageUrl = data.image_url || data.url || data.output;
  
  if (!imageUrl) {
    throw new Error("No image URL in NanoBanana response");
  }
  
  return {
    imageUrl,
    cost: CONFIG.COSTS.IMAGE_NANO_BANANA,
  };
}

