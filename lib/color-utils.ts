function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  }
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// Creates a soft gradient from a single hex color — lighter at top, darker at bottom.
export function deriveGradient(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `linear-gradient(175deg, ${hex} 0%, ${hex} 100%)`
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const lighterL = Math.min(100, l + 10)
  const darkerL = Math.max(0, l - 10)
  return `linear-gradient(175deg, hsl(${h}, ${s}%, ${lighterL}%) 0%, hsl(${h}, ${s}%, ${darkerL}%) 100%)`
}

// Returns a very subtle rgba tint suitable for a page background.
export function deriveBackgroundTint(hex: string): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.07)`
}
