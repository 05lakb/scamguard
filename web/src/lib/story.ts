// The 90-second guided story: five cases, played one after another with a caption for each.

export interface StoryStep {
  scenarioId: string;
  autoAnswer: boolean;
  title: string;
  text: string;
}

export const STORY: StoryStep[] = [
  {
    scenarioId: "d2",
    autoAnswer: false,
    title: "A fake bank call",
    text: "A caller says he is from the bank and tells the customer to move savings to a 'safe account'. The payment is huge, on a live call, to a two-day-old account. The guard holds it before any money moves.",
  },
  {
    scenarioId: "d3",
    autoAnswer: true,
    title: "Four words, nothing unusual",
    text: "A normal amount and a four-word note. Nothing in the payment gives it away, so the guard asks a friendly question, reads the answer, and decides again.",
  },
  {
    scenarioId: "d5",
    autoAnswer: false,
    title: "A message that tries to give orders",
    text: "The note hides a line telling the checker to approve the payment. That is treated as a warning sign, never as an instruction.",
  },
  {
    scenarioId: "d6",
    autoAnswer: false,
    title: "Fifteen days of memory",
    text: "Each instalment looks small. Fifteen days of history shows seven earlier payments to the same new payee, so the pattern is caught.",
  },
  {
    scenarioId: "l2",
    autoAnswer: true,
    title: "A genuine secret",
    text: "'Keep it secret' sounds like a scam, but it is a surprise party. The guard asks, understands, and lets a genuine customer through with little friction.",
  },
];

export const STORY_PAUSE_MS = 8000;
