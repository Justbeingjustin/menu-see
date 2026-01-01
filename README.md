# MenuSee 📸🍽️

AI-powered menu scanner that transforms restaurant menus into beautiful digital galleries with AI-generated dish images.

## Features

- 📷 **Scan Menus** - Take a photo or upload from gallery
- 🤖 **AI Extraction** - GPT-4 Vision extracts dish names, descriptions, and prices
- 🎨 **AI Images** - DALL-E 3 generates appetizing food photos for each dish
- ⚡ **Realtime Updates** - Watch as dishes and images stream in live
- 💰 **Cost Controls** - Auto-generate first N images, manually trigger the rest
- 📱 **Offline-First** - Anonymous device ID, no login required

## Tech Stack

- **Frontend**: React Native (Expo) + TypeScript
- **Backend**: Convex (realtime database, background jobs)
- **AI**: OpenAI GPT-4 Vision + DALL-E 3 (or NanoBanana)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Convex account (free at [convex.dev](https://convex.dev))
- OpenAI API key

### Installation

1. **Clone and install dependencies**

```bash
cd MenuSee
npm install
```

2. **Set up Convex**

```bash
# Login to Convex (creates free account if needed)
npx convex login

# Initialize Convex project
npx convex dev
```

This will:
- Create a Convex project
- Generate type-safe API client in `convex/_generated/`
- Start the Convex development server

3. **Configure API Keys**

In the [Convex Dashboard](https://dashboard.convex.dev):
- Go to your project > Settings > Environment Variables
- Add the following:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key (required) |
| `NANO_BANANA_API_KEY` | NanoBanana API key (optional, for alt provider) |

4. **Configure Expo**

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

Get your Convex URL from the Convex Dashboard or the output of `npx convex dev`.

5. **Run the app**

```bash
# Start Expo dev server
npm start

# Or run on specific platform
npm run ios
npm run android
```

## Project Structure

```
MenuSee/
├── app/                    # Expo Router screens
│   ├── _layout.tsx        # Root layout + Convex provider
│   ├── index.tsx          # Home screen (scan list)
│   ├── capture.tsx        # Camera/upload screen
│   └── scan/[id].tsx      # Scan detail screen
├── convex/                 # Convex backend
│   ├── schema.ts          # Database schema
│   ├── config.ts          # Configuration constants
│   ├── queries.ts         # Read operations
│   ├── mutations.ts       # Write operations
│   └── actions.ts         # Background jobs (AI calls)
├── lib/                    # Shared utilities
│   ├── convex.ts          # Convex client config
│   ├── deviceId.ts        # Anonymous device ID
│   └── theme.ts           # Design system
└── assets/                 # App icons, splash, etc.
```

## Configuration

### Cost Controls (`convex/config.ts`)

```typescript
export const CONFIG = {
  // Number of images to auto-generate per scan
  AUTO_IMAGE_LIMIT: 10,
  
  // Maximum images even with manual generation
  MAX_IMAGES_PER_SCAN: 50,
  
  // Default image provider
  DEFAULT_IMAGE_PROVIDER: "openai",
  
  // Cost estimates (USD)
  COSTS: {
    VISION_PARSE: 0.01,
    IMAGE_OPENAI: 0.04,
    IMAGE_NANO_BANANA: 0.02,
  },
};
```

### Switching Image Providers

The image generation provider can be swapped at runtime:

```typescript
// Default is "openai", can switch to "nano_banana"
await startProcessing({ 
  scanId, 
  imageProvider: "nano_banana" 
});
```

To use NanoBanana:
1. Add `NANO_BANANA_API_KEY` to Convex environment variables
2. Update the `callNanoBananaAPI` function in `convex/actions.ts` with actual API endpoint

## AI I/O Contracts

### Vision Parsing Output

The GPT-4 Vision API must return JSON matching this schema:

```typescript
type VisionMenuOutput = {
  restaurantName?: string;
  sections: Array<{
    name: string;
    items: Array<{
      name: string;
      description?: string;
      price?: string;
    }>;
  }>;
  itemsFallback?: Array<{
    name: string;
    description?: string;
    price?: string;
  }>;
};
```

### Image Generation Prompt

Images are generated with this template:

```
Professional food photography of "{name}". {description}.
Appetizing presentation on a clean plate, soft natural lighting,
shallow depth of field, high-end restaurant style.
Photorealistic, no text or labels.
```

## Cost Tracking

Every scan tracks costs at multiple levels:

- **Per dish**: `dish.imageCostUsd` - actual cost of generating that image
- **Per scan**: 
  - `scan.estimatedCostUsd` - projected cost before processing
  - `scan.actualCostUsd` - running total of actual costs

View in Convex Dashboard > Data to monitor spending.

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `deviceUsers` | Anonymous device tracking |
| `menuScans` | Menu photo scans with status |
| `dishes` | Individual dishes from scans |

### Status Flow

```
Menu Scan: pending → uploading → processing → extracting → generating → completed
                                                                      ↘ failed

Dish Image: pending → queued → generating → completed
                  ↘ skipped              ↘ failed
```

## Development

### Convex Dev Mode

```bash
# Run Convex in dev mode (watches for changes)
npx convex dev
```

### Expo Dev Mode

```bash
# Start with cache cleared
npx expo start -c
```

### Testing

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint
```

## Troubleshooting

### "OPENAI_API_KEY not configured"

Add the API key in Convex Dashboard > Settings > Environment Variables.

### Images not generating

1. Check Convex Dashboard > Logs for errors
2. Verify OpenAI API key has DALL-E 3 access
3. Check if `AUTO_IMAGE_LIMIT` is reached

### Camera not working

- iOS Simulator doesn't support camera - use image picker
- Check camera permissions in device settings

## License

MIT

