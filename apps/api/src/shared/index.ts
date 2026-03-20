import { z } from "zod";

export const visibilitySchema = z.enum(["private", "public", "selected"]);
export const subscriptionTierSchema = z.enum(["free", "premium"]);
export const chapterTypeSchema = z.enum(["memory", "reflection", "milestone", "anonymous"]);

export const momentSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(10).max(1000),
  happenedAt: z.string().datetime(),
  imageUrls: z.array(z.string().url()).max(10).default([]),
  voiceNoteUrl: z.string().url().optional()
});

export const chapterSchema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(80).max(12000),
  type: chapterTypeSchema.default("memory"),
  order: z.number().int().min(1),
  imageUrls: z.array(z.string().url()).max(10).default([]),
  voiceNoteUrl: z.string().url().optional(),
  moments: z.array(momentSchema).max(20).default([])
});

export const storySchema = z.object({
  title: z.string().min(3).max(140),
  summary: z.string().min(40).max(500),
  coverImageUrl: z.string().url().optional(),
  visibility: visibilitySchema.default("private"),
  anonymous: z.boolean().default(false),
  allowedViewerIds: z.array(z.string()).max(100).default([]),
  tags: z.array(z.string().min(2).max(24)).max(8).default([]),
  chapters: z.array(chapterSchema).min(1).max(50)
});

export const storySaveSchema = storySchema.extend({
  status: z.enum(["draft", "published"]).default("draft")
});

export const signUpSchema = z.object({
  fullName: z.string().min(2).max(80),
  username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(10).max(72),
  dateOfBirth: z.string().date().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(72)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email()
});

export const resetPasswordSchema = z.object({
  code: z.string().min(4).max(64),
  password: z.string().min(10).max(72)
});

export const statusVisibilitySchema = z.enum(["public", "followers", "private"]);
export const anonymousDistributionSchema = z.enum(["app", "external"]);
export const commentTargetTypeSchema = z.enum(["status", "storyChapter", "anonymousMessage"]);

export const statusCreateSchema = z.object({
  body: z.string().min(3).max(1500),
  anonymous: z.boolean().default(false),
  visibility: statusVisibilitySchema.default("public"),
  imageUrl: z.string().url().optional()
});

export const statusReactionSchema = z.object({
  action: z.enum(["like", "bookmark"])
});

export const commentCreateSchema = z.object({
  targetType: commentTargetTypeSchema,
  targetId: z.string().min(1).max(120),
  body: z.string().min(1).max(1200),
  replyToCommentId: z.string().min(1).max(120).optional()
});

export const storyReactionSchema = z.object({
  action: z.enum(["like", "bookmark"])
});

export const anonymousMessageCreateSchema = z.object({
  recipientUsername: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
  body: z.string().min(3).max(1500),
  distribution: anonymousDistributionSchema.default("external")
});

export const anonymousDistributionUpdateSchema = z.object({
  distribution: anonymousDistributionSchema
});

export const anonymousHelpUnlockSchema = z.object({
  helperName: z.string().min(2).max(80),
  helperPhone: z.string().min(7).max(32)
});

export const signedUploadSchema = z.object({
  fileName: z.string().min(1).max(240),
  contentType: z
    .string()
    .min(3)
    .max(120)
    .refine(
      (value) =>
        [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "audio/webm",
          "audio/mp4",
          "audio/mpeg",
          "audio/wav",
          "audio/ogg",
          "video/mp4",
          "video/webm"
        ].includes(value),
      "Unsupported file type."
    )
});

export const profileUpdateSchema = z.object({
  fullName: z.string().min(2).max(80),
  username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
  bio: z.string().max(240).default(""),
  location: z.string().max(120).default(""),
  profileVisibility: z.enum(["public", "selected", "private"]).default("public"),
  defaultStoryVisibility: z.enum(["public", "selected", "private", "anonymous"]).default("selected"),
  allowCommentsByDefault: z.boolean().default(true),
  allowHelpRequests: z.boolean().default(true),
  hideReadCounts: z.boolean().default(false),
  showAnonymousActivity: z.boolean().default(true)
});

export const contributorInviteSchema = z.object({
  email: z.string().email(),
  circle: z.enum(["family", "friend"]),
  storyId: z.string().min(1)
});

export type StoryInput = z.infer<typeof storySchema>;
export type StorySaveInput = z.infer<typeof storySaveSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type StatusCreateInput = z.infer<typeof statusCreateSchema>;
export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type StoryReactionInput = z.infer<typeof storyReactionSchema>;
export type AnonymousMessageCreateInput = z.infer<typeof anonymousMessageCreateSchema>;
export type SignedUploadInput = z.infer<typeof signedUploadSchema>;
export type AnonymousHelpUnlockInput = z.infer<typeof anonymousHelpUnlockSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ContributorInviteInput = z.infer<typeof contributorInviteSchema>;
