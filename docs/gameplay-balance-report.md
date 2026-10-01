# Gameplay balance report

Automated commander outcomes; these are not human playtest timings. Successful completion percentiles exclude losses and unfinished runs.

The commander prioritizes primary objectives and does not deliberately pursue
bonus challenges. Human timings that include those challenges are not measured
by this sweep.

| Rules / sample | Runs | Wins | Losses | Unfinished | Median min | P90 min | Wins in 5–12 min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Legacy, seeds 0000–0039 | 240 | 230 | 4 | 6 | 4.15 | 12.00 | 30.9% |
| Current, seeds 0000–0039 | 240 | 236 | 4 | 0 | 7.07 | 13.19 | 72.5% |
| Current, seeds 0040–0079 | 240 | 228 | 10 | 2 | 6.97 | 13.63 | 70.2% |

## Acceptance

Existing balance gates: pass.

Held-out balance gates: pass.

Prior archetype gates passed across 480 stratified runs (202 wins, 177 losses
and 101 unfinished). These deliberately biased armies are evaluated with the
existing reliability and anti-cheese thresholds, rather than the competent
commander's win-rate threshold.

Timing target (70% of successful runs in 5–12 minutes): met at 72.5% on the
baseline (171/236; 72.46% unrounded) and 70.2% on held-out seeds (160/228;
70.18% unrounded). No minimum completion time or new defeat timer was added.

## Mission timing

| Mission | Legacy median min | Current median min | Current P90 min |
| --- | ---: | ---: | ---: |
| annihilate | 7.90 | 9.77 | 16.25 |
| decapitate | 5.15 | 10.33 | 14.01 |
| destroyMarked | 5.62 | 8.84 | 13.64 |
| escort | 4.29 | 5.43 | 6.93 |
| extraction | 2.30 | 7.55 | 8.57 |
| forceQuota | 3.32 | 7.33 | 11.70 |
| harvestQuota | 6.08 | 7.59 | 12.76 |
| holdTheLine | 9.00 | 9.00 | 14.00 |
| razeAll | 7.93 | 13.33 | 17.94 |
| rescue | 1.66 | 5.99 | 7.55 |
| sabotage | 6.09 | 6.95 | 12.95 |
| structureQuota | 2.67 | 5.55 | 9.86 |

## Advanced armies

This 960-run diagnostic used the preceding rules-2 quota settings and ordinary
production costs; it was not rerun after the mission-specific quota refinement
below.
The competent baseline wins at least 92.5% in every sampled family, leaving
less than ten percentage points of possible advantage under the dominance
rule. The defining-unit column counts medics and repair trucks for the
competent reference and support composition.

| Strategy | Runs | Win rate | Produced defining units |
| --- | ---: | ---: | ---: |
| competent | 240 | 95.4% | 422 |
| behemoths | 240 | 91.3% | 240 |
| aircraft | 240 | 79.6% | 518 |
| support | 240 | 93.3% | 1423 |

Dominance criterion: above 90% wins and at least 10 percentage points ahead of competent combined arms in matching families with at least eight samples. No strategy meets the criterion; unit stats remain unchanged.

Four seeded equal-investment arenas per matchup also ran. Integer unit counts
put opposing investment within 11%, including runway and power infrastructure.
Both sides receive orders under their own owner, and movement advances aircraft
once per tick. Behemoths defeated dispersed anti-armor, tanks and elevated
defenders in all four seeds. Against clustered infantry, one seed ended in a
Behemoth victory and three reached the horizon with one infantry survivor.
Targeting the repair truck first defeated the supported tanks in all four seeds.
Powered anti-air killed the aircraft in three seeds; one reached the horizon
with the aircraft and all four turrets surviving. These isolated outcomes
identify human-playtest questions; they do not demonstrate campaign-family
dominance or a reliable aircraft counter across all seeds.

## Bounded pacing trials

