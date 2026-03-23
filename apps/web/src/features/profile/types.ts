export type ContributorInviteRecord = {
  id: string;
  email: string;
  circle: "family" | "friend";
  storyId: string;
  story: string;
  status: string;
  createdAt: string;
  deliveryState?: "sent" | "app_only";
};
