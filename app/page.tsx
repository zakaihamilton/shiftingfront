import type { Metadata } from "next";
import { MenuScreen } from "@/components/menu/MenuScreen";
import { parseSeed, formatSeed } from "@/lib/seed/rng";
import { createCampaign } from "@/lib/gen/campaign";
import { weeklySeed } from "@/components/menu/menuLaunch";
import { biomeLabel } from "@/lib/gen/names";
import { APP_NAME } from "@/lib/site";

type Props = {
  searchParams: Promise<{ seed?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { seed: seedQuery } = await searchParams;
  const currentWeekly = weeklySeed();
  const parsed = seedQuery ? parseSeed(seedQuery) : null;
  const activeSeed = parsed !== null ? parsed : (parseSeed(currentWeekly) ?? 0);
  const seedStr = parsed !== null ? formatSeed(parsed) : currentWeekly;
  const campaign = createCampaign(activeSeed);

  const title = APP_NAME;

  const description = `${campaign.world.name} (${biomeLabel(campaign.world.biome)}). ${campaign.world.conflict}. ${campaign.factions[0].name} vs ${campaign.factions[1].name}. 6 operations — a seeded RTS campaign.`;

  const ogUrl = `/api/og?seed=${seedStr}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
          alt: `Shifting Front Seed ${seedStr} Preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default function Home() {
  return <MenuScreen />;
}
