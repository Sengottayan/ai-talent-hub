import { RetellWebClient } from "retell-client-js-sdk";
import { logger } from "./logger";

let retellClient: RetellWebClient | null = null;

/**
 * Get or create Retell AI client instance
 * Singleton pattern to ensure only one client exists
 */
export const getRetellClient = (): RetellWebClient => {
  if (!retellClient) {
    try {
      retellClient = new RetellWebClient();
      logger.log("✅ Retell AI client initialized");
    } catch (error) {
      logger.error("Failed to initialize Retell AI client:", error);
      throw error;
    }
  }

  return retellClient;
};

/**
 * Start a Retell AI call
 * @param accessToken - Access token from backend
 * @param sampleRate - Audio sample rate (default: 24000)
 */
export const startRetellCall = async (
  accessToken: string,
  sampleRate: number = 24000,
): Promise<void> => {
  const client = getRetellClient();

  try {
    await client.startCall({
      accessToken,
      sampleRate,
      captureDeviceId: undefined, // Use default microphone
      emitRawAudioSamples: false,
    });
    logger.log("✅ Retell call started");
  } catch (error) {
    logger.error("Failed to start Retell call:", error);
    throw error;
  }
};

/**
 * Stop the current Retell AI call
 */
export const stopRetellCall = (): void => {
  if (retellClient) {
    try {
      retellClient.stopCall();
      logger.log("✅ Retell call stopped");
    } catch (error) {
      logger.error("Failed to stop Retell call:", error);
    }
  }
};

/**
 * Register event listeners for Retell AI
 */
export const registerRetellListeners = (callbacks: {
  onCallStarted?: () => void;
  onCallEnded?: () => void;
  onError?: (error: any) => void;
  onUpdate?: (update: any) => void;
  onAgentStartTalking?: () => void;
  onAgentStopTalking?: () => void;
}) => {
  const client = getRetellClient();

  if (callbacks.onCallStarted) {
    client.on("call_started", callbacks.onCallStarted);
  }

  if (callbacks.onCallEnded) {
    client.on("call_ended", callbacks.onCallEnded);
  }

  if (callbacks.onError) {
    client.on("error", callbacks.onError);
  }

  if (callbacks.onUpdate) {
    client.on("update", callbacks.onUpdate);
  }

  if (callbacks.onAgentStartTalking) {
    client.on("agent_start_talking", callbacks.onAgentStartTalking);
  }

  if (callbacks.onAgentStopTalking) {
    client.on("agent_stop_talking", callbacks.onAgentStopTalking);
  }
};

/**
 * Remove all event listeners
 */
export const removeRetellListeners = () => {
  if (retellClient) {
    retellClient.removeAllListeners();
  }
};

export default {
  getRetellClient,
  startRetellCall,
  stopRetellCall,
  registerRetellListeners,
  removeRetellListeners,
};
