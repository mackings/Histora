const { chromium } = require("playwright");

const webBaseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const apiBaseUrl = process.env.HISTORA_API_URL || "http://127.0.0.1:4000/api";

const stories = [
  {
    title: "The Berlin Conference and the Partition of Africa",
    slug: "the-berlin-conference-and-the-partition-of-africa",
    timelineMarker: "15 November 1884: Conference opens in Berlin"
  },
  {
    title: "How the Bible Was Written and Who Its Authors Were",
    slug: "how-the-bible-was-written-and-who-its-authors-were",
    timelineMarker: "Fourth century CE: Codex Sinaiticus compiled"
  },
  {
    title: "The Slave Trade in the Lands That Became Nigeria",
    slug: "the-slave-trade-in-the-lands-that-became-nigeria",
    timelineMarker: "1807: Britain abolished its slave trade"
  },
  {
    title: "How Nigeria Came Into Being",
    slug: "how-nigeria-came-into-being",
    timelineMarker: "1914: Amalgamation of Northern and Southern Nigeria"
  }
];

async function fetchJson(page, url) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, {
      credentials: "include"
    });
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: text
    };
  }, url);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(webBaseUrl, { waitUntil: "networkidle" });

  const feedResponse = await fetchJson(page, `${apiBaseUrl}/stories/feed`);
  if (!feedResponse.ok) {
    throw new Error(`Feed request failed with ${feedResponse.status}: ${feedResponse.body.slice(0, 500)}`);
  }

  const feed = JSON.parse(feedResponse.body);
  const feedChecks = stories.map((story) => ({
    title: story.title,
    present: Array.isArray(feed) && feed.some((entry) => entry?.slug === story.slug && entry?.title === story.title)
  }));

  const storyChecks = [];
  for (const story of stories) {
    const response = await fetchJson(page, `${apiBaseUrl}/stories/public/${story.slug}`);
    if (!response.ok) {
      throw new Error(`Story request failed for ${story.slug} with ${response.status}: ${response.body.slice(0, 500)}`);
    }

    const payload = JSON.parse(response.body);
    const bodyText = JSON.stringify(payload);
    storyChecks.push({
      slug: story.slug,
      titleVisible: payload?.title === story.title,
      timelineVisible: bodyText.includes(story.timelineMarker),
      chapterCount: Array.isArray(payload?.chapters) ? payload.chapters.length : 0
    });
  }

  console.log(
    JSON.stringify(
      {
        webBaseUrl,
        apiBaseUrl,
        feedChecks,
        storyChecks
      },
      null,
      2
    )
  );

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
