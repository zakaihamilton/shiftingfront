import { ImageResponse } from "next/og";
import { formatSeed, parseSeed } from "@/lib/seed/rng";
import { createCampaign } from "@/lib/gen/campaign";
import { biomeLabel } from "@/lib/gen/names";
import { weeklyIndex, weeklySeed } from "@/components/menu/menuLaunch";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSeed = searchParams.get("seed");
    const currentWeekly = weeklySeed();
    const parsed = rawSeed ? parseSeed(rawSeed) : null;
    const activeSeed = parsed !== null ? parsed : (parseSeed(currentWeekly) ?? 0);
    const seedStr = parsed !== null ? formatSeed(parsed) : currentWeekly;
    const isWeekly = seedStr === currentWeekly;
    const week = weeklyIndex();
    const campaign = createCampaign(activeSeed);

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#070b12",
            padding: "50px 60px",
            fontFamily: "sans-serif",
            border: "8px solid #141d27",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "2px solid #243040",
              paddingBottom: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  backgroundColor: "#5ce1e6",
                  color: "#05080e",
                  fontWeight: 900,
                  fontSize: "24px",
                  padding: "6px 14px",
                  borderRadius: "2px",
                  letterSpacing: "2px",
                }}
              >
                SF
              </div>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#e8f2f6", letterSpacing: "3px" }}>
                SHIFTING FRONT
              </div>
            </div>

            <div
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: isWeekly ? "#5ce1e6" : "#e8c45a",
                backgroundColor: isWeekly ? "rgba(92, 225, 230, 0.12)" : "rgba(232, 196, 90, 0.12)",
                border: `1px solid ${isWeekly ? "#5ce1e6" : "#e8c45a"}`,
                padding: "8px 18px",
                borderRadius: "2px",
                letterSpacing: "2px",
              }}
            >
              {isWeekly ? `WEEK ${week} OPERATION` : "CUSTOM CAMPAIGN"}
            </div>
          </div>

          {/* Body */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", margin: "20px 0" }}>
            <div
              style={{
                fontSize: "72px",
                fontWeight: 900,
                color: "#ffffff",
                letterSpacing: "4px",
                lineHeight: 1,
              }}
            >
              SEED {seedStr}
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
              <span style={{ fontSize: "36px", fontWeight: 800, color: "#5ce1e6" }}>
                {campaign.world.name}
              </span>
              <span style={{ fontSize: "24px", fontWeight: 700, color: "#7a92a4" }}>
                · {biomeLabel(campaign.world.biome)}
              </span>
            </div>

            <div style={{ fontSize: "22px", color: "#c5d4de", fontWeight: 600 }}>
              {campaign.world.era} — {campaign.world.conflict}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                fontSize: "26px",
                fontWeight: 800,
                color: "#e8c45a",
                marginTop: "10px",
              }}
            >
              <span>{campaign.factions[0].name}</span>
              <span style={{ color: "#7a92a4", fontSize: "18px" }}>VS</span>
              <span>{campaign.factions[1].name}</span>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "2px solid #243040",
              paddingTop: "20px",
            }}
          >
            <div style={{ fontSize: "20px", color: "#7a92a4", fontWeight: 700, letterSpacing: "1px" }}>
              6 OPERATIONS · SEEDED ISOMETRIC RTS
            </div>
            <div style={{ fontSize: "20px", color: "#5ce1e6", fontWeight: 800, letterSpacing: "2px" }}>
              SEEDED RTS CAMPAIGN · PLAY IN BROWSER
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch {
    return new Response("Failed to generate image", { status: 500 });
  }
}
