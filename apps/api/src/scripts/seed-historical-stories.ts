import bcrypt from "bcryptjs";

import { connectDatabase } from "../config/db.js";
import { CommentModel } from "../models/comment.model.js";
import { StoryInteractionModel } from "../models/story-interaction.model.js";
import { StoryModel } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";
import { buildStoredStoryContent } from "../services/story-content.service.js";

type StorySeed = {
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string;
  tags: string[];
  links: Array<{
    label: string;
    url: string;
    kind: "website" | "social" | "drive" | "photos";
  }>;
  chapters: Array<{
    title: string;
    type: "memory" | "reflection" | "milestone" | "anonymous";
    body: string;
    imageUrls: string[];
    moments: Array<{
      title: string;
      description: string;
      happenedAt: string;
      imageUrls: string[];
    }>;
  }>;
};

function commonsImage(fileName: string) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

function htmlParagraphs(paragraphs: string[]) {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

const image = {
  berlinConference: commonsImage("Kongokonferenz.jpg"),
  scrambleMap: commonsImage("Scramble-for-Africa-1880-1913-v2.png"),
  rhodesCartoon: commonsImage("The Rhodes Colossus.png"),
  isaiahScroll: commonsImage("Great Isaiah Scroll.jpg"),
  gutenbergBible: commonsImage("Gutenberg Bible B42 Genesis cropped.jpg"),
  biafraChart: commonsImage("A chart of ye. coast of Biaffra - btv1b53168614k.jpg"),
  slaveCoastMap: commonsImage("Map of the Gulf of Guinea and the Slave Coast, 1849.jpg"),
  lugardPortrait: commonsImage("Frederick Lugard, 1st Baron Lugard.jpg"),
  northernNigeriaMap: commonsImage("Map of Northern Nigeria (1911).png"),
  nigeriaRoadMap: commonsImage("Road map of the colony and protectorate of Nigeria LOC 98681087.jpg")
};

const stories: StorySeed[] = [
  {
    slug: "the-berlin-conference-and-the-partition-of-africa",
    title: "The Berlin Conference and the Partition of Africa",
    summary:
      "This story explains why the Berlin Conference of 1884 to 1885 mattered, what the European powers agreed, why no African state was represented at the table, and how its rules accelerated the partition of Africa with lasting political and human consequences.",
    coverImageUrl: image.berlinConference,
    tags: ["africa", "colonialism", "history", "berlin conference"],
    links: [
      {
        label: "Britannica: Berlin West Africa Conference",
        url: "https://www.britannica.com/event/Berlin-West-Africa-Conference",
        kind: "website"
      },
      {
        label: "Wikimedia Commons: Kongokonferenz",
        url: "https://commons.wikimedia.org/wiki/File:Kongokonferenz.jpg",
        kind: "photos"
      },
      {
        label: "Wikimedia Commons: Scramble for Africa map",
        url: "https://commons.wikimedia.org/wiki/File:Scramble-for-Africa-1880-1913-v2.png",
        kind: "photos"
      }
    ],
    chapters: [
      {
        title: "Why Europe Met in Berlin",
        type: "memory",
        body: htmlParagraphs([
          "By the early 1880s, European governments were competing more aggressively for commercial routes, naval stations, raw materials, and political influence in Africa. Chancellor Otto von Bismarck of Germany called the Berlin Conference in late 1884 to reduce the risk of European conflict while regularizing imperial expansion.",
          "The meeting was not an African diplomatic summit. It was a European and American conference about African territory. Fourteen participating powers attended, including Germany, Britain, France, Portugal, Belgium, and the United States, but no African kingdom or community had a seat at the table.",
          "King Leopold II of Belgium had already been building influence in the Congo basin through a network of associations presented as humanitarian and scientific. One of the conference's major effects was to legitimize Leopold's position there, opening the path to the Congo Free State, a regime later associated with forced labor, mass violence, and demographic catastrophe.",
          "The conference did not draw every final colonial border on the spot, but it created rules that pushed the scramble forward. Its most important principle was effective occupation: a power could not merely claim a coast on paper. It had to demonstrate some real administrative presence if it wanted other powers to respect the claim."
        ]),
        imageUrls: [image.berlinConference],
        moments: [
          {
            title: "15 November 1884: Conference opens in Berlin",
            description:
              "Representatives of fourteen powers met in Berlin under Bismarck to negotiate trade, navigation, and territorial claims in Central and West Africa.",
            happenedAt: "1884-11-15T00:00:00.000Z",
            imageUrls: [image.berlinConference]
          },
          {
            title: "Congo and Niger questions moved to the center",
            description:
              "Delegates focused on free trade in the Congo basin and freedom of navigation on the Congo and Niger rivers, both of which mattered for imperial commerce and strategic access.",
            happenedAt: "1884-12-01T00:00:00.000Z",
            imageUrls: [image.scrambleMap]
          }
        ]
      },
      {
        title: "What the Conference Changed",
        type: "reflection",
        body: htmlParagraphs([
          "The General Act signed in February 1885 did several things at once. It affirmed free trade in a large zone of Central Africa, recognized freedom of navigation on the Congo and Niger rivers, and encouraged European powers to notify each other when they took new possessions on the African coast.",
          "Those clauses sounded technical, but they had enormous consequences. European governments translated diplomatic language into military expeditions, treaties signed under pressure, chartered company rule, and eventually formal colonial administration. The pace of conquest increased sharply after Berlin.",
          "African societies were not passive in this process. Many rulers negotiated, resisted, fought, or tried to play one imperial power against another. Yet the overall balance of force shifted against them as industrial weaponry, steam transport, and financial backing made European expansion harder to resist.",
          "The borders that emerged from the scramble often ignored older political systems, trade networks, and linguistic communities. That is one reason the Berlin Conference still matters. It helps explain why later African states inherited frontiers shaped less by local consent than by imperial competition."
        ]),
        imageUrls: [image.scrambleMap, image.rhodesCartoon],
        moments: [
          {
            title: "26 February 1885: General Act signed",
            description:
              "The conference closed with the General Act, formalizing free navigation, trade principles, and the rule of effective occupation.",
            happenedAt: "1885-02-26T00:00:00.000Z",
            imageUrls: [image.scrambleMap]
          },
          {
            title: "After 1885: Partition accelerated",
            description:
              "Within a generation, most of Africa had been divided among European empires, with only a few exceptions such as Ethiopia and Liberia remaining outside direct colonial rule.",
            happenedAt: "1890-01-01T00:00:00.000Z",
            imageUrls: [image.rhodesCartoon]
          }
        ]
      }
    ]
  },
  {
    slug: "how-the-bible-was-written-and-who-its-authors-were",
    title: "How the Bible Was Written and Who Its Authors Were",
    summary:
      "This story traces how the Bible was composed over many centuries, explains the difference between traditional authorship and modern scholarship, and shows how scribes, editors, and communities shaped both the Hebrew Bible and the New Testament before the canon took recognizable form.",
    coverImageUrl: image.isaiahScroll,
    tags: ["bible", "religion", "manuscripts", "history"],
    links: [
      {
        label: "Britannica: Biblical literature",
        url: "https://www.britannica.com/topic/biblical-literature",
        kind: "website"
      },
      {
        label: "Codex Sinaiticus project",
        url: "https://www.codexsinaiticus.org/en/codex/history.aspx",
        kind: "website"
      },
      {
        label: "Library of Congress: Gutenberg Bible",
        url: "https://www.loc.gov/collections/gutenberg-bible/about-this-collection/",
        kind: "website"
      },
      {
        label: "Wikimedia Commons: Great Isaiah Scroll",
        url: "https://commons.wikimedia.org/wiki/File:Great_Isaiah_Scroll.jpg",
        kind: "photos"
      }
    ],
    chapters: [
      {
        title: "Many Books, Many Writers, Many Centuries",
        type: "memory",
        body: htmlParagraphs([
          "The Bible is not a single book written by one author at one moment. It is a library of texts produced over many centuries in Hebrew, Aramaic, and Greek. The process included oral traditions, court records, legal collections, prophetic speeches, poetry, letters, gospel narratives, editorial revision, and repeated copying by scribes.",
          "For the Hebrew Bible or Old Testament, traditional attributions often associate the Pentateuch with Moses, many psalms with David, wisdom literature with Solomon, and prophetic books with named prophets such as Isaiah, Jeremiah, and Ezekiel. Modern scholarship usually sees a more layered process, especially in the Pentateuch and historical books, where multiple sources and editors appear to have been woven together over time.",
          "The prophetic books also show stages of composition. A major prophet may stand at the center of a book, but followers, scribes, or later schools often preserved, arranged, expanded, and interpreted that legacy. That is why some biblical books preserve voices from different periods while still carrying one traditional name.",
          "The New Testament was composed much later, in the first century CE. The earliest surviving Christian writings are the letters of Paul. The four canonical gospels are formally anonymous in the text itself, although early Christian tradition associated them with Matthew, Mark, Luke, and John. The general scholarly view is that the texts emerged from communities that preserved apostolic memory rather than from shorthand transcripts of single moments."
        ]),
        imageUrls: [image.isaiahScroll],
        moments: [
          {
            title: "c. eighth to second centuries BCE: Hebrew Bible traditions formed",
            description:
              "Laws, royal records, prophetic collections, and poetry were composed, collected, and edited over long periods before stabilizing in written form.",
            happenedAt: "0800-01-01T00:00:00.000Z",
            imageUrls: [image.isaiahScroll]
          },
          {
            title: "c. 50s CE: Pauline letters circulated",
            description:
              "Letters attributed to Paul are the earliest Christian writings in the New Testament and were already being copied and shared among churches.",
            happenedAt: "0050-01-01T00:00:00.000Z",
            imageUrls: [image.gutenbergBible]
          }
        ]
      },
      {
        title: "From Manuscripts to Canon",
        type: "reflection",
        body: htmlParagraphs([
          "What people call the Bible today became recognizable through transmission and canon formation. Communities copied texts by hand, compared versions, preserved favored books, and argued over which writings carried authority. That means the history of the Bible is also a history of libraries, liturgy, teaching, and controversy.",
          "The Dead Sea Scrolls, the Codex Sinaiticus, and other ancient manuscripts show that biblical texts were copied with great care, but not without variation. Spelling changes, omitted lines, harmonizations, and marginal notes all appear in manuscript traditions. Textual criticism studies those differences to recover the earliest attainable wording.",
          "By the fourth century CE, large codices such as Codex Sinaiticus show a Christian Bible collected in one manuscript volume. Much later, the Gutenberg Bible marked a new phase: print could reproduce a stable text far faster than scribal copying, expanding access while preserving the older manuscript heritage that made printing possible in the first place.",
          "So when people ask who wrote the Bible, the most accurate answer is that many authors, editors, and scribes did. Some books have strong traditional attributions, some have disputed or composite authorship, and all reached later readers through communities that copied and preserved them."
        ]),
        imageUrls: [image.gutenbergBible],
        moments: [
          {
            title: "Fourth century CE: Codex Sinaiticus compiled",
            description:
              "One of the earliest surviving Christian Bible codices shows how scriptural books were gathered into large manuscript volumes.",
            happenedAt: "0350-01-01T00:00:00.000Z",
            imageUrls: [image.isaiahScroll]
          },
          {
            title: "1450s: Gutenberg Bible printed",
            description:
              "Movable type transformed Bible production in Europe, making a once labor-intensive manuscript tradition reproducible on a new scale.",
            happenedAt: "1455-01-01T00:00:00.000Z",
            imageUrls: [image.gutenbergBible]
          }
        ]
      }
    ]
  },
  {
    slug: "the-slave-trade-in-the-lands-that-became-nigeria",
    title: "The Slave Trade in the Lands That Became Nigeria",
    summary:
      "This story explains the slave trade in the regions later joined as Nigeria, showing how Atlantic demand, local wars, coastal brokers, inland politics, and later abolition changed Bonny, Calabar, Lagos, and the wider Bight of Benin and Bight of Biafra over several centuries.",
    coverImageUrl: image.biafraChart,
    tags: ["nigeria", "slave trade", "atlantic world", "west africa"],
    links: [
      {
        label: "Britannica: Nigeria",
        url: "https://www.britannica.com/place/Nigeria",
        kind: "website"
      },
      {
        label: "Britannica: Bight of Biafra",
        url: "https://www.britannica.com/place/Bight-of-Biafra",
        kind: "website"
      },
      {
        label: "Wikimedia Commons: Biaffra coast chart",
        url: "https://commons.wikimedia.org/wiki/File:A_chart_of_ye._coast_of_Biaffra_-_btv1b53168614k.jpg",
        kind: "photos"
      },
      {
        label: "Wikimedia Commons: Gulf of Guinea and Slave Coast map",
        url: "https://commons.wikimedia.org/wiki/File:Map_of_the_Gulf_of_Guinea_and_the_Slave_Coast,_1849.jpg",
        kind: "photos"
      }
    ],
    chapters: [
      {
        title: "Before and During the Atlantic Trade",
        type: "memory",
        body: htmlParagraphs([
          "Long before the modern state called Nigeria existed, the region was home to many societies with their own political systems, trading networks, and forms of dependency. When Atlantic slavery expanded from the fifteenth century onward, European demand for captives reshaped those older systems rather than replacing them overnight.",
          "The coasts later associated with Nigeria became tied to two major Atlantic zones: the Bight of Benin in the west and the Bight of Biafra in the east. Ports such as Lagos, Badagry, Bonny, and Old Calabar became famous in European commercial records because captives passed through them in large numbers. Inland warfare, raiding, political competition, and debt all fed the traffic, but the oceanic market made that violence more profitable and far larger in scale.",
          "It is important to tell the story honestly. Europeans financed ships, maritime insurance, oceanic distribution, and plantation demand across the Americas. African brokers, rulers, and merchants also participated in capturing, selling, or moving people under specific local conditions. The trade was therefore neither a purely external crime nor a purely local one; it was a connected Atlantic system driven by demand, profit, force, and political power.",
          "Different regions experienced the trade differently. Some communities were devastated by repeated insecurity, while others became intermediary powers by controlling access to the coast. Bonny and Old Calabar, for example, rose as major export points for the Bight of Biafra trade, while western ports linked more directly to politics involving Lagos, Dahomey, and the wider Bight of Benin."
        ]),
        imageUrls: [image.biafraChart, image.slaveCoastMap],
        moments: [
          {
            title: "Fifteenth to eighteenth centuries: Atlantic trade deepened",
            description:
              "European shipping demand connected West African coasts to plantation economies in the Americas, expanding the export of captives from multiple ports.",
            happenedAt: "1600-01-01T00:00:00.000Z",
            imageUrls: [image.slaveCoastMap]
          },
          {
            title: "Bonny and Old Calabar became key outlets",
            description:
              "Eastern Delta ports emerged as major embarkation points in the Bight of Biafra, linking inland networks to Atlantic shipping.",
            happenedAt: "1750-01-01T00:00:00.000Z",
            imageUrls: [image.biafraChart]
          }
        ]
      },
      {
        title: "Abolition, Palm Oil, and the Long Afterlife of Slavery",
        type: "reflection",
        body: htmlParagraphs([
          "British abolition of the transatlantic slave trade in 1807 did not end coercion at once. Illegal exports continued, and many local economies had already been reorganized around the structures the slave trade created. In some places, commerce shifted toward palm oil and other commodities, but that transition also relied on labor systems shaped by earlier enslavement.",
          "The nineteenth century therefore was not a clean moral break between slavery and freedom. British naval pressure, missionary presence, changing local politics, and new commercial opportunities altered the external trade, yet internal slavery and forced labor relationships persisted in many areas. Former slave-trading ports had to reposition themselves in an economy no longer organized in exactly the same way.",
          "This history matters because modern discussions often reduce the region to one simple victim narrative or one simple blame narrative. The fuller record is harsher and more complex. European plantation capitalism drove the Atlantic scale of the trade, while African states and brokers made choices within violent political economies that the Atlantic world had enlarged.",
          "Understanding the lands that became Nigeria requires facing both truths at once: millions were commodified through a global system, and the social damage did not vanish when formal export abolition arrived. Political instability, class divisions, and new colonial interventions all grew in the shadow of that long history."
        ]),
        imageUrls: [image.slaveCoastMap],
        moments: [
          {
            title: "1807: Britain abolished its slave trade",
            description:
              "British law outlawed the slave trade for British subjects, beginning a long period of naval enforcement and uneven suppression.",
            happenedAt: "1807-03-25T00:00:00.000Z",
            imageUrls: [image.slaveCoastMap]
          },
          {
            title: "Mid nineteenth century: commerce shifted toward palm produce",
            description:
              "As legal suppression increased, parts of the coastal economy reorganized around palm oil, though coercive labor systems persisted.",
            happenedAt: "1850-01-01T00:00:00.000Z",
            imageUrls: [image.biafraChart]
          }
        ]
      }
    ]
  },
  {
    slug: "how-nigeria-came-into-being",
    title: "How Nigeria Came Into Being",
    summary:
      "This story explains how the modern state of Nigeria emerged from many older kingdoms, emirates, and communities through British conquest, chartered company rule, protectorates, the 1914 amalgamation, and the later path from colony to independence and republic.",
    coverImageUrl: image.lugardPortrait,
    tags: ["nigeria", "colonial history", "amalgamation", "west africa"],
    links: [
      {
        label: "Britannica: Nigeria",
        url: "https://www.britannica.com/place/Nigeria",
        kind: "website"
      },
      {
        label: "Britannica: Royal Niger Company",
        url: "https://www.britannica.com/topic/Royal-Niger-Company",
        kind: "website"
      },
      {
        label: "Wikimedia Commons: Frederick Lugard",
        url: "https://commons.wikimedia.org/wiki/File:Frederick_Lugard,_1st_Baron_Lugard.jpg",
        kind: "photos"
      },
      {
        label: "Wikimedia Commons: Northern Nigeria map",
        url: "https://commons.wikimedia.org/wiki/File:Map_of_Northern_Nigeria_(1911).png",
        kind: "photos"
      }
    ],
    chapters: [
      {
        title: "Before the Name Nigeria",
        type: "memory",
        body: htmlParagraphs([
          "Nigeria did not begin as one ancient kingdom that gradually expanded. The area that later became Nigeria contained many distinct political formations, including Hausa states, the Sokoto Caliphate, Kanem-Bornu traditions, Yoruba kingdoms such as Oyo and Ife, Igbo communities with varied political structures, Delta city-states, and many smaller societies across the Middle Belt and the coast.",
          "British influence first grew unevenly. Lagos was annexed in 1861. The Niger trade basin was penetrated through diplomacy, war, and chartered company rule, especially under the Royal Niger Company. By 1900, Britain had replaced company control with direct imperial administration and established the Protectorate of Northern Nigeria and the Protectorate of Southern Nigeria, while Lagos had already become a crown colony.",
          "The name Nigeria itself is usually linked to Flora Shaw, a journalist who later married Frederick Lugard. It described a territory gathered around the Niger basin before that territory had been fully fused into one administrative unit.",
          "None of this was a neutral act of state-building. The British state assembled Nigeria through conquest, treaty pressure, administrative convenience, and revenue logic. Existing societies were brought into one framework for imperial reasons, not because they had jointly chosen a common national state."
        ]),
        imageUrls: [image.northernNigeriaMap, image.lugardPortrait],
        moments: [
          {
            title: "1861: Lagos annexed by Britain",
            description:
              "British annexation of Lagos created a durable coastal foothold for imperial administration and commerce.",
            happenedAt: "1861-08-06T00:00:00.000Z",
            imageUrls: [image.nigeriaRoadMap]
          },
          {
            title: "1900: Northern and Southern protectorates formalized",
            description:
              "The Royal Niger Company gave way to direct British rule, producing separate northern and southern administrations.",
            happenedAt: "1900-01-01T00:00:00.000Z",
            imageUrls: [image.northernNigeriaMap]
          }
        ]
      },
      {
        title: "Amalgamation, Nationalism, and Independence",
        type: "milestone",
        body: htmlParagraphs([
          "In 1914, Frederick Lugard carried out the amalgamation of the Northern and Southern protectorates. The move did not erase regional difference. In many ways it institutionalized it. The north and south retained different administrative histories, educational trajectories, legal practices, and revenue structures, but they were now governed within one imperial frame.",
          "The decades that followed saw the growth of rail, ports, cash-crop export, colonial taxation, and new urban politics. Mission education expanded especially in the south. Newspapers, unions, professionals, and political associations began to imagine wider forms of Nigerian public life, even while regional interests remained strong.",
          "Constitutional reforms after the Second World War created a more clearly federal politics. By 1960, Nigeria achieved independence as a sovereign state, and in 1963 it became a republic. Those dates matter, but they sit on top of a longer and more uneven process in which a colonial creation gradually became a national political project.",
          "That is why asking how Nigeria came into being has two answers at once. Nigeria was created administratively by British colonial power, especially through conquest and amalgamation. Nigeria also became a nation politically through the later work of Nigerians who argued, organized, negotiated, and fought over what that state should be."
        ]),
        imageUrls: [image.nigeriaRoadMap],
        moments: [
          {
            title: "1914: Amalgamation of Northern and Southern Nigeria",
            description:
              "Lugard joined the protectorates into one colony and protectorate, creating the administrative core of modern Nigeria.",
            happenedAt: "1914-01-01T00:00:00.000Z",
            imageUrls: [image.lugardPortrait]
          },
          {
            title: "1960: Independence",
            description:
              "Nigeria became independent from Britain, inheriting colonial borders but entering a new phase of self-government.",
            happenedAt: "1960-10-01T00:00:00.000Z",
            imageUrls: [image.nigeriaRoadMap]
          }
        ]
      }
    ]
  }
];

async function upsertArchiveAuthor() {
  const passwordHash = await bcrypt.hash("ArchivePass123!", 12);
  const now = new Date();

  return UserModel.findOneAndUpdate(
    { email: "archive@histora.app" },
    {
      $set: {
        fullName: "Histora Archive",
        username: "historaarchive",
        email: "archive@histora.app",
        passwordHash,
        emailVerified: true,
        emailVerifiedAt: now,
        verificationStatus: "verified",
        verificationRequestedAt: now,
        verifiedAt: now,
        bio: "Long-form public archive stories with timelines, source links, and historical context.",
        location: "Archive Desk",
        subscriptionTier: "premium",
        profileVisibility: "public",
        defaultStoryVisibility: "public",
        allowCommentsByDefault: true,
        allowHelpRequests: false,
        hideReadCounts: false,
        showAnonymousActivity: false,
        isAnonymousPostingEnabled: false,
        selectedViewerIds: []
      }
    },
    { new: true, upsert: true }
  );
}

async function removeDummyStories() {
  const dummyStories = await StoryModel.find({
    status: "published",
    visibility: "public",
    $or: [
      { slug: { $regex: /^playwright-/i } },
      { title: { $regex: /^playwright/i } },
      { slug: "feed-author-public-story" },
      { title: "Feed author public story" }
    ]
  }).select("_id slug title chapters");

  if (!dummyStories.length) {
    return { removedCount: 0, removedSlugs: [] as string[] };
  }

  const storyIds = dummyStories.map((story) => story._id);
  const chapterTargets = dummyStories.flatMap((story) =>
    story.chapters.map((chapter) => `${story.id}:${chapter.order}`)
  );

  await CommentModel.deleteMany({
    $or: [{ storyId: { $in: storyIds } }, { targetType: "storyChapter", targetId: { $in: chapterTargets } }]
  });
  await StoryInteractionModel.deleteMany({ storyId: { $in: storyIds } });
  await StoryModel.deleteMany({ _id: { $in: storyIds } });

  return {
    removedCount: dummyStories.length,
    removedSlugs: dummyStories.map((story) => story.slug)
  };
}

async function upsertStories(authorId: string, authorName: string, authorUsername: string) {
  const results: Array<{ slug: string; id: string }> = [];

  for (const story of stories) {
    const storedContent = buildStoredStoryContent({
      title: story.title,
      summary: story.summary,
      coverImageUrl: story.coverImageUrl,
      visibility: "public",
      anonymous: false,
      allowedViewerIds: [],
      tags: story.tags,
      links: story.links,
      chapters: story.chapters.map((chapter, index) => ({
        title: chapter.title,
        body: chapter.body,
        type: chapter.type,
        order: index + 1,
        imageUrls: chapter.imageUrls,
        moments: chapter.moments.map((moment) => ({
          title: moment.title,
          description: moment.description,
          happenedAt: moment.happenedAt,
          imageUrls: moment.imageUrls
        }))
      })),
      status: "published"
    });

    const persisted = await StoryModel.findOneAndUpdate(
      { slug: story.slug },
      {
        $set: {
          authorId,
          authorName,
          authorUsername,
          slug: story.slug,
          status: "published",
          title: storedContent.title,
          summary: storedContent.summary,
          contentEncrypted: storedContent.contentEncrypted,
          coverImageUrl: story.coverImageUrl,
          visibility: "public",
          anonymous: false,
          allowedViewerIds: [],
          tags: storedContent.tags,
          links: storedContent.links,
          chapters: storedContent.chapters.map((chapter, chapterIndex) => ({
            ...chapter,
            type: story.chapters[chapterIndex]?.type ?? "memory",
            order: chapterIndex + 1,
            imageUrls: story.chapters[chapterIndex]?.imageUrls ?? [],
            moments: chapter.moments.map((moment, momentIndex) => ({
              ...moment,
              happenedAt: new Date(story.chapters[chapterIndex]?.moments[momentIndex]?.happenedAt ?? new Date().toISOString()),
              imageUrls: story.chapters[chapterIndex]?.moments[momentIndex]?.imageUrls ?? []
            }))
          })),
          readCount: 0,
          reactionsCount: 0,
          likesCount: 0,
          bookmarksCount: 0,
          sharesCount: 0,
          commentsCount: 0
        }
      },
      { upsert: true, new: true }
    );

    results.push({ slug: story.slug, id: persisted.id });
  }

  return results;
}

async function main() {
  await connectDatabase();

  const archiveAuthor = await upsertArchiveAuthor();
  const cleanup = await removeDummyStories();
  const seededStories = await upsertStories(
    archiveAuthor.id,
    archiveAuthor.fullName,
    archiveAuthor.username
  );

  console.log(
    JSON.stringify(
      {
        removedDummyStoryCount: cleanup.removedCount,
        removedDummyStorySlugs: cleanup.removedSlugs,
        archiveAuthor: {
          id: archiveAuthor.id,
          username: archiveAuthor.username,
          email: archiveAuthor.email
        },
        seededStories
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
