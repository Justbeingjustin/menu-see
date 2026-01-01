/**
 * MenuSee Design System
 * Dark theme with warm food-inspired accents
 */

export const colors = {
  // Background layers
  bg: {
    primary: "#0f0f14",      // Deep dark
    secondary: "#1a1a23",    // Card background
    tertiary: "#252532",     // Elevated elements
    overlay: "rgba(0, 0, 0, 0.7)",
  },
  
  // Accent colors - warm food palette
  accent: {
    primary: "#ff6b35",      // Warm orange (CTA)
    secondary: "#f7c948",    // Golden yellow
    success: "#4ade80",      // Fresh green
    warning: "#fbbf24",      // Amber
    error: "#ef4444",        // Red
  },
  
  // Text
  text: {
    primary: "#f5f5f7",      // Main text
    secondary: "#a1a1aa",    // Muted text
    tertiary: "#71717a",     // Subtle text
    inverse: "#0f0f14",      // Text on light bg
  },
  
  // Borders
  border: {
    subtle: "#2d2d3a",
    default: "#3f3f50",
    strong: "#52525b",
  },
  
  // Status colors
  status: {
    pending: "#71717a",
    processing: "#3b82f6",
    generating: "#f7c948",
    completed: "#4ade80",
    failed: "#ef4444",
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  // Using system fonts that look great
  fontFamily: {
    regular: "System",
    medium: "System",
    bold: "System",
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 22,
    xxl: 28,
    hero: 36,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
};

