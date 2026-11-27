/**
 * Audio Capture & MediaDevices Fallback Helper
 * Safely handles WebRTC getUserMedia across Secure and Insecure contexts,
 * legacy browser prefixes, and provides detailed troubleshooting diagnostics.
 */

export interface MediaDevicesStatus {
  isSupported: boolean;
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
  hasEnumerateDevices: boolean;
  origin: string;
  errorMessage?: string;
  recommendation?: string;
}

export function checkMediaDevicesSupport(): MediaDevicesStatus {
  if (typeof window === "undefined") {
    return {
      isSupported: false,
      isSecureContext: false,
      hasGetUserMedia: false,
      hasEnumerateDevices: false,
      origin: "",
      errorMessage: "Running in non-browser environment.",
    };
  }

  const isSecure = typeof window.isSecureContext === "boolean" ? window.isSecureContext : true;
  const origin = window.location.origin;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const hasModernMediaDevices = Boolean(nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === "function");
  const hasLegacyGetUserMedia = Boolean(
    nav &&
      ((nav as any).getUserMedia ||
        (nav as any).webkitGetUserMedia ||
        (nav as any).mozGetUserMedia ||
        (nav as any).msGetUserMedia)
  );
  const hasGetUserMedia = hasModernMediaDevices || hasLegacyGetUserMedia;
  const hasEnumerateDevices = Boolean(nav && nav.mediaDevices && typeof nav.mediaDevices.enumerateDevices === "function");

  let errorMessage: string | undefined;
  let recommendation: string | undefined;

  if (!hasGetUserMedia) {
    if (!isSecure) {
      errorMessage = "Microphone access is disabled by your browser because this page is loaded over an insecure connection (HTTP over a network IP).";
      recommendation = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
        ? `Open http://localhost:${window.location.port || "3000"} directly on the host machine, or enable chrome://flags/#unsafely-treat-insecure-origin-as-secure for ${origin}.`
        : "Please access this application via HTTPS or localhost.";
    } else {
      errorMessage = "MediaDevices audio recording is not supported in this browser.";
      recommendation = "Please try Google Chrome, Microsoft Edge, Firefox, or Safari, or upload an audio recording file.";
    }
  }

  return {
    isSupported: hasGetUserMedia,
    isSecureContext: isSecure,
    hasGetUserMedia,
    hasEnumerateDevices,
    origin,
    errorMessage,
    recommendation,
  };
}

/**
 * Safely requests microphone audio stream without throwing uncaught property errors.
 */
export async function getAudioStream(constraints: MediaStreamConstraints = { audio: true }): Promise<MediaStream> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("Browser window is unavailable for microphone capture.");
  }

  // 1. Standard modern API
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  // 2. Legacy vendor-prefixed getUserMedia
  const nav = navigator as any;
  const legacyGetUserMedia =
    nav.getUserMedia ||
    nav.webkitGetUserMedia ||
    nav.mozGetUserMedia ||
    nav.msGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    });
  }

  // 3. Clear explanation when blocked by insecure context
  if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
    throw new Error(
      `INSECURE_CONTEXT: Browser blocked microphone access on ${window.location.origin}. Browsers require HTTPS or http://localhost for microphone hardware.`
    );
  }

  throw new Error("MEDIA_DEVICES_UNSUPPORTED: MediaDevices API is not supported in this browser.");
}

/**
 * Safely enumerate audio devices if supported, otherwise returns empty list without throwing.
 */
export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  } catch (err) {
    console.warn("Failed to enumerate audio devices:", err);
    return [];
  }
}
