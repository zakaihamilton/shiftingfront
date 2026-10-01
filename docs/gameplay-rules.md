# Versioned gameplay rules

New campaigns use rules 2. Campaign progress, battlefield saves, named slots,
restarts and subsequent deployments retain their rules version. Unversioned
campaigns and saves use rules 1; legacy replay fingerprints remain unchanged.
Tutorial and multiplayer scenarios do not receive campaign bonus challenges.

## Pacing

Rules 2 use 200×200 rescue maps, 180×180 extraction maps and 144×144 escort
maps in missions 1–4 (150×150 in missions 5–6). Offensive combat maps are at
least 104×104; other mission families keep their legacy dimensions. Seeded
mission kinds, ordering and quota roles stay the same. Harvest quotas scale
their generated targets by 1.5. Force and structure quotas scale by 2.1 in
missions 1–2, except mission 1 force quotas, which scale by 3.0; later force
and structure quotas scale by 1.65. These factors apply once. Rescue
patrols must be cleared before stranded units can be contacted, with two guards
per target.

Deadline generation uses a 5–12 minute base curve followed by the existing
scenario allowances. These allowances can produce longer deadlines; they are
not minimum victory times. Survival duration retains the legacy curve because
shorter trials failed the rush-army acceptance gate. Untimed objectives remain
untimed. No minimum completion time or new defeat condition was introduced.

## Optional challenges

Assault missions may place a guarded supply outpost away from the main route.
Other missions may offer a reachable forward ore position to secure with a
combat ground unit for 60 continuous seconds. Enemy ground combat units contest
the position; leaving it resets progress. Completion is permanent during play.
Maps without a suitable position omit the challenge. Supply outposts cannot
disconnect previously reachable ground.

The briefing, operations map, HUD, world and minimap identify the challenge.
Outposts and guards do not count toward mandatory elimination objectives.
Completed challenges award 250 points and qualify for the optional medal;
preserving the HQ alone does not qualify for that medal under rules 2.

## Reproducing diagnostics

Use the project's supported Node version before running Yarn commands. A full
baseline covers all six missions for seeds 0000–0039; held-out validation uses
0040–0079. The explicit horizon below allows untimed missions to run for 36
minutes without adding a gameplay deadline.

```sh
yarn balance --from 0 --to 39 --rules 2 --ticks 25920 --untimed-horizon-ticks 25920 --details true --check true --min-completion-window-rate 0.70 --progress false
yarn balance --from 40 --to 79 --rules 2 --ticks 25920 --untimed-horizon-ticks 25920 --details true --check true --min-completion-window-rate 0.70 --progress false
yarn balance --from 0 --to 39 --rules 2 --strategy archetypes --stratified true --details true --check true --progress false
yarn balance --from 0 --to 39 --rules 2 --strategy advanced --details true --progress false
yarn gameplay:engagements
yarn gameplay:report --baseline legacy.json --current current.json --validation validation.json --advanced advanced.json
```

The advanced sweep includes competent combined arms, Behemoth, aircraft and
support compositions. All use public orders and normal production costs.
Equal-investment arenas cover dispersed counters, clustered infantry, tanks,
anti-air, high ground and support targeting. Results are observations rather
than assertions that any army must win.

Records distinguish a combat command from first actual damage, and include
minute-by-minute objective progress, credits, casualties, production by role,
remaining enemies and blocked ticks. Outcomes distinguish victory, deadline
loss, other loss, diagnostic truncation and unfinished untimed missions.
Completion percentiles include wins only.

Bounded experiments use `--pacing-group routes` or `--pacing-group quotas` and
`--pacing-multiplier 0.75`, `1`, `1.25` or `1.5`. Multipliers apply to the current
rules, so reports must identify the starting constants. Reject candidates that
fail existing gates; select the best 5–12 minute completion rate among the
remaining candidates, then fewer unfinished runs, then the smallest change.
Advanced-unit dominance requires above 90% wins and at least ten percentage
points ahead of competent combined arms within matching mission families of
at least eight samples. Unit stats remain unchanged without that evidence.
