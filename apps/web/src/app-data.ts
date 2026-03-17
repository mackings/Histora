export const storyCircles = [
  {
    name: "Your status",
    label: "Post memory",
    tone: "add",
    meta: "Share a quick drop",
    contentTitle: "Create a quick Histora status",
    contentBody:
      "Post a private thought, a chapter teaser, an anonymous question, or a photo memory for people to react to."
  },
  {
    name: "Anonymous",
    label: "Advice status",
    tone: "blue",
    meta: "31 reactions",
    contentTitle: "Anonymous advice status",
    contentBody:
      "I keep rewriting the same chapter because I still do not know whether I am telling the truth or protecting everybody else."
  },
  {
    name: "Amina",
    label: "New chapter",
    tone: "orange",
    meta: "12m ago",
    contentTitle: "Amina posted a new chapter",
    contentBody:
      "Chapter 7 is live with old apartment photos, timeline markers, and the voice note I recorded after finally getting my own keys."
  },
  {
    name: "Ife",
    label: "Close circle",
    tone: "ink",
    meta: "Selected viewers",
    contentTitle: "Close-circle memory",
    contentBody:
      "This entry is visible to my selected people first. I need honest reactions before I ever make this public."
  },
  {
    name: "David",
    label: "Timeline drop",
    tone: "blue",
    meta: "4 replies",
    contentTitle: "Timeline update",
    contentBody:
      "Added three milestones to my rebuilding story: the layoff, the loan rejection, and the first client payment that changed everything."
  }
];

export const feedPreview = [
  {
    author: "Amina Kole",
    handle: "@aminawrites",
    title: "Chapter 7: The move that changed everything",
    excerpt:
      "I mapped each month on a timeline and attached old rent receipts, phone photos, and one shaky voice note. The chapter only made sense after the evidence sat beside the memory.",
    reads: "1.2K",
    visibility: "PUBLIC",
    genre: "Life archive",
    chapterCount: 12,
    comments: 214,
    saves: "1.1K"
  },
  {
    author: "Anonymous",
    handle: "@quietchapter",
    title: "Need advice on forgiving a parent",
    excerpt:
      "Posting this anonymously because the memory still feels too close to name. I want perspective before I decide whether the next chapter should become a call.",
    reads: "843",
    visibility: "ANON",
    genre: "Advice",
    chapterCount: 1,
    comments: 86,
    saves: "402"
  },
  {
    author: "David Ojo",
    handle: "@davidwrites",
    title: "Timeline of rebuilding after losing my business",
    excerpt:
      "I stopped trying to write one giant comeback story. I wrote each setback like a separate entry, then the full archive started reading like a life instead of a performance.",
    reads: "2.8K",
    visibility: "PUBLIC",
    genre: "Resilience",
    chapterCount: 9,
    comments: 301,
    saves: "2K"
  }
];

export const trendingStories = [
  { title: "When home stopped feeling temporary", author: "Maryam A.", reads: "9.8K reads" },
  { title: "Anonymous grief diary", author: "Private now", reads: "6.1K reads" },
  { title: "The year I left the church", author: "Tolu R.", reads: "11.4K reads" }
];

export const chapterDrafts = [
  {
    title: "Chapter 1: Before the city",
    type: "MEMORY",
    words: 860,
    status: "READY",
    moments: 3
  },
  {
    title: "Chapter 2: The year everything changed",
    type: "MILESTONE",
    words: 1320,
    status: "DRAFT",
    moments: 4
  },
  {
    title: "Advice post: Should I reconnect?",
    type: "ANON",
    words: 420,
    status: "SELECTED",
    moments: 1
  }
];

export const pricingPlans = [
  {
    name: "Observer",
    price: "$0",
    description: "Start your archive with short stories and limited media.",
    features: ["2 memory chapters", "Limited image storage", "Basic read counts", "Anonymous advice posts"]
  },
  {
    name: "Pro",
    price: "$12/mo",
    description: "Unlimited chapters, multiple media attachments, selected-reader circles, and deeper archive control.",
    features: ["Unlimited chapters", "Voice and image bundles", "Selected people access", "Advanced archive privacy"]
  }
];

export const trustedCircle = [
  { name: "Mum", access: "FAMILY_ONLY", note: "Can read family chapters only" },
  { name: "Jade", access: "EDITOR", note: "Reviews public drafts before publishing" },
  { name: "Therapist", access: "PRIVATE_VIEWER", note: "Can access healing timeline posts" }
];

export const timelineMoments = [
  { year: "2016", title: "Left home for university", body: "The first chapter where I had to narrate myself without family translating me." },
  { year: "2019", title: "First salaried role", body: "Independence became measurable, expensive, and finally visible in the archive." },
  { year: "2024", title: "Started writing honestly", body: "Anonymous posts came first. Public writing came later." }
];

export const readingShelves = [
  {
    title: "Healing status",
    meta: "842 views",
    mood: "ANON DROP",
    reactions: "64 reactions"
  },
  {
    title: "Family and identity",
    meta: "513 views",
    mood: "CLOSE CIRCLE",
    reactions: "37 reactions"
  },
  {
    title: "Career reinventions",
    meta: "391 views",
    mood: "PUBLIC STORY",
    reactions: "22 reactions"
  }
];
