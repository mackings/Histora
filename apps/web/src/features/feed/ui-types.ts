import type { ComponentType, ReactNode } from "react";

export type FeedIconName =
  | "home"
  | "feed"
  | "write"
  | "premium"
  | "signin"
  | "spark"
  | "heart"
  | "comment"
  | "bookmark"
  | "share"
  | "close"
  | "download"
  | "trash"
  | "arrow"
  | "bolt"
  | "mic"
  | "check"
  | "person"
  | "image"
  | "pause"
  | "eye"
  | "eyeOff"
  | "bold"
  | "italic"
  | "quote"
  | "checklist"
  | "timeline"
  | "note";

export type FeedIconComponentProps = {
  name: FeedIconName;
  className?: string;
};

export type FeedSectionLabelComponentProps = {
  children: ReactNode;
};

export type FeedIconComponent = ComponentType<FeedIconComponentProps>;
export type FeedSectionLabelComponent = ComponentType<FeedSectionLabelComponentProps>;
