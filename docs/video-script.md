# Forkcast video script (v2, 1:58, hard cap 2:00)

Three moments, then the future: upload -> 48 ads, the simulated experiment, revise -> winner -> Export to Meta.
About 215 spoken words at 145 wpm is roughly 90 s of speech, so the rest is silence while the screen moves. Let it.
Everything shown is the finished EPIC Snax Giant Toastin' Marshmallows campaign. Never say "real CTR": every number is simulated.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00-0:14 | **Moment 1, upload.** The upload screen `/`. Drag the clean front-of-pack photo onto the drop zone, type "EPIC Snax", click Run. | "A campaign takes months, and it is one big bet. AI made ads free; knowing which one works is still slow. Forkcast is survival of the fittest for ads. One photo in." |
| 0:14-0:26 | The campaign page `/campaigns/[id]`. Stage "Reading the pack"; the fact chips appear under the photo: 300g, gluten free, produced in Belgium. | "It reads the pack first, so copy can only claim what is printed: 300 grams, gluten free, made in Belgium. A guard rejects any invented number." |
| 0:26-0:38 | Progress "Rendering scenes 5/8", then the Gen 0 grid fills with 48 Meta-feed cards. Hold on the full grid for 3 s. | "Eight scenes rendered by gpt-image-2, six behavioural levers of copy, from social proof to scarcity: forty-eight ads from that one photo." |
| 0:38-0:58 | **Moment 2, the experiment.** A "Simulated" label stays in shot. Play the 20-step delivery timeline: impression counters climb on a few cards while the rest stall. | "Now the experiment: simulated, with no ad spend. AI shoppers from four audiences give every ad a tap rate, and a Thompson-sampling bandit spends ten thousand impressions on those rates. Watch the budget flow to the winners." |
| 0:58-1:07 | Losers fade to grey, six cards stay lit as survivors. The rail reads "Gen 0: 48 ads -> 6 survive". | "Losers starve and fade. Six survive, two per lever at most, so one idea cannot fill the field." |
| 1:07-1:19 | **Moment 3, revise.** Click Evolve: 24 children appear with lineage lines to their parents. The rail adds "Gen 1: 30 ads"; the timeline plays again. | "The survivors breed: copy and scene mutations, twenty-four children, thirty ads in generation one. Same experiment again." |
| 1:19-1:31 | The winner panel: the winning ad, its family tree, its rate with interval, and a sha256 seal chip on each generation. | "One winner, with its family tree. Each generation's fitness table is sealed with sha256, so the AI is graded, not trusted." |
| 1:31-1:40 | Click **Export to Meta**. `meta.csv` opens in a spreadsheet: Campaign Name, Ad Set Name, Ad Name, Title, Body, Call to Action, Image URL, Link. | "Export to Meta: a bulk-import CSV of the survivors and the winner." |
| 1:40-1:58 | **The future.** Closing slide, two cards marked "next, not built": "Meta Marketing API: real CTR becomes the fitness" and "Shopify: product photos evolve on add-to-cart". End on the Forkcast name and repo URL. | "Next, Meta's Marketing API, so real click-through becomes the fitness. And Shopify, so product photos evolve on add-to-cart. Weeks of campaign work, in an afternoon. Forkcast: survival of the fittest for ads." |

## On-camera checklist

1. Say "simulated" whenever a tap rate or CTR is on screen, and keep the Simulated label in shot; never say "real CTR" or "Meta integration" (it is a CSV today).
2. Record from the finished demo campaign (`/campaigns/demo-epic`, fixture mode); if you cut the wait or replay a run, say "a recorded run", never "live".
3. Hide the address bar: the Evolve button needs `?admin=<token>`, and no token, `.env`, API key or terminal may appear in shot.
4. Upload the clean front-of-pack crop, never a raw shelf photo (they show bystanders' hands and shoes).
5. Record at 1440x900, browser zoom 100%, notifications off; open the CSV in a spreadsheet beforehand so Export to Meta lands in one click.
6. Rehearse to 1:50 or less, one take per moment, then check the sound and the 2:00 cap before you upload.
