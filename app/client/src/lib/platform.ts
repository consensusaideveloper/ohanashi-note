/**
 * Platform detection utilities.
 */

/** Minimum touch points to identify a touch-capable iOS device (iPad). */
const MIN_IOS_TOUCH_POINTS = 2;

/**
 * Detect whether the current browser is running on iOS (iPhone, iPad, iPod).
 *
 * Uses a combination of user agent string matching and touch capability
 * detection to handle iPad Safari, which reports as desktop Safari
 * since iPadOS 13+.
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;

  // Standard iOS detection (iPhone, iPod, iPad pre-iPadOS 13)
  if (/iPhone|iPod|iPad/.test(ua)) return true;

  // iPadOS 13+ reports as "Macintosh" in user agent — detect via touch support.
  // Real Macs report maxTouchPoints as 0 or 1 (trackpad).
  if (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === "number") {
    return navigator.maxTouchPoints >= MIN_IOS_TOUCH_POINTS;
  }

  return false;
}
