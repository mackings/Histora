import { Queue, Worker } from "bullmq";

import { env } from "../config/env.js";
import { AnonymousMessageModel } from "../models/anonymous-message.model.js";
import { CommentModel } from "../models/comment.model.js";
import { StatusInteractionModel } from "../models/status-interaction.model.js";
import { StatusModel } from "../models/status.model.js";
import { StoryInteractionModel } from "../models/story-interaction.model.js";
import { StoryModel } from "../models/story.model.js";

type CounterSyncJob = {
  type: "statusCounterSync" | "anonymousMessageCounterSync" | "storyCounterSync";
  targetType: "status" | "anonymousMessage" | "story";
  statusId: string;
};

let appQueue: Queue<CounterSyncJob> | null = null;

export function getAppQueue() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!appQueue) {
    appQueue = new Queue<CounterSyncJob>("histora-jobs", {
      connection: { url: env.REDIS_URL }
    });
  }

  return appQueue;
}

export async function enqueueCounterSync(targetType: "status" | "anonymousMessage" | "story", statusId: string) {
  const queue = getAppQueue();
  if (!queue) {
    return;
  }

  await queue.add(
    `${targetType}-counter-sync`,
    {
      type:
        targetType === "status"
          ? "statusCounterSync"
          : targetType === "story"
            ? "storyCounterSync"
            : "anonymousMessageCounterSync",
      targetType,
      statusId
    },
    {
      jobId: `${targetType}:${statusId}`,
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );
}

export function registerQueueWorkers() {
  if (!env.REDIS_URL) {
    return null;
  }

  // The worker is intentionally light for now: it gives us a durable place for
  // background jobs without blocking the request path, even before heavy jobs land.
  return new Worker<CounterSyncJob>(
    "histora-jobs",
    async (job) => {
      if (job.data.targetType === "status") {
        const [likesCount, bookmarksCount, commentsCount] = await Promise.all([
          StatusInteractionModel.countDocuments({ statusId: job.data.statusId, kind: "like" }),
          StatusInteractionModel.countDocuments({ statusId: job.data.statusId, kind: "bookmark" }),
          CommentModel.countDocuments({ targetType: "status", targetId: job.data.statusId })
        ]);

        await StatusModel.findByIdAndUpdate(job.data.statusId, {
          $set: { likesCount, bookmarksCount, commentsCount }
        });
        return;
      }

      if (job.data.targetType === "story") {
        const [likesCount, bookmarksCount, commentsCount] = await Promise.all([
          StoryInteractionModel.countDocuments({ storyId: job.data.statusId, kind: "like" }),
          StoryInteractionModel.countDocuments({ storyId: job.data.statusId, kind: "bookmark" }),
          CommentModel.countDocuments({
            targetType: "storyChapter",
            targetId: { $regex: `^${job.data.statusId}:` }
          })
        ]);

        await StoryModel.findByIdAndUpdate(job.data.statusId, {
          $set: {
            likesCount,
            bookmarksCount,
            commentsCount,
            reactionsCount: likesCount + bookmarksCount
          }
        });
        return;
      }

      const commentsCount = await CommentModel.countDocuments({
        targetType: "anonymousMessage",
        targetId: job.data.statusId
      });

      await AnonymousMessageModel.findByIdAndUpdate(job.data.statusId, {
        $set: { commentsCount }
      });
    },
    { connection: { url: env.REDIS_URL } }
  );
}
