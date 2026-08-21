# Scout research

Verified 2026-08-21. Every claim below carries its source. Where a primary page blocked automated fetch, that is stated rather than papered over.

## Source table

| Source | URL | Verified |
|---|---|---|
| Apple: PWA Home Screen web apps, EU reversal | theregister.com/2024/02/16/apple_web_apps | 2026-08-21 |
| iOS Web Push requirements (16.4+, home-screen only) | pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications | 2026-08-21 |
| Safari 7-day script-writable storage eviction, home-screen exemption | support.didomi.io/apple-adds-a-7-day-cap-on-all-script-writable-storage ; developer.apple.com/forums/thread/710157 | 2026-08-21 |
| WebAuthn RP ID rules (eTLD+1, not a Public Suffix List entry) | web.dev/articles/webauthn-rp-id ; corbado.com/blog/webauthn-relying-party-id-rpid-passkeys | 2026-08-21 |
| GDPR Art. 2(2)(c) household exemption | gdprhub.eu/Article_2_GDPR | 2026-08-21 |
| CJEU Lindqvist (C-101/01) and Rynes (C-212/13), limits of the exemption | edps.europa.eu/system/files/2021-06/21-06-09_case-law-digest_en.pdf | 2026-08-21 |
| MDCG 2025-4 (16 June 2025), wellness versus medical device software | thema-med.com/en/2025/07/17/medical-device-apps-who-is-responsible-mdcg-guide-2025-4-provides-clarity | 2026-08-21 |
| MDCG 2019-11 revised June 2025, Rule 11, intended purpose | hlc.com/en/publications/new-mdcg-guidance-clarifies-rules-for-medical-device-software-available-on-online-platforms | 2026-08-21 |
| EU AI Act Omnibus, Reg. (EU) 2026/1744, OJ 24 Jul 2026, in force 27 Jul 2026 | softwareimprovementgroup.com/blog/eu-ai-act-summary | 2026-08-21 |
| Uber Eats: no public consumer API, partner-only Marketplace/Direct APIs, scraping prohibited | uber.com/legal/en/document/?name=uber-eats-api-terms-of-use | 2026-08-21 |
| Uber deep-linking docs (Rides only, no Eats deep-link spec) | developer.uber.com/docs/deep-linking | 2026-08-21 |
| HelloFresh: no documented personal-use recipe API; terms page returned 403 to automated fetch, confirmed via secondary sources | divisionby0.de/blog/2022-12-26--HelloFresh-RecipeDownloader ; github.com/CNoetzel/HelloFresh-RecipeDownloader | 2026-08-21 |
| wger self-hosted fitness manager | github.com/wger-project/wger | 2026-08-21 |
| FitTrackee self-hosted activity tracker | pypi.org/project/fittrackee | 2026-08-21 |
| MacroFactor adaptive TDEE, Cronometer nutrient depth | calorie-trackers.com/reviews/macrofactor ; aifithub.io/articles/macrofactor-vs-cronometer-2026 | 2026-08-21 |
| Whoop / Oura / Hevy / Runna comparisons | mindsetandmegabytes.com/best-recovery-wearable-for-strength-training ; sensai.fit/blog/hevy-vs-strong-vs-fitbod-vs-jefit | 2026-08-21 |

## 1. Comparables and the bar

Three role models, one thing to take from each:

- **Apple Health / Fitness**: the trend-visualisation language. Weekly averages, rings, no daily-noise anxiety. This is the taste reference, and it is the right one for a body-composition scale whose daily numbers move with hydration.
- **MacroFactor**: the adaptive expenditure engine. It does not trust a static Mifflin-St Jeor number; it reverse-computes real expenditure from the observed weight trend and adjusts the calorie target. That is the algorithm shape for a 9-month trajectory, and it is buildable without any external service.
- **Withings Health Mate**: frictionless sync as the trust anchor. Step on the scale, see the trend. If the Withings import is not effortless and idempotent, nothing layered on top is believed.

Second rank, one idea each: Cronometer (micronutrient depth, relevant once lab data lands), Hevy (fastest workout logging in the category), Runna (plans that read as coach-written, which is the tone bar for the training coach), Whoop (readiness framing that turns a score into one concrete action).

What none of them do: merge scale, phone, validated lab work, calendar, nutrition plan and training coach into one private dashboard with no subscription and no cloud residency, where the AI layer sees only a task-scoped slice. That combination is the actual differentiator.

Self-hosted prior art. **wger** is the closest structural precedent: Docker-deployable, REST API, Open Food Facts nutrition. Its UI is community-generic rather than iOS-grade, and it has no wearable sync, no lab handling, no AI coaching. **FitTrackee** is GPX activity only, no mobile app, some features explicitly unstable. Neither touches blood work, calendar planning or push. The job here is wger's self-hosted philosophy at Apple Health's execution quality.

## 2. What users complain about, and what it implies

