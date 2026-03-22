import mongoose from "mongoose";

import { connectDatabase } from "../config/db.js";
import { AnonymousMessageModel } from "../models/anonymous-message.model.js";
import { CommentModel } from "../models/comment.model.js";
import { StatusModel } from "../models/status.model.js";
import { StoryModel } from "../models/story.model.js";
import {
  ENCRYPTED_CONTENT_PLACEHOLDER,
  encryptJsonValue,
  encryptSensitiveValue
} from "../services/encryption.service.js";

const applyChanges = process.argv.includes("--commit");

type CounterMap = {
  stories: number;
  statuses: number;
  comments: number;
  anonymousMessages: number;
};

const counters: CounterMap = {
  stories: 0,
  statuses: 0,
  comments: 0,
  anonymousMessages: 0
};

async function backfillStories() {
  const stories = await StoryModel.find({
    $or: [{ contentEncrypted: { $exists: false } }, { contentEncrypted: null }]
  }).lean();

  for (const story of stories) {
    const content = {
      title: story.title,
      summary: story.summary,
      tags: story.tags ?? [],
      links: (story.links ?? []).map((link) => ({
        label: link.label,
        url: link.url,
        kind: link.kind
      })),
      chapters: (story.chapters ?? []).map((chapter) => ({
        title: chapter.title,
        body: chapter.body,
        moments: (chapter.moments ?? []).map((moment) => ({
          title: moment.title,
          description: moment.description
        }))
      }))
    };

    counters.stories += 1;

    if (!applyChanges) {
      continue;
    }

    await StoryModel.updateOne(
      { _id: story._id },
      {
        $set: {
          title: ENCRYPTED_CONTENT_PLACEHOLDER,
          summary: ENCRYPTED_CONTENT_PLACEHOLDER,
          tags: [],
          links: [],
          contentEncrypted: encryptJsonValue(content),
          chapters: (story.chapters ?? []).map((chapter) => ({
            ...chapter,
            title: ENCRYPTED_CONTENT_PLACEHOLDER,
            body: ENCRYPTED_CONTENT_PLACEHOLDER,
            moments: (chapter.moments ?? []).map((moment) => ({
              ...moment,
              title: ENCRYPTED_CONTENT_PLACEHOLDER,
              description: ENCRYPTED_CONTENT_PLACEHOLDER
            }))
          }))
        }
      }
    );
  }
}

async function backfillStatuses() {
  const statuses = await StatusModel.find({
    bodyEncrypted: { $in: [null, ""] },
    body: { $nin: ["", ENCRYPTED_CONTENT_PLACEHOLDER] }
  }).lean();

  for (const status of statuses) {
    counters.statuses += 1;

    if (!applyChanges) {
      continue;
    }

    await StatusModel.updateOne(
      { _id: status._id },
      {
        $set: {
          body: ENCRYPTED_CONTENT_PLACEHOLDER,
          bodyEncrypted: encryptSensitiveValue(status.body)
        }
      }
    );
  }
}

async function backfillComments() {
  const comments = await CommentModel.find({
    bodyEncrypted: { $in: [null, ""] },
    body: { $nin: ["", ENCRYPTED_CONTENT_PLACEHOLDER] }
  }).lean();

  for (const comment of comments) {
    counters.comments += 1;

    if (!applyChanges) {
      continue;
    }

    await CommentModel.updateOne(
      { _id: comment._id },
      {
        $set: {
          body: ENCRYPTED_CONTENT_PLACEHOLDER,
          bodyEncrypted: encryptSensitiveValue(comment.body)
        }
      }
    );
  }
}

async function backfillAnonymousMessages() {
  const messages = await AnonymousMessageModel.find({
    bodyEncrypted: { $in: [null, ""] },
    body: { $nin: ["", ENCRYPTED_CONTENT_PLACEHOLDER] }
  }).lean();

  for (const message of messages) {
    counters.anonymousMessages += 1;

    if (!applyChanges) {
      continue;
    }

    await AnonymousMessageModel.updateOne(
      { _id: message._id },
      {
        $set: {
          body: ENCRYPTED_CONTENT_PLACEHOLDER,
          bodyEncrypted: encryptSensitiveValue(message.body)
        }
      }
    );
  }
}

async function main() {
  await connectDatabase();

  try {
    await backfillStories();
    await backfillStatuses();
    await backfillComments();
    await backfillAnonymousMessages();

    console.log(
      JSON.stringify(
        {
          mode: applyChanges ? "commit" : "dry-run",
          ...counters
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
