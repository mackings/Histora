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

export type StoryInput = z.infer<typeof storySchema>;
export type ChapterInput = z.infer<typeof chapterSchema>;
export type MomentInput = z.infer<typeof momentSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