- Manual food-logging fatigue and database gaps. Implication: photo estimation and a small curated food table beat a giant unusable database.
- Adaptive targets that swing after one noisy weigh-in. Implication: smooth on a 7-day trend, never react to a single measurement.
- Duplicate and conflicting entries when a scale and a manual entry cover the same day. Implication: deduplication is a product feature, not a nicety.
- Recovery scores that never turn into an action. Implication: the coach proposes one plain change, not a number.
- Programs that log but never progress. Implication: the training plan must actually adapt week to week.
- Onboarding friction before any value appears. Implication: demo data must make the dashboard meaningful on first open.
- Mistrust of generic AI insight. Implication: every AI line is specific, dated, and marked as an estimate.

## 3. Platform requirements that bind the build

**Installability.** After Apple's February 2024 attempt to drop EU Home Screen web apps and the reversal in iOS 17.4, installable PWAs are fully supported. Manifest `display` must be `standalone` or `fullscreen`.

**Web Push.** iOS 16.4 or newer, and only for a PWA already added to the Home Screen. The Push API does not fire in a Safari tab. `Notification.requestPermission()` must run synchronously inside a user gesture. Standard VAPID key pair. Build order consequence: installability ships before push is testable at all.

**Storage eviction.** Safari clears script-writable storage after 7 unused days for ordinary tabs. A Home Screen installed PWA is exempt. Consequence: install-first is a requirement, not a nicety, for anything offline.

**WebAuthn RP ID.** The RP ID must equal the origin's effective domain or be a registrable suffix of it, and must not itself be a Public Suffix List entry. Tailscale registers `ts.net`; each tailnet gets a subdomain such as `tailda76d6.ts.net`. Practical rule: use the full assigned hostname (`lamberts-mac-mini.tailda76d6.ts.net`) as the RP ID, never a bare `ts.net`. No Tailscale doc states the PSL position explicitly, so verify empirically at first passkey enrolment and make the value configurable, which GOAL.md already requires.

**Workout screen.** SpeechSynthesis and Wake Lock are supported in current Safari. iOS suspends JS timers when the screen locks or the app backgrounds; Wake Lock prevents screen-off but does not guarantee background execution. Consequence: keep the screen awake during a guided session and reconcile elapsed time from wall-clock timestamps rather than trusting interval ticks.

## 4. Legal obligations that actually attach

**GDPR.** Article 2(2)(c) exempts purely personal or household processing with no professional or commercial purpose. Lindqvist and Rynes narrow it: the exemption breaks when data becomes accessible to an indefinite number of people or reaches into a public context. A single-owner app on a private tailnet, never shared, stays inside the exemption for the owner's own data. The exemption does not extend to the third parties that receive data: Withings, Google, Anthropic and Apple remain bound independently for whatever they receive. Consequence for the build: data minimisation toward third parties is the real obligation, and it is already a hard constraint.

**EU MDR.** MDCG 2025-4 (16 June 2025) separates CE-marked medical device software from wellness apps with no medical intended purpose. MDCG 2019-11 revised June 2025 sharpens Rule 11 and makes a narrow, explicit statement of intended purpose the classification test. Safe wording for lab explanations: give general educational reference-range context, attribute it to public sources, avoid diagnostic or treatment language, invite a professional. Never phrase output as an assessment of the user's condition or a recommendation of clinical action. That crosses into medical intended purpose regardless of accuracy.

**EU AI Act.** Regulation (EU) 2026/1744 (Omnibus, OJ 24 July 2026, in force 27 July 2026) moved high-risk deadlines: Annex I embedded systems to 2 August 2028, standalone Annex III systems to 2 December 2027. A single-owner coaching AI advising its own author is not an Annex III listed use. The safe posture is the one GOAL.md already mandates: every AI output is an editable proposal the owner confirms.

**What this app must never claim**: that it diagnoses, that it assesses a condition, that it replaces a doctor, that a lab value is normal or abnormal for this person, that a number is clinically precise.

## 5. Third-party terms bounding two features

**HelloFresh.** No documented public API or personal-use recipe endpoint. Every working importer found is an unofficial scraper against undocumented internal endpoints. The terms page returned 403 to automated fetch; secondary sources confirm the standard prohibition on automated and bulk access. Safe scope: the owner supplies one artifact they already have (a URL they paste, a PDF they downloaded, a photo of their own card, or manual entry), and the app parses that single artifact locally. No standing scraper, no crawl, no stored HelloFresh credentials.

**Uber Eats.** Confirmed: no public consumer API and no documented deep-link or search-URL format. Uber's deep-linking docs cover Rides only. Marketplace and Direct APIs are partner-only. Terms prohibit scraping and bulk collection. Safe scope: link out to the ubereats.com search or home page, never construct an item-level deep link, never scrape menus or prices, never claim nutrition data the app does not have.

## 6. The opening

The axis none of the incumbents compete on: total data ownership with no recurring subscription, fusing scale, phone, lab work, calendar and coaching that today live in five separate paid apps into one private dashboard that costs nothing per month and never leaves the owner's machine.
