import type { VisionResult } from "./vision";

export interface AnnotateResult {
  annotatedImageUrl: string;
}

export async function annotateImage(
  screenshotUrl: string,
  visionResult: VisionResult
): Promise<AnnotateResult> {
  throw new Error("Not implemented");
}
