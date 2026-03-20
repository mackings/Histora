export type ContributorInviteRecord = {
  id: string;
  email: string;
  circle: "family" | "friend";
  story: string;
  status: string;
  createdAt: string;
};
