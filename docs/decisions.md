# Forkcast decision log

Decisions made by the backend agent (Claude) so the team never waits on a question.
Newest at the bottom. Each line: time (BST), decision, why. Reverse any of them by editing
this file and telling the backend agent.

| Time | Decision | Why |
| --- | --- | --- |
| 12:30 | Pitch: "generation is free, validation is scarce". Hero metric is the sealed AI forecast's error vs real people, not "votes saved" | AI ad generators (gimmegimme, AdCreative.ai) already make volume; judges reward evidence |
| 12:35 | Approach C: lunch-room test, then an evidence-driven challenger round at 16:00. Cut the challenger if the dashboard isn't live on real data by 15:15 | Gets the creation loop without risking the 14:00 data window |
| 12:35 | 6 behavioural-lever ads, 1 product visual, every voter sees all 6 in random order | Within-subjects keeps n per ad = voter count; a fixed visual credits wins to the copy |
| 12:35 | Track 1, Human Truth | Levers + the AI-vs-human gap answer "why people choose" |
| 12:53 | Scaffold from the /hackathon template into the repo root, two lanes (backend, frontend) with path ownership in AGENTS.md | Teammates and agents never edit the same file |
| 12:58 | Web runs on port 3300 | Port 3000 on Richard's Mac is held by the Nous dev server; we don't touch it |
| 13:00 | OpenAI for every AI call: gpt-6.1-sol (copy, challenger, pack facts), gpt-5.4-mini (40-persona panel), gpt-image-2 (ad visual). Plain fetch in apps/api/src/lib/llm.ts, no SDK | Only OPENAI_API_KEY is available; no SDK keeps the shared lockfile stable. Probed: 4.4 s and 1.1 s per call |
| 13:01 | Commit straight to master (no PR flow) | Two lanes with disjoint paths; the teammate needs master now |
| 13:03 | Public repo github.com/richard7ao/forkcast | Submission requires a public repo; public git history doubles as forecast pre-registration |
| 13:03 | sample_images/ and the event brief are never committed | Photos show bystanders' hands and shoes; the brief is the organiser's document |
| 13:04 | llm.ts retries network errors with backoff | Venue DNS intermittently fails for api.openai.com and api.github.com |
| 13:05 | Votes: append-only data/votes.jsonl, deduped on (voterId, variantId); data files re-read on every request | No database to babysit; scripts can seal while the server runs, no restart |
| 13:05 | Pooled human results exclude the "judge" segment | Finals votes must not rewrite the lunch result; judges get their own column |
| 13:05 | Persona prompt includes "in real life most people scroll past most ads" | Deliberate counter to the documented positive skew of synthetic panels; disclosed in the README |
| 13:05 | Forecast script refuses to re-seal, or to seal once a round has votes | Protects the pre-registration claim |
| 13:06 | Ad visual: gpt-image-2 edit of a real pack photo, one per round, served via data/generated.json; backend owns apps/web/public/generated/ | Phone photos show floors and shoes; one visual per round keeps attribution on the copy |
| 13:08 | Product: EPIC Snax giant toastin' marshmallows (Richard's choice). Backend writes data/product.json from vision-read pack facts, checked against the pack | Fun lunch-crowd product; frees the frontend teammate |
| 13:10 | Admin token required for POST /challenger | Attendees share the public URL |
| 13:12 | Office-hours design review left to finish in the background; the office-hours closing ceremony is skipped | Building is the priority |
| 13:11 | Challenger lane (B4) started before the vote pipeline landed; it builds the pure evidence logic first | Keeps the 15:15 cut check reachable |
| 13:13 | Backend adds a fallback phone page at `/vote-lite` (new path, never touches the teammate's `/vote`) | Lunch at 14:00 is the only time the crowd is in one room; if `/vote` isn't live by 13:50, the QR points at `/vote-lite` |
| 13:14 | One-command seal ritual `scripts/seal-round.sh <round>`: generate (round 1), forecast, verify hash, commit, push | Pre-registration must land before the first vote; one command can't skip a step |
| 13:14 | Design review (35 findings, 6/10) triaged. Adopted before the seal: 25 personas per segment; sealed AI pick under equal weights; phrase-list truth guard; round 2 opens only after its seal is pushed; AI graded only against panel-segment voters; opening times instead of deleting test votes; single-lever challengers; no live results shown to the room while a round is open; `docs/analysis-plan.md` committed in the seal | These change what the seal proves, so they can't wait |
| 13:15 | Adopted for the runbook: live server runs from a git worktree pinned to the sealed commit, API without watch mode, `caffeinate` during voting, votes backed up every 2 min, challenger triggered only from localhost (avoids Cloudflare's ~100 s timeout) | One laptop and one tunnel are the single point of failure |
| 13:15 | Accepted, not fixed today: committer dates are self-reported (we cite GitHub's server push time instead); segment cells will mostly be "insufficient" at this room size (pooled results are the claim); the evidence card as "what an approver signs" is a hypothesis to check with an RGC organiser; force-push protection not configured | Time; each is disclosed in the README |

## For the frontend lane (from the design review)

1. Build `/dashboard` against `fixtures/results.json` before lunch if you can; 14:45–15:15 is then just live wiring.
2. While a round is open, room-visible screens show only the turnout counter (`/qr`). Reveal per-ad results after the round closes. Done-screen text: "Results are revealed after this round closes."
3. Build the round-2 offer into `/vote` before the 13:55 freeze, tested against `fixtures/challenger.json`, so round 2 needs no frontend deploy.
4. Trust map: show the AI-minus-human gap with its interval (gap from `ai - hi` to `ai - lo`) instead of a bare inside/outside badge.
5. Wording: "which execution won and what that suggests about its lever". Print "one execution per lever" and "90% intervals" on the evidence card.
6. Scorecard: "AI bet on X" is the sealed pick (`aiWinnerId`); show the chance rate next to the winner hit.
| 13:17 | Persona panel sees neutral labels "Ad 1..6" (per-persona order), never variant ids such as "r1-scarcity" (B2's call, accepted) | The ids name the persuasion lever, which would cue the model: a confound researchers would spot |
| 13:17 | Truth guard also allows numbers from product price, name and brand, and checks the CTA as well as headline and body (B2) | A price or size in the brand name is a true claim; CTAs can also carry claims |
| 13:17 | A judge-tagged vote always counts as judge, even from a phone used at lunch; judges never enter the post-stratification mix (B1) | A judge on a reused phone must not move a graded round |
| 13:17 | API returns full-precision numbers; the frontend formats them | Rounding at the source would bias MAE and intervals |
| 13:19 | Product locked to EPIC Snax Co. Giant Toastin' Marshmallows (300g, gluten free, produced in Belgium). Facts merged by hand from the vision readings of the front and back of the pack. The vegan "Plant Power" Toastin' variant is a different product, and its claims are excluded | The Giant pack contains pork gelatine; mixing in the vegan variant's facts would put a false claim in front of the room |
| 13:19 | No price in product.json (none printed on the pack); the value lever leans on "300g" and "giant" | Copy may only claim what the pack says |
| 13:19 | product.imageUrl points at the AI hero (/generated/hero-r1.png); raw phone photos are never published | Raw photos show a bystander's arm and the shelf |
| 13:22 | Phone-test votes before opensAt are excluded but still count for dedupe, so a test phone can't re-vote the same ads in that round. Team members don't vote anyway (analysis plan) | Keeps dedupe simple; no real voter is affected |
| 13:22 | fixtures/results.json regenerated so pooled rates use the 45 panel-segment voters (taps 30/16/21/25/23/19), matching live grading | Fixture mode must look exactly like live mode |
| 13:25 | Panel: 25 personas per segment (100 calls, ~85 s, ~84k tokens per round); the sealed pick uses equal-weight means rounded to 1e-6, and ties go to the earlier variant (B2) | Matches the analysis plan; the rounding stops float order from deciding a tie |
| 13:25 | The truth guard also bans "vegan", "vegetarian", "plant-based" and plural or alternate spellings of the claim phrases | The Giant pack contains pork gelatine; a sibling product is vegan |
| 13:25 | llm.ts: a missing key fails at once; separate retry budgets for rate limits and malformed replies (fixes found by the simplify gate) | A misreported "unreachable" error would have cost minutes at go-live |
| 13:27 | README drops the "37-60% on multi-factor replications" figure | It traces only to a vendor blog summary, not a primary study; researcher judges would ask for the source |
| 13:27 | .env.example ships an empty ADMIN_TOKEN (the placeholder was pushed briefly); the challenger refuses tokens shorter than 16 characters or equal to "change-me". The live token is 24 random characters | Attendees share the public URL |
| 13:27 | README claims about code are checked against the repo before submission (B5 wrote some from the specs) | Never submit a claim the code doesn't back |
| 13:28 | Round-1 ads read by the backend agent against the pack facts before sealing: all 6 claims true (300g, pink and white, gluten free, 0g fat, 84 kcal per 25g, produced in Belgium, s'mores recipe, the pack's "pillowy hunks" slogan); social proof and scarcity are framing, not fabricated stats | Human-in-the-loop truth check before the seal (analysis plan) |
| 13:29 | Round 1 sealed: sha256 5ef17f31 at 13:28:27 BST, AI pick r1-health_halo, commit 7e1e4d0 pushed 13:28:28 | Pre-registration done before any vote |
| 13:29 | The lunch QR points at `/vote-lite` (the backend fallback), because the teammate's `/vote` isn't pushed. The QR moves to `/vote` only if it lands and passes a phone test outside a voting window | 14:00 can't slip |
| 13:31 | /vote-lite behaviour (B6): both vote buttons share one neutral style; taps within 350 ms of a card appearing are ignored; a failed vote is queued and retried on load, every 10 s and after each success; 8 s request timeouts; a mid-deck refresh restarts the same order (the API dedupes); reopening starts any new round | A louder button would bias the tap rate; double taps and bad Wi-Fi must not lose or double votes |
| 13:31 | Consent line now names everything stored: a random ID, the group, the answers and the time each took | Consent must match what we store |
| 13:31 | apps/web/tsconfig.tsbuildinfo untracked and *.tsbuildinfo gitignored | Build cache churns between two laptops |
| 13:31 | Live restarts kill by port (3300, 8787), never by command line; `scripts/redeploy-live.sh` moves the live worktree to a new commit without touching the tunnel | Agents' test servers share command lines; a tunnel restart changes the QR URL |
| 13:34 | Product framing (Richard): the brand dashboard is the product: send one image, get many ad variants (each with its own AI image), simulate with the AI panel and/or test with real people, analytics pick the winner, iterate. The QR page is event plumbing, not product UI: show a QR image on a slide instead | Matches the gimmegimme-style vision; the QR screen read as the product |
| 13:34 | Each round-1 ad gets its own gpt-image-2 image generated from the one EPIC Snax front-of-pack photo (Variant.imageUrl, an optional contract field). The persona panel sees the same images (low detail), and round 1 is RE-SEALED with --force before any vote (none exist) | A stimulus change must be re-sealed so the AI is graded on what people actually see; the old seal 5ef17f31 stays in git history as superseded |
| 13:34 | Each person still sees all 6 ads one at a time (like = "Would tap", dislike = "Scroll past") | ~50 votes per ad instead of ~8 |
| 13:36 | Tunnel live: https://strike-breaking-must-porter.trycloudflare.com (QUIC, London edge); /vote-lite, /api/variants and /api/results all answer 200 through it | Verified end to end before lunch |
| 13:46 | **Pivot (Richard): Forkcast v2 = survival of the fittest for ads.** Upload one image → ~48 Meta-style variants (8 AI scenes × 6 copy levers) → AI panel screens → top 6 survive (Wilson lower bound, max 2 per lever) → survivors breed copy and scene mutations → repeat → real people validate the survivors → export to Meta (CSV). Meta Marketing API and Shopify product-photo optimisation are written up, not built. Specs rewritten (backend.md, frontend.md v2); paste-ready frontend prompt in docs/frontend-prompt.md; pitch and an honest judging-fit table in docs/pitch.md | Richard's product journey; keeps the sealed-AI-vs-people honesty that makes it non-obvious |
| 13:46 | Screening uses scene descriptions in text (~1.5k tokens per call); finalists are re-scored with real images (~8k tokens per call, measured by B2) | 48 ads × images per panel call would cost ~10× more and time out |
| 13:46 | QR page dropped from product UI; the room's QR goes on a slide | It read as the product |
