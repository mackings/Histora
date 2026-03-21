import { z } from "zod";

export const visibilitySchema = z.enum(["private", "public", "selected"]);
export const subscriptionTierSchema = z.enum(["free", "premium"]);
export const chapterTypeSchema = z.enum(["memory", "reflection", "milestone", "anonymous"]);
export const storyLinkSchema = z.object({
  label: z.string().trim().min(2).max(80),
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "Use a valid http or https link."),
  kind: z.enum(["website", "social", "drive", "photos"]).default("website")
});
const mediaReferenceSchema = z.string().refine(
  (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return /^users\/[^/]+\/.+/.test(value);
    }
  },
  "Media reference must be a valid URL or storage object key."
);

export const momentSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(10).max(1000),
  happenedAt: z.string().datetime(),
  imageUrls: z.array(mediaReferenceSchema).max(10).default([]),
  voiceNoteUrl: mediaReferenceSchema.optional()
});

export const chapterSchema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(80).max(12000),
  type: chapterTypeSchema.default("memory"),
  order: z.number().int().min(1),
  imageUrls: z.array(mediaReferenceSchema).max(10).default([]),
  voiceNoteUrl: mediaReferenceSchema.optional(),
  moments: z.array(momentSchema).max(20).default([])
});

export const storySchema = z.object({
  title: z.string().min(3).max(140),
  summary: z
    .string()
    .trim()
    .refine(
      (value) => value.split(/\s+/).filter(Boolean).length >= 20,
      "Write a fuller story summary with at least 20 words."
    ),
  coverImageUrl: mediaReferenceSchema.optional(),
  visibility: visibilitySchema.default("private"),
  anonymous: z.boolean().default(false),
  allowedViewerIds: z.array(z.string()).max(100).default([]),
  tags: z.array(z.string().min(2).max(24)).max(8).default([]),
  links: z.array(storyLinkSchema).max(10).default([]),
  chapters: z.array(chapterSchema).min(1).max(50)
});

export const storySaveSchema = storySchema.extend({
  status: z.enum(["draft", "published"]).default("draft")
});

const disposableEmailDomains = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "sharklasers.com",
  "dispostable.com",
  "trashmail.com",
  "getnada.com"
]);

const allowedEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase())
  .refine((value) => {
    const [, domain = ""] = value.split("@");
    return domain === "gmail.com" || domain.endsWith(".com");
  }, "Use a valid gmail.com or .com email address.")
  .refine((value) => {
    const [, domain = ""] = value.split("@");
    return !disposableEmailDomains.has(domain);
  }, "Temporary email addresses are not allowed.");

export const signUpSchema = z.object({
  fullName: z.string().min(2).max(80),
  username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
  email: allowedEmailSchema,
  password: z.string().min(10).max(72),
  dateOfBirth: z.string().date().optional()
});

export const loginSchema = z.object({
  email: allowedEmailSchema,
  password: z.string().min(10).max(72),
  deviceId: z.string().trim().min(16).max(160),
  deviceName: z.string().trim().min(2).max(80)
});

export const forgotPasswordSchema = z.object({
  email: allowedEmailSchema
});

export const resetPasswordSchema = z.object({
  code: z.string().min(4).max(64),
  password: z.string().min(10).max(72)
});

export const emailVerificationRequestSchema = z.object({
  email: allowedEmailSchema
});

export const verifyEmailSchema = z.object({
  email: allowedEmailSchema,
  otp: z.string().trim().regex(/^\d{5}$/)
});

export const verifyDeviceSchema = z.object({
  challengeId: z.string().min(1),
  email: allowedEmailSchema,
  otp: z.string().trim().regex(/^\d{5}$/),
  deviceId: z.string().trim().min(16).max(160),
  deviceName: z.string().trim().min(2).max(80)
});

export const resendDeviceVerificationSchema = z.object({
  email: allowedEmailSchema,
  deviceId: z.string().trim().min(16).max(160),
  deviceName: z.string().trim().min(2).max(80)
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

export const pushSubscriptionCreateSchema = z.object({
  deviceId: z.string().trim().min(16).max(160),
  deviceName: z.string().trim().min(2).max(80),
  subscription: pushSubscriptionSchema
});

export const pushSubscriptionDeleteSchema = z.object({
  endpoint: z.string().url()
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
    .transform((value) => value.split(";")[0]?.trim().toLowerCase() ?? value)
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
  avatarUrl: mediaReferenceSchema.nullish(),
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

export const verificationRequestSchema = z.object({});

export const deviceRenameSchema = z.object({
  label: z.string().trim().min(2).max(80)
});

export type StoryInput = z.infer<typeof storySchema>;
export type StorySaveInput = z.infer<typeof storySaveSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type EmailVerificationRequestInput = z.infer<typeof emailVerificationRequestSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type VerifyDeviceInput = z.infer<typeof verifyDeviceSchema>;
export type ResendDeviceVerificationInput = z.infer<typeof resendDeviceVerificationSchema>;
export type PushSubscriptionCreateInput = z.infer<typeof pushSubscriptionCreateSchema>;
export type PushSubscriptionDeleteInput = z.infer<typeof pushSubscriptionDeleteSchema>;
export type StatusCreateInput = z.infer<typeof statusCreateSchema>;
export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type StoryReactionInput = z.infer<typeof storyReactionSchema>;
export type AnonymousMessageCreateInput = z.infer<typeof anonymousMessageCreateSchema>;
export type SignedUploadInput = z.infer<typeof signedUploadSchema>;
export type AnonymousHelpUnlockInput = z.infer<typeof anonymousHelpUnlockSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ContributorInviteInput = z.infer<typeof contributorInviteSchema>;
export type DeviceRenameInput = z.infer<typeof deviceRenameSchema>;
export type VerificationRequestInput = z.infer<typeof verificationRequestSchema>;
