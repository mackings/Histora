import type { StoryInput } from "../shared/index.js";

import { AppError } from "../utils/app-error.js";
import { StoryModel } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";


function enforcePremiumLimits(input: StoryInput, tier: "free" | "premium") {
  const totalWords = input.chapters.reduce<number>(
    (sum, chapter) => sum + chapter.body.split(/\s+/).length,
    0
  );
  const totalImages = input.chapters.reduce<number>((sum, chapter) => sum + chapter.imageUrls.length, 0);
  const hasVoice = input.chapters.some((chapter) => Boolean(chapter.voiceNoteUrl));

  if (tier === "free" && (totalWords > 2500 || totalImages > 6 || hasVoice)) {
    throw new AppError("Premium is required for long-form stories, extra images, or voice notes", 403);
  }
}


export async function createStory(authorId: string, input: StoryInput) {
  const user = await UserModel.findById(authorId).select("subscriptionTier");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  enforcePremiumLimits(input, user.subscriptionTier);

  return StoryModel.create({
    ...input,
    authorId
  });
}

export async function getPublicFeed() {
  return StoryModel.find({ visibility: "public" })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("title summary coverImageUrl anonymous readCount reactionsCount tags createdAt");
}
