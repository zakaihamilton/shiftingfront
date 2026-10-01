import { ENGAGEMENT_SCENARIOS, runEngagement } from "../lib/sim/balance/engagements";
console.log(JSON.stringify(ENGAGEMENT_SCENARIOS.flatMap(scenario => [0, 1, 2, 3].map(seed => runEngagement(scenario, seed))), null, 2));
