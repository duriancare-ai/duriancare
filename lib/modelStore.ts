import type * as tfliteType from "@tensorflow/tfjs-tflite";

/**
 * Module-level singleton — survives client-side Next.js navigation.
 * Home page initializes all 3 models here on mount.
 * Assess page reads from here instantly (no re-download, no re-init).
 */
const _models = new Map<string, tfliteType.TFLiteModel>();
const _loading = new Set<string>();

export const modelStore = {
  get: (name: string): tfliteType.TFLiteModel | undefined => _models.get(name),
  set: (name: string, model: tfliteType.TFLiteModel): void => { _models.set(name, model); },
  has: (name: string): boolean => _models.has(name),
  markLoading: (name: string): void => { _loading.add(name); },
  unmarkLoading: (name: string): void => { _loading.delete(name); },
  isLoading: (name: string): boolean => _loading.has(name),
  size: (): number => _models.size,
};
