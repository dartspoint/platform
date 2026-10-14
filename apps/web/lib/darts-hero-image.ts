"use client";

export { DEFAULT_HERO_IMAGE, NO_HERO_IMAGE, normalizeHeroImage, safeHeroImageSrc, validateHeroImage } from "../../../packages/contracts/src/hero";
export type { HeroImage } from "../../../packages/contracts/src/hero";
import { ApiError } from "./platform-client";

export async function uploadHeroImage(file: File): Promise<{ assetId: string; src: string; width: number; height: number; mime: string; bytes: number }> {
  const form = new FormData(); form.set("file", file);
  const response = await fetch("/api/platform/media/upload", { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new ApiError(value.error ?? "De afbeelding kan niet worden opgeslagen. Je vorige foto blijft behouden.", value.code ?? "media_upload_failed", response.status);
  return value;
}