Trials covered the affected missions in seeds 0000–0039. Route multipliers
started from the initial rules-2 scale of 1.25 times legacy dimensions; quota
multipliers started from the unscaled rules-2 generated targets. These are the
initial bounded trials; the final quota factors were refined against both full
seed ranges below. All trials used a 36-minute diagnostic budget for untimed
operations.

| Group | Multiplier | Runs | Wins | Unfinished | Wins in 5–12 min | Gates |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Routes | 0.75 | 62 | 55 | 0 | 7.3% | Failed map diagnostics |
| Routes | 1 | 62 | 59 | 0 | 20.3% | Passed |
| Routes | 1.25 | 62 | 56 | 0 | 33.9% | Passed after diagnostic repair; selected |
| Routes | 1.5 | 62 | 56 | 0 | 50.0% | Failed map diagnostics; rejected |
| Quotas | 0.75 | 44 | 43 | 1 | 18.6% | Passed |
| Quotas | 1 | 44 | 43 | 1 | 41.9% | Passed |
| Quotas | 1.25 | 44 | 43 | 1 | 58.1% | Passed |
| Quotas | 1.5 | 44 | 43 | 1 | 65.1% | Best initial candidate |

The 1.65 force/structure factor reached 70.6% on the baseline but 68.3% on
held-out seeds. Raising every quota further moved late completions past 12
minutes and reduced quota reliability. The final rules retain a 1.5 harvest
factor and a 1.65 force/structure factor for missions 3–6, while missions 1–2
use 2.1; mission 1 force quotas use 3.0. That opening factor was retuned after
fixing the second-harvester startup so force quotas stay above the five-minute
floor. Full 240-run sweeps passed the timing target at 72.46% baseline and
70.18% held-out, with the existing balance gates passing in both ranges.

The first route diagnostics exhausted the realtime path-search budget on
large maps. Diagnostic searches now have a full-grid budget, while realtime
searches retain their default budget. Seed 0040 also exposed an excessively
long alternate lane; rules 2 repair that lane. Regression tests cover both
0040 mission 1 and 0069 mission 5. The largest route trial was not rerun after
these repairs and remains rejected under its recorded gate result.

A shorter survival curve failed the existing rush-only army gate, so survival
duration retains legacy timing. Increasing rescue guards to tanks and enlarging
extraction maps also reduced recovery reliability and were not selected.

## Late cleanup and compatibility

Seed 0002 mission 6 remained unfinished after 30 minutes with enemy structures
and aircraft left; seed 0004 mission 3 finished just beyond the former
20-minute diagnostic cap. Seed 0004 mission 5 previously lost the yard at 8/21
tanks because quota production kept the factory from building a second
harvester. Factory production now bootstraps that harvester before continuing
quota units; the mission produces all 21 tanks and wins at tick 7,752. New-rules
commander production also replaces lost harvesters, maintains two harvesters
later in offensive missions and reserves factory production for up to two late
Behemoths. The final baseline produced 170 Behemoths; held-out validation
produced 155. Assault records were refreshed after correcting the factory
priority that previously spent those reserved credits on tanks.

Legacy rules, saves and subsequent deployments retain their previous seeded
contracts. New optional guards and outposts are excluded from mandatory
elimination. Bonus placement preserves reachable routes, and completed bonus
state and partial zone progress survive save/reload. No unit stats changed.

## Verification and timing result

Manual browser checks covered the rescue ore challenge and sabotage supply
outpost in briefing, HUD, minimap and the defeat debrief. The browser regression additionally
verifies briefing-to-deployment consistency and reload persistence. These
checks do not establish human completion times or replace full human playtests
of every mission family.

The final baseline and held-out competent gates pass without weakened
thresholds. The stratified archetype gates, diagnostic regression suite and
browser smoke/save/challenge cases were verified before the final quota
refinement and are retained as prior-version checks. The second-harvester and
opening-quota regressions pass, and full baseline and held-out sweeps pass the
70% completion-window gate. No forced wait was added to pad times.
These automated timings do not replace human playtests across every mission
family. See [gameplay rules](gameplay-rules.md) for reproduction commands,
compatibility behavior and diagnostic fields.
