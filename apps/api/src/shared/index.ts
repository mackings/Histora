import { z } from "zod";

const unsafeInlinePattern =
  /javascript:|vbscript:|data:text\/html|srcdoc\s*=|on[a-z]+\s*=|<\s*script|<\s*iframe|<\s*object|<\s*embed|<\s*svg|<\s*math|document\.|window\.|eval\s*\(|Function\s*\(/i;
const allowedRichTextTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "blockquote", "ul", "ol", "li"]);

const plainTextSchema = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/[<>]/.test(value), `${label} cannot contain HTML markup.`)
    .refine((value) => !unsafeInlinePattern.test(value), `${label} contains blocked script-like content.`);

const sanitizeRichTextHtml = (value: string) => {
  const withoutDangerousBlocks = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<\s*(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ""
    );

  return withoutDangerousBlocks
    .replace(/<([^>]+)>/g, (tag, inner: string) => {
      const match = inner.match(/^\s*(\/?)\s*([a-z0-9-]+)\s*([^>]*)$/i);
      if (!match) {
        return "";
      }

      const [, closingSlash, rawTagName, rawAttributes] = match;
      const tagName = rawTagName.toLowerCase();
      if (!allowedRichTextTags.has(tagName)) {
        return "";
      }

      const attributes = rawAttributes.trim().replace(/\/$/, "").trim();
      if (attributes) {
        return "";
      }

      if (closingSlash) {
        return `</${tagName}>`;
      }

      return tagName === "br" ? "<br>" : `<${tagName}>`;
    })
    .replace(/\u00a0/g, " ")
    .trim();
};

const richTextSchema = z
  .string()
  .min(80)
  .max(12000)
  .refine((value) => !unsafeInlinePattern.test(value), "Story body contains blocked script-like content.")
  .transform((value) => sanitizeRichTextHtml(value))
  .refine((value) => value.replace(/<[^>]+>/g, " ").trim().length >= 80, "Story body must contain at least 80 characters.");

export const visibilitySchema = z.enum(["private", "public", "selected"]);
export const subscriptionTierSchema = z.enum(["free", "premium"]);
export const chapterTypeSchema = z.enum(["memory", "reflection", "milestone", "anonymous"]);
export const storyLinkSchema = z.object({
  label: plainTextSchema(2, 80, "Link label"),
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "Use a valid http or https link."),
  kind: z.enum(["website", "social", "drive", "photos"]).default("website")
});
const mediaReferenceSchema = z.string().refine(
  (value) => {
    if (/^users\/[^/]+\/.+/.test(value)) {
      return true;
    }

    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  },
  "Media reference must be an http/https URL or a storage object key."
);

export const momentSchema = z.object({
  title: plainTextSchema(2, 120, "Timeline title"),
  description: plainTextSchema(10, 1000, "Timeline description"),
  happenedAt: z.string().datetime(),
  imageUrls: z.array(mediaReferenceSchema).max(10).default([]),
  voiceNoteUrl: mediaReferenceSchema.optional()
});

export const chapterSchema = z.object({
  title: plainTextSchema(2, 120, "Chapter title"),
  body: richTextSchema,
  type: chapterTypeSchema.default("memory"),
  order: z.number().int().min(1),
  imageUrls: z.array(mediaReferenceSchema).max(10).default([]),
  voiceNoteUrl: mediaReferenceSchema.optional(),
  moments: z.array(momentSchema).max(20).default([])
});

export const storySchema = z.object({
  title: plainTextSchema(3, 140, "Story title"),
  summary: plainTextSchema(40, 500, "Story summary")
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
  fullName: plainTextSchema(2, 80, "Full name"),
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

const statusBodySchema = z
  .string()
  .trim()
  .max(1500)
  .refine((value) => !/[<>]/.test(value), "Status cannot contain HTML markup.")
  .refine((value) => !unsafeInlinePattern.test(value), "Status contains blocked script-like content.");

export const statusCreateSchema = z
  .object({
    body: statusBodySchema.default(""),
    anonymous: z.boolean().default(false),
    visibility: statusVisibilitySchema.default("public"),
    imageUrl: z.string().url().optional(),
    imageKey: z
      .string()
      .trim()
      .regex(/^users\/[^/]+\/.+/, "Status image key must be a valid storage object key.")
      .optional()
  })
  .superRefine((value, context) => {
    if (!value.body && !value.imageUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Write at least 3 characters or attach an image."
      });
      return;
    }

    if (value.body && value.body.length < 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Status text must be at least 3 characters when provided."
      });
    }
  });

export const statusReactionSchema = z.object({
  action: z.enum(["like", "bookmark"])
});

export const commentCreateSchema = z.object({
  targetType: commentTargetTypeSchema,
  targetId: z.string().min(1).max(120),
  body: plainTextSchema(1, 1200, "Comment"),
  shareSlug: z.string().min(1).max(120).optional(),
  replyToCommentId: z.string().min(1).max(120).optional()
});

export const storyReactionSchema = z.object({
  action: z.enum(["like", "bookmark"])
});

export const anonymousMessageCreateSchema = z.object({
  recipientUsername: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
  body: plainTextSchema(3, 1500, "Anonymous message"),
  distribution: anonymousDistributionSchema.default("external")
});

export const anonymousDistributionUpdateSchema = z.object({
  distribution: anonymousDistributionSchema
});

export const anonymousHelpUnlockSchema = z.object({
  helperName: plainTextSchema(2, 80, "Helper name"),
  helperPhone: plainTextSchema(7, 32, "Helper phone")
});

export const anonymousHelpRequestSchema = z.object({
  shareSlug: z.string().min(1).max(120)
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
  fullName: plainTextSchema(2, 80, "Full name"),
  username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
  bio: plainTextSchema(0, 240, "Bio").default(""),
  location: plainTextSchema(0, 120, "Location").default(""),
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
  label: plainTextSchema(2, 80, "Device label")
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
