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

export async function enqueueCounterSync(targetType: "status" | "anonymousMessage" | "story", statusId: string) {
  try {
    await syncCounters({
      type:
        targetType === "status"
          ? "statusCounterSync"
          : targetType === "story"
            ? "storyCounterSync"
            : "anonymousMessageCounterSync",
      targetType,
      statusId
    });
  } catch (error) {
    console.error("Failed to sync counters", { targetType, statusId, error });
  }
}

async function syncCounters(job: CounterSyncJob) {
  if (job.targetType === "status") {
    const [likesCount, bookmarksCount, commentsCount] = await Promise.all([
      StatusInteractionModel.countDocuments({ statusId: job.statusId, kind: "like" }),
      StatusInteractionModel.countDocuments({ statusId: job.statusId, kind: "bookmark" }),
      CommentModel.countDocuments({ targetType: "status", targetId: job.statusId })
    ]);

    await StatusModel.findByIdAndUpdate(job.statusId, {
      $set: { likesCount, bookmarksCount, commentsCount }
    });
    return;
  }

  if (job.targetType === "story") {
    const [likesCount, bookmarksCount, commentsCount] = await Promise.all([
      StoryInteractionModel.countDocuments({ storyId: job.statusId, kind: "like" }),
      StoryInteractionModel.countDocuments({ storyId: job.statusId, kind: "bookmark" }),
      CommentModel.countDocuments({
        targetType: "storyChapter",
        targetId: { $regex: `^${job.statusId}:` }
      })
    ]);

    await StoryModel.findByIdAndUpdate(job.statusId, {
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
    targetId: job.statusId
  });

  await AnonymousMessageModel.findByIdAndUpdate(job.statusId, {
    $set: { commentsCount }
  });
}

export function registerQueueWorkers(): { on(event: "error", listener: (error: Error) => void): unknown } | null {
  return null;
}
