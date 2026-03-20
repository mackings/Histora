import {
  contributorInviteSchema,
  deviceRenameSchema,
  pushSubscriptionCreateSchema,
  pushSubscriptionDeleteSchema
} from "../shared/index.js";
import { z } from "zod";

import { profileUpdateSchema } from "../shared/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createContributorInvite,
  getProfileDashboard,
  listContributorInvites,
  listSavedStories,
  listTrustedDevices,
  listUserSessions,
  renameTrustedDevice,
  revokeContributorInvite,
  revokeTrustedDevice,
  revokeUserSession,
  toggleFollowUser,
  updateProfile
} from "../services/profile.service.js";
import {
  getPushPublicKey,
  revokePushSubscription,
  savePushSubscription
} from "../services/push.service.js";

export const profileDashboardController = asyncHandler(async (request, response) => {
  const dashboard = await getProfileDashboard(request.auth!.userId);
  response.status(200).json(dashboard);
});

export const updateProfileController = asyncHandler(async (request, response) => {
  const user = await updateProfile(request.auth!.userId, profileUpdateSchema.parse(request.body));
  response.status(200).json({ user });
});

export const listSessionsController = asyncHandler(async (request, response) => {
  const sessions = await listUserSessions(request.auth!.userId);
  response.status(200).json({ sessions });
});

export const revokeSessionController = asyncHandler(async (request, response) => {
  const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
  const session = await revokeUserSession(request.auth!.userId, params.sessionId);
  response.status(200).json({ session });
});

export const listDevicesController = asyncHandler(async (request, response) => {
  const devices = await listTrustedDevices(request.auth!.userId);
  response.status(200).json({ devices });
});

export const renameDeviceController = asyncHandler(async (request, response) => {
  const params = z.object({ deviceId: z.string().min(1) }).parse(request.params);
  const device = await renameTrustedDevice(
    request.auth!.userId,
    params.deviceId,
    deviceRenameSchema.parse(request.body)
  );
  response.status(200).json({ device });
});

export const revokeDeviceController = asyncHandler(async (request, response) => {
  const params = z.object({ deviceId: z.string().min(1) }).parse(request.params);
  const device = await revokeTrustedDevice(request.auth!.userId, params.deviceId);
  response.status(200).json({ device });
});

export const pushPublicKeyController = asyncHandler(async (_request, response) => {
  response.status(200).json({
    publicKey: getPushPublicKey()
  });
});

export const savePushSubscriptionController = asyncHandler(async (request, response) => {
  const subscription = await savePushSubscription(
    request.auth!.userId,
    pushSubscriptionCreateSchema.parse(request.body),
    { userAgent: request.header("user-agent") ?? undefined }
  );
  response.status(201).json(subscription);
});

export const revokePushSubscriptionController = asyncHandler(async (request, response) => {
  const result = await revokePushSubscription(
    request.auth!.userId,
    pushSubscriptionDeleteSchema.parse(request.body).endpoint
  );
  response.status(200).json(result);
});

export const listInvitesController = asyncHandler(async (request, response) => {
  const invites = await listContributorInvites(request.auth!.userId);
  response.status(200).json({ invites });
});

export const createInviteController = asyncHandler(async (request, response) => {
  const invite = await createContributorInvite(
    request.auth!.userId,
    contributorInviteSchema.parse(request.body)
  );
  response.status(201).json({ invite });
});

export const revokeInviteController = asyncHandler(async (request, response) => {
  const params = z.object({ inviteId: z.string().min(1) }).parse(request.params);
  const invite = await revokeContributorInvite(request.auth!.userId, params.inviteId);
  response.status(200).json({ invite });
});

export const savedStoriesController = asyncHandler(async (request, response) => {
  const stories = await listSavedStories(request.auth!.userId);
  response.status(200).json({ stories });
});

export const toggleFollowController = asyncHandler(async (request, response) => {
  const params = z.object({ username: z.string().min(1) }).parse(request.params);
  const result = await toggleFollowUser(request.auth!.userId, params.username);
  response.status(200).json(result);
});
