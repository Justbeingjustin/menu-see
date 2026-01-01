/**
 * Configuration constants for MenuSee
 * These can be overridden via environment variables in Convex dashboard
 */

// Cost control settings
export const CONFIG = {
  // Number of dish images to auto-generate per scan (0 = on-demand only)
  AUTO_IMAGE_LIMIT: 0,
  
  // Hard maximum images per scan (even with "generate remaining")
  MAX_IMAGES_PER_SCAN: 50,
  
  // Default image provider: "openai" | "nano_banana"
  DEFAULT_IMAGE_PROVIDER: "openai" as const,
  
  // OpenAI image model: "dall-e-2" (cheaper) or "dall-e-3" (better quality)
  OPENAI_IMAGE_MODEL: "dall-e-2" as "dall-e-2" | "dall-e-3",
  
  // Estimated costs per operation (USD)
  COSTS: {
    VISION_PARSE: 0.01,        // GPT-4 Vision per menu
    IMAGE_OPENAI: 0.02,        // DALL-E 2 per image (1024x1024) - half price of DALL-E 3
    IMAGE_NANO_BANANA: 0.02,   // NanoBanana per image (estimated)
  },
  
  // Image generation settings
  IMAGE_SIZE: "1024x1024" as const,
  IMAGE_QUALITY: "standard" as const,
  
  // Prompt template for food image generation
  // {name} and {description} will be replaced
  IMAGE_PROMPT_TEMPLATE: `Professional food photography of "{name}". {description}. 
Appetizing presentation on a clean plate, soft natural lighting, 
shallow depth of field, high-end restaurant style. 
Photorealistic, no text or labels.`,
};

// Image provider type
export type ImageProvider = "openai" | "nano_banana";

// Validate provider
export function isValidProvider(provider: string): provider is ImageProvider {
  return provider === "openai" || provider === "nano_banana";
}

