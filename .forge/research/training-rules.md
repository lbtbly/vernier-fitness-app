# Heart-rate zones and progression rules

Research date 2026-08-21. Subject: one man, 38, 89 kg, beginner to intermediate, no reported pain, no live heart-rate tracking in the app. Every rule below carries an evidence grade so the build knows what it may assert and what it must hedge.

Grades: **[A]** RCT or meta-analytic. **[B]** guideline-endorsed, weaker underneath. **[C]** convention, no controlled evidence. **[X]** do not ship.

---

# Part 1. Heart-rate zones

## 1.1 The estimators at age 38

| Formula | Citation | HRmax at 38 | Published error |
|---|---|---|---|
| 220 − age | Fox, Naughton, Haskell, Ann Clin Res 1971;3(6):404-432, PMID 4945367, no DOI exists | 182 | None ever published. No regression was run. Robergs' refit of Fox's own data: 215.4 − 0.9147a, r=0.51, Sxy 21 |
| 208 − 0.7a (Tanaka) | J Am Coll Cardiol 2001;37(1):153-6, DOI 10.1016/S0735-1097(00)01054-8 | 181 | No SEE stated. "SD 7 to 11 bpm", discussion ~10. Meta of 351 studies, 18,712 subjects, r = −0.90, cross-validation n=514 |
| 207 − 0.7a (Gellish) | MSSE 2007;39(5):822-9, DOI 10.1097/mss.0b013e31803349c6 | 180 | None verifiable. n=132, 908 tests. The circulating ±5-8 figures are uncited. Do not cite one |
| 211 − 0.64a (Nes, HUNT) | Scand J Med Sci Sports 2013;23(6):697-704, DOI 10.1111/j.1600-0838.2012.01445.x | 187 | SEE 10.8, stated twice. n=3320 |

Spread 180 to 187, seven beats. Individual error 10 to 12 bpm SEE, 95% limits of agreement about ±20.

## 1.2 Why 220 minus age is only a rough guide

Robergs and Landwehr, Journal of Exercise Physiology Online 2002;5(2):1-10, no DOI, https://www.asep.org/asep/asep/Robergs2.pdf

The SEE figure is Sxy = 7-11 b/min, verbatim: "the large error inherent in the estimation of HRmax (Sxy=7-11 b/min)". Sxy is a standard error of estimate, not a standard deviation. Robergs reports no SEE for 220 − age itself, and there is no 12-15 figure anywhere in that paper; that figure is Sarzynski 2013 (DOI 10.1002/ajhb.22431, Fox SEE 12.4, Tanaka 11.4) or Arena 2016 (DOI 10.1016/j.ahj.2015.12.006, SEE 11.35, LoA +25.31 / −24.67).

Fox 1971 was a heart-disease review. Its figure held about 35 points from about 11 sources, some including people with cardiovascular disease, smokers, and people on cardiac medication. Its legend, verbatim: "no single line will adequately represent the data... The formula maximum heart rate=220-age in years defines a line not far from many of the data points."

Robergs' verdicts: "no scientific merit"; "Currently, there is no acceptable method to estimate HRmax"; and a usability threshold, "errors <=8 b/min are likely to be acceptable" for setting zones. Tanaka notes 220 − age overestimates in the young, crosses at 40, then underestimates. At 38 the two nearly coincide by coincidence.

## 1.3 Use Tanaka. HRmax 181.

Decided by the one validation study centred on this age. Martin, Lindsey, Gerrity, Ambegaonkar, PLoS One 2025;20(10):e0335842, DOI 10.1371/journal.pone.0335842. n=230, mean age 38.5 ± 12.3.

| Equation | Bias | MAE | RMSE | ICC |
|---|---|---|---|---|
| Tanaka | +0.71 | 7.40 best | 9.21 | 0.61 |
| Gellish | −0.29 | 7.45 | 9.19 best | 0.61 |
| Fox | +1.17 | 8.44 | 10.28 | 0.64 best |
| Nes | +6.02 worst | 8.62 | 10.94 worst | 0.50 worst |

Verbatim: limits of agreement "were wide across all equations (±18-24 bpm)... could shift an individual across two heart rate training zones." Do not default to Nes at this age.

True HRmax 95% range is roughly 162 to 201. The moderate-to-vigorous cut displays as 139 but truly sits somewhere in 124 to 155. **Show ranges, never a point target.**

## 1.4 ACSM intensity table (Garber 2011, Table 5)

MSSE 2011;43(7):1334-1359, DOI 10.1249/MSS.0b013e318213fefb.

| Intensity | %HRR / %VO2R | %HRmax | %VO2max | RPE 6-20 | METs age 20-39 | %1RM |
|---|---|---|---|---|---|---|
| Very light | <30 | <57 | <37 | <9 | <2.4 | <30 |
| Light | 30-39 | 57-63 | 37-45 | 9-11 | 2.4-4.7 | 30-49 |
| Moderate | 40-59 | 64-76 | 46-63 | 12-13 | 4.8-7.1 | 50-69 |
| Vigorous | 60-89 | 77-95 | 64-90 | 14-17 | 7.2-10.1 | 70-84 |
| Near-max to max | >=90 | >=96 | >=91 | >=18 | >=10.2 | >=85 |

%HRR and %VO2R share one column: the same number. Identical across GETP 8th, 10th and 11th editions. Beware a rival three-category table (Light 20-39 %HRR) from the 2008 Physical Activity Guidelines Advisory Committee Report.

Correction worth carrying: FITT-VP is not in Garber 2011, where "FITT" appears zero times. Garber uses Frequency, Intensity, Time, Type, Volume, Pattern, Progression. FITT-VP is GETP 9th edition onward. The current GETP is the 12th edition, 24 March 2025, ISBN 9781975219208.

## 1.5 Karvonen, and what he did not publish

Target HR = HRrest + (intensity × (HRmax − HRrest)). Ann Med Exp Biol Fenn 1957;35(3):307-315, PMID 13470504, no DOI exists.

Karvonen never published 220 − age. Robergs contacted him in August 2000; he confirmed it and pointed to Astrand, who in September 2000 also confirmed he never published data deriving it, saying only that he had called it "a convenient method to use" in talks. Garber 2011 never cites Karvonen and never prints this formula. Do not repeat the "six medical students" detail; it is unverified.

Why %HRR is preferred: Swain and Leutholtz, MSSE 1997;29(3):410-414, DOI 10.1097/00005768-199703000-00018 (%HRR against %VO2max: intercept −11.6±1.0, slope 1.12±0.01, both P<0.001 from 0 and 1; against %VO2R: intercept −0.1±0.6, slope 1.00±0.01, "not distinguishable from the line of identity"). Swain et al., MSSE 1998;30(2):318-321, DOI 10.1097/00005768-199802000-00022.

**Cardiac drift caveat, encode this.** PeerJ 2022, DOI 10.7717/peerj.13190. %HRR is close to %VO2R at 15 min (0.7 points, p=0.717) but %HRR exceeds %VO2R by 6.7 points at 45 min (p=0.009). Past roughly 30 minutes heart rate drifts up the band with no change in intensity. Do not tell the user they sped up. Do not have them slow down to hold a number. Widen the band after 30 minutes or switch to the talk test.

## 1.6 Consumer five-zone models are conventions, not findings

| Vendor | Z1 | Z2 | Z3 | Z4 | Z5 | Anchor |
|---|---|---|---|---|---|---|
| Polar | 50-60 | 60-70 | 70-80 | 80-90 | 90-100 | HRmax, "220-your age" |
| Garmin | 50-60 | 60-70 | 70-80 | 80-90 | 90-100 | %HRmax default, %HRR or %LTHR opt-in |
| COROS | six zones, lactate-threshold anchored: <80 / 80-90 / 90-95 / 95-102 / 102-106 / >106 %LTHR | | | | | LT default. Rejects 220 − age, recommends 207 − 0.7a |
| Strava | 50-65 | 65-80 | 80-85 | 85-92 | 92-100 | "220 minus age", 190 default with no age |

Polar and Garmin publish identical numbers with zero research citations. COROS shows the incoherence in its own docs: one athlete's Zone 2 is 139-157 by LT, 131-155 by HRR, 98-118 by MaxHR.

The decisive citation: Iannetta, Inglis, Mattu, Fontana, Pogliaghi, Keir, Murias, MSSE 2020;52(2):466-473, DOI 10.1249/MSS.0000000000002147. n=100, maximal lactate steady state verified. Verbatim: "The large ranges... %HRmax (LT, 60%-90%; MLSS, 75%-97%)... conform poorly to exercise intensity domains and thus do not adequately control the metabolic stimulus." The first threshold falls anywhere from 60% to 90% of HRmax, and every vendor fixes Z2 at 60-70%.

It changes outcomes, not just labels: Wolpern 2015, DOI 10.1186/s13102-015-0011-z, 42 sedentary adults, 12 weeks, responder rate 41.7% by %HRR against 100% by threshold anchoring.

## 1.7 The bpm tables for this user, HRmax 181

**A. %HRmax, used when resting heart rate is not known**

| ACSM band | %HRmax | bpm | Consumer | %HRmax | bpm |
|---|---|---|---|---|---|
| Light | 57-63 | 103-114 | Z1 | 50-60 | 90-109 |
| Moderate | 64-76 | 116-138 | Z2 | 60-70 | 109-127 |
| Vigorous | 77-95 | 139-172 | Z3 | 70-80 | 127-145 |
| Near-max | >=96 | 174-181 | Z4 | 80-90 | 145-163 |
| | | | Z5 | 90-100 | 163-181 |

**B. %HRR, preferred whenever resting heart rate is known.** bpm = HRrest + pct × (181 − HRrest)

| HRrest | HRR | Light | Moderate | Vigorous | Near-max |
|---|---|---|---|---|---|
| 55 | 126 | 93-104 | 105-129 | 131-167 | 168+ |
| 60 | 121 | 96-107 | 108-131 | 133-168 | 169+ |
| 65 | 116 | 100-110 | 111-133 | 135-168 | 169+ |
| 70 | 111 | 103-113 | 114-135 | 137-169 | 170+ |

The two methods disagree: at HRrest 60, moderate is 108-131 by HRR and 116-138 by HRmax. **Pick one per user and never show both.** Prefer %HRR.

The American Heart Association also disagrees with ACSM. heart.org "Target Heart Rates Chart", last reviewed 12 Aug 2024: moderate is "about 50-70% of maximum heart rate", vigorous "about 70-85%", using 220 − age. At 38 that is moderate 91-127 and vigorous 127-155, against ACSM's 116-138 and 139-172. Also: "If you're just starting out, aim for the lower range of your target zone (50%)."

## 1.8 What each zone is for

- Light, 103-114 or 96-107: warm-up, cool-down, recovery, and the working intensity for a genuinely deconditioned start.
- Moderate, 116-138 or 108-131: where the 150 min/week guideline lives. Conversational, sustainable, the default.
- Vigorous, 139-172 or 133-168: the 75 min/week equivalent. Same benefit in half the time, more recovery cost.
- Near-maximal, 174+ or 169+: intervals only, short bouts, not month one.
- Z1 90-109 priming. Z2 109-127 aerobic base, the volume zone. Z3 127-145 the grey zone, and Polar's own copy warns it "may lead to plateauing... fatigue without maximizing aerobic gains". Z4 145-163 threshold. Z5 163-181 anaerobic, minutes not tens of minutes.

## 1.9 The talk test: grade [C], ship it as a ceiling

With no live heart-rate tracking this is the only in-session cue. The bands are pre-session targets and post-session review; the talk test is the live control.

NHS wording, verbatim, reviewed 22 May 2024: moderate means "you can still talk, but not sing"; vigorous means "you will not be able to say more than a few words without pausing for breath."

Why only [C]: ACSM declines to endorse both options. Garber 2011, verbatim: "the evidence is insufficient to support using these methods as a primary method of exercise prescription." ACSM/ESSA 2025 (Bishop et al., MSSE 57(11):2599-2613, DOI 10.1249/MSS.0000000000003795), verbatim: "we are not able to recommend the markers that appear in many exercise guidelines (e.g., %VO2max, %HRmax, %HRR, and METs)... it did not seem appropriate to recommend 'flawed but practical' markers." On the talk test: "little evidence that it is an accurate method... If used conservatively, it may be used... to try and limit cardiorespiratory exercise to below the High-intensity training category."

So ship the sanctioned framing, a ceiling rather than a selector. In-session copy: "If you can't get out a few words, ease off." No calibration, no wearable, no formula.

Supporting the mapping: Bok, Rakovac, Foster, Sports Med 2022;52(9):2085-2109, DOI 10.1007/s40279-022-01690-3 (PubMed's DOI field for this record is corrupt and lists 10.1123/pes.3.1.21). Verbatim: "Equivocal stage of the TT, RPE of 10-11... reflective of the ventilatory threshold, while negative stage of the TT, RPE of 13-15... reflective of the respiratory compensation threshold." Also Woltmann 2015, DOI 10.1519/JSC.0000000000000811, and Foster 2008, DOI 10.1097/01.HCR.0000311504.41775.78.

Citation trap: Persinger, Foster, Gibson, Fater, Porcari, MSSE 2004;36(9):1632-1636 must be cited **by PMID 15354048 only**. No valid DOI exists. The circulated 10.1249/01.MSS.0000139851.32476.61 returns 404 and is absent from Crossref, and the publisher's own citation_doi tag resolves to a different paper entirely.

## 1.10 Weekly targets

At least 150 min/week moderate or 75 min/week vigorous. 500-1000 MET-min/week [C]. At least 7000 steps/day [B]. Bouts of 10 minutes or more, though "<10 min may yield favorable adaptations in very deconditioned individuals" [B]. Garber 2011 Table 2, and the Physical Activity Guidelines 2nd edition 2018, which is still current; no 3rd edition exists.

At 89 kg, 1 MET is about 89 kcal/h, so moderate work (4.8-7.1 METs) is roughly 430-630 kcal/h. Body mass affects only the MET-to-energy conversion. It has no bearing on the heart-rate bands.

---

# Part 2. Progression rules

## 2.0 ACSM replaced the 2009 position stand in March 2026

Currier, D'Souza, Fiatarone Singh, Schoenfeld, Phillips et al., MSSE 2026 Apr;58(4):851-872, DOI 10.1249/MSS.0000000000003897, PMCID PMC12965823, open access. 137 systematic reviews, more than 30,000 participants. Its own abstract says it "updates the ACSM 2009 Position Stand, 'Progression models in resistance training for healthy adults.'"

Verbatim: "RT did not influence hypertrophy performed with low (1 d/wk) versus high (>5 d/wk) frequency when total volume was equated; low (30% 1RM) to high (100% 1RM) loads; contractions to muscle failure/fatigue; blood flow restriction; fast (0.5 s) versus slow (8 s) repetitions; power training techniques; periodization; or exercise order."

Verbatim: "progression is not necessary to achieve beneficial outcomes."

Verbatim: "novice lifters complete two to three full-body sessions per week for muscle hypertrophy", graded at the highest possible quality of evidence.

Load from 30% to 100% of 1RM is irrelevant to hypertrophy. **Calisthenics' fixed load is not a limitation.** This is four months old and the strongest card the app holds.

## 2.1 Core prescription

| Rule | Value | When | Grade |
|---|---|---|---|
| Frequency | 2-3 full-body sessions/week, at least 48 h between sessions for the same muscle | Always | [A] |
| Sets | 1-3 per movement pattern to start | Weeks 1-8 | [A] Androulakis-Korakakis 2020, DOI 10.1007/s40279-019-01236-0: "A single set performed minimum 1 time and maximum 3 times per week was sufficient" |
| Reps | 8-12, or 10-15 for a beginner, or 15-20 for endurance | Always | [A] |
| Rest | 60-120 s. Never below 60 s | Always | [A] Grgic 2018, DOI 10.1007/s40279-017-0788-x: "untrained individuals... 60-120 s are sufficient" |
| Range of motion | Full ROM by default | Always | [A] Pallares 2021, DOI 10.1111/sms.14006, ES 0.56, p=0.004 |
| Working-set effort | RIR 1-3, RPE 7-9 | Week 5 onward | [A] |
| Minimum effective aerobic intensity | About 30% VO2R when VO2max is under 40, about 45% when at or above 40 | Deconditioned start | [A] Swain and Franklin, MSSE 2002;34(1):152-157, DOI 10.1097/00005768-200201000-00023 |
| Cardio ramp | +5-10 min per session every 1-2 weeks for 4-6 weeks, then frequency, then intensity, over 4-8 months | Weeks 1-6, then months 2-8 | [B] GETP 12th ed. Not in Garber 2011 |

## 2.2 The 2-10 percent rule, and its provenance

ACSM 2009, MSSE 2009;41(3):687-708, DOI 10.1249/MSS.0b013e3181915670. Novice means "no RT experience or... have not trained for several years". Intermediate means "approximately 6 months of consistent RT experience".

Verbatim, evidence category B: "a 2-10% (lower percent for small muscle mass exercises, higher percent increase for large muscle mass exercises) increase in load be applied when the individual can perform the current workload for one to two repetitions over the desired number on two consecutive training sessions."

ACSM gives no numeric small-versus-large split; the "2-5% / 5-10%" version circulating online is not theirs. The sole citation is Feigenbaum and Pollock 1999, a review, not a trial. Flag it in the app as superseded by the 2026 stand.

## 2.3 The 2-for-2 rule

Advance one ladder step when the user gets 2 or more reps over target on the last set, in two consecutive sessions. Grade **[C], convention**.

Current source is Haff and Triplett, eds., Essentials of Strength Training and Conditioning, 4th ed, Human Kinetics 2016, ISBN 978-1-4925-0162-6, Ch. 17, p. 459 (5th ed March 2026, ISBN 9781718216273, Ch. 18). Baechle and Earle have not edited it since the 3rd edition in 2008.

Verbatim: "If the athlete can perform two or more repetitions over his or her assigned repetition goal for a given exercise in the last set in two consecutive workouts, weight should be added." Its own source is a coaching book, not a trial.

NSCA's increment table is absolute, not percentage: less trained, upper body 1-2 kg and lower body 2-4 kg. The percentage alternative is a single 2.5-10% band.

## 2.4 Weekly volume progression, honestly

| Rule | Value | Grade |
|---|---|---|
| Rep progression cap | +1-2 reps per set per week | [C]. No direct evidence exists |
| Loaded equivalent | +2-10% | [B], ACSM's own grade B, from a 1999 review, dropped in 2026 |
| Volume progression | +2.5-5% | [C], textbook |

No trial establishes an optimal weekly progression rate for beginners. The 2-for-2 trigger is defensible. The magnitude is convention. Say so in the app's own wording.

## 2.5 The 10 percent rule is falsified

"The 10% rule reduces injury risk" is **[X]**. It was never tested when it was popularised: the GRONORUN protocol's own introduction says "the 10% rule [23]. However, so far no studies have examined the effect", and reference 23 is a narrative review that itself calls the field expert opinion.

Buist et al., Am J Sports Med 2008;36(1):33-39, DOI 10.1177/0363546507307505. n=532 novice runners, randomised. Roughly 10.5%/week against roughly 24%/week. Injury rate 20.8% against 20.3%. Chi-square 0.016, df 1, **P=.90**. Verbatim: "no effect of a graded training program... applying the 10% rule."

Nielsen et al., JOSPT 2014;44(10):739-747, DOI 10.2519/jospt.2014.5164, was an explorative cohort, n=874. Its primary result, verbatim: "no statistically significant differences in injury rates were found across the 3 exposure groups." The famous number is a post-hoc subgroup, over 30% against under 10%, HR 1.59, 95% CI 0.96-2.66, **P=.07, not significant**.

Every running-progression RCT is null: Buist 2008, Bredeweg 2012 (DOI 10.1136/bjsports-2012-091397, 15.2% vs 16.8%, p=0.69), Ramskov 2018 (DOI 10.1136/bmjsem-2017-000333).

**What does hold is per-session, not per-week.** Frandsen, Hulme, Parner, Nielsen, Br J Sports Med 2025;59(17):1203-1210, DOI 10.1136/bjsports-2024-109380, PMCID PMC12421110. n=5,205, 588,071 sessions.

| Exposure | >10-30% | >30-100% | >100% |
|---|---|---|---|
| Session against longest run in 30 days | HRR 1.64 (1.31-2.05) | 1.52 (1.16-2.00) | 2.28 (1.50-3.48) |
| Weekly acute-chronic ratio | 0.94, p=0.47 | 0.87, p=0.08 | 0.75 (0.59-0.96), protective |
| Week to week | 0.97, p=0.75 | 0.88, p=0.11 | 0.91, p=0.29 |

Verbatim: "Spikes in the ACWR... and... the week-to-week ratio approach were not associated with an increased injury rate."

So the shippable rule is a per-session cap at about 110% of the longest session in the past 30 days, grade [A].

## 2.6 Acute-chronic workload ratio: do not ship a gauge

For: Gabbett, BJSM 2016;50(5):273-280, DOI 10.1136/bjsports-2015-095788, which names 0.8-1.3 the "sweet spot" and 1.5 and above the "danger zone". Its famous 21% and 49% figures are labelled "(unpublished observations)".

Against: Impellizzeri, Woodcock, Coutts, Fanchini, McCall, Vigotsky, Sports Med 2021;51(3):581-592, DOI 10.1007/s40279-020-01378-6. A **random** denominator produced odds ratios of the same size as the real one (mean 1.89, 95% CI 1.42-2.70). Verbatim: "neither ACWR nor AL alone confer a meaningful predictive advantage to an intercept-only model, even within the training sample... These results disprove the etiological theory... We suggest ACWR be dismissed as a framework and model."

In running it inverts outright: Nakaoka et al., Sports Med 2021;51(11):2437-2447, DOI 10.1007/s40279-021-01483-0, found a ratio under 0.70 gave 9.6% injury probability and over 1.38 gave 1.3%.

And it is not self-consistent: Cloosterman et al., J Athl Train 2024;59(10):1028-1034, DOI 10.4085/1062-6050-0430.23, found 43.0% of sessions flagged by one method were not flagged by the others.

Ship a fact instead: "This session is 22% longer than your longest in 30 days." Attach no risk number to it.

## 2.7 Deload

| Component | Value | Grade |
|---|---|---|
| Trigger | Reactive. Any two of: performance down two consecutive sessions, RIR at a fixed rep target risen by 2 or more, unusual joint ache, sleep or motivation degraded | [C] |
| Duration | One week | [C] |
| Prescription | Cut sets 30-50%. Keep frequency, keep exercise selection, add 2-3 RIR | [C] |
| Complete rest | Do not prescribe | [A] |
| "Deloads improve long-term results" | | [X] |

No RCT shows scheduled deloads improve long-term outcomes. Both controlled trials are null to negative. Coleman et al., PeerJ 2024;12:e16777, DOI 10.7717/peerj.16777: n=39, one week of complete abstention at week 5, hypertrophy null, squat 1RM −3.6 kg (95% CI −10.4, 3.2), posterior probability favouring continuous training 0.851. A full week off cost strength and bought nothing. Pancar et al., Sci Rep 2026;16:10299, DOI 10.1038/s41598-026-40612-5: n=19 untrained, about 18% volume cut, all interactions non-significant. Non-inferiority, not benefit.

Practice surveys only: Bell et al., Front Sports Act Living 2022;4:1073223 (18 coaches, every 4-6 weeks, 5-7 days) and Rogerson et al., Sports Med Open 2024;10(1):26 (n=246, 6.4 ± 1.7 days every 5.6 ± 2.3 weeks, sets down 78.9%, frequency unchanged in 63.0%, and 65.0% believed they could progress without deloads).

**Frame it in-app as fatigue and adherence management, never as a performance intervention.**

## 2.8 RPE and reps-in-reserve

Zourdos et al., J Strength Cond Res 2016;30(1):267-275, DOI 10.1519/JSC.0000000000001049.

The scale runs 1 to 10 on one question: how many more reps could you have done? A 10 is maximum effort with nothing left. 9.5 means no more reps but you could have handled more weight. From 9 down, each whole point adds a rep in reserve: 9 is one left, 8 is two, 7 is three. Half points cover the in-between judgments. 5 to 6 is a loose four to six in reserve. 3 to 4 is light effort, 1 to 2 little to none.

n=29. RPE against bar velocity: experienced r = −0.88 (p<0.001), novice r = −0.77 (p=0.001). Experienced lifters recorded a higher RPE at a true 1RM than novices (p=0.023): novices did not recognise maximal effort at it.

Accuracy governs what the app may prescribe. Halperin, Malleron, Har-Nir, Androulakis-Korakakis, Wolf, Fisher, Steele, Sports Med 2022;52(2):377-390, DOI 10.1007/s40279-021-01559-x, 13 datasets, 414 participants: people underpredict by 0.95 reps (95% CI 0.17, 1.73), better closer to failure and in sets of 12 or fewer, and "Training status did not seem to influence prediction accuracy." Zourdos et al., JSCR 2021;35(Suppl 1):S158-S165, DOI 10.1519/JSC.0000000000002995: error at 9 RPE is 2.05 ± 1.73 reps, at 7 RPE 3.65 ± 2.46, at 5 RPE 5.15 ± 2.92.

| Rule | Value | When | Grade |
|---|---|---|---|
| Working-set target | RIR 1-3 | Week 5 onward | [A] |
| Familiarisation | Log RIR, do not prescribe from it | Weeks 1-4 | [B] |
| Novice bias correction | Assume they stop 1-2 reps early | Always | [A] |
| RIR 4 or more as a target | | | [X], about ±5 reps of error |

ACSM/ESSA 2025 endorses RIR over %1RM: "we do not recommend prescribing exercise intensity based on %1RM... Instead, we recommend using RIR." Their mapping: low 7-8 RIR, moderate 4-6, high 2-3, very high under 2.

The RCT base is thinner than the marketing: Helms 2018, Front Physiol 9:247, between-group non-significant; Graham and Cleather 2021, DOI 10.1519/JSC.0000000000003164, where the authors attribute their result to the autoregulated group simply training heavier; Huang et al., J Exerc Sci Fit 2025;23(4):360-369, a network meta-analysis of 19 RCTs where every RPE-against-percentage confidence interval crosses zero. Greig et al., Sports Med 2020;50(11):1873-1887: "an adjunct to existing practice, rather than as an alternative or replacement."

## 2.9 Bodyweight progression levers, in order

| # | Lever | Grade | Evidence |
|---|---|---|---|
| 1 | Reps | [A] | Plotkin, Coleman, Van Every, Vigotsky, Schoenfeld, PeerJ 2022;10:e14142, DOI 10.7717/peerj.14142. n=43, 8 weeks, load against reps, no meaningful differences. "particularly useful when greater loads may not be available" |
| 2 | Sets, up to 3, higher only for hypertrophy | [A] | Schoenfeld 2017, ACSM 2026 |
| 3 | Leverage, a harder variation | [A] | Kotarsky, Christensen, Miller, Hackney, JSCR 2018;32(3):651-659, DOI 10.1519/JSC.0000000000002345 (the circulating ...002478 is wrong). Both push-up and bench groups gained 1RM, p<0.001, no thickness difference |
| 4 | Unilateral work | [B] | ACSM 2009 endorses it; no isolated trial |
| 5 | Tempo, within 0.5-8 s | [B] | Schoenfeld, Ogborn, Krieger, Sports Med 2015;45(4):577-585, DOI 10.1007/s40279-015-0304-0: "similar... 0.5 to 8 s", over 10 s inferior. A difficulty dial, not a growth lever |
| 6 | Density, last resort, never under 60 s | [C], counterproductive later | Grgic 2018, Schoenfeld 2016 |

Failure is not required, which is how a fixed-load movement still reaches a stimulus: Refalo, Helms, Trexler, Hamilton, Fyfe, Sports Med 2023;53(3):649-665, DOI 10.1007/s40279-022-01784-y. Set failure against non-failure ES 0.19 (95% CI 0.00, 0.37), p=0.045, trivial; momentary failure against non-failure ES 0.12 (95% CI −0.13, 0.37), p=0.343, null.

## 2.10 Volume landmarks

Schoenfeld, Ogborn, Krieger, J Sports Sci 2017;35(11):1073-1082, DOI 10.1080/02640414.2016.1210197. 15 studies, 34 treatment groups. Continuous: each set adds ES +0.023, +0.37% (P=0.002). Higher against lower: ES difference 0.241, 3.9% (P=0.03). The three-level split (<5, 5-9, 10+ sets per muscle) was **only a trend, P=0.074**. Do not ship per-band percentages; the circulated numbers are unsourced and that subgroup was not significant.

| Population | Sets per muscle per week | Grade |
|---|---|---|
| Untrained, first 8-12 weeks | about 1-6 | [A] |
| Intermediate, hypertrophy | 10 or more | [A] ACSM 2026 |
| Trained men 18-35 | 12-20 | [B] Baz-Valle 2022. Not a novice number |

State of the art: Pelland, Remmert, Robinson, Hinson, Zourdos, Sports Med 2026;56(2):481-505, DOI 10.1007/s40279-025-02344-w. 67 studies, 2,058 participants. Volume slope 100% posterior probability positive for both strength and hypertrophy, with diminishing returns, more pronounced for strength; frequency negligible for hypertrophy.

## 2.11 Stop rules and red flags

| Rule | Trigger | Grade |
|---|---|---|
| Onboarding gate | Any listed symptom, or known cardiovascular, metabolic or renal disease, means clearance first | [B] |
| Stop the session | Any listed symptom at rest or during activity | [B] |
| Pain rule | At most 5/10 during, subsides by the next morning, no week-to-week increase | [A] |
| Auto-deload, never auto-advance | Pain at the same site in two consecutive sessions | [C] |
| Urgent care | Pain plus swelling plus weakness plus dark, tea or cola coloured urine | [A] |
| "Prevent injuries", any risk score | | [X] |

Riebe, Franklin, Thompson, Garber, Whitfield, Magal, Pescatello, MSSE 2015;47(11):2473-2479, DOI 10.1249/MSS.0000000000000664, erratum MSSE 2016;48(3):579. That paper is paywalled; cite the free permission-granted verbatim reproduction instead: Whitfield, Riebe, Magal, Liguori, MSSE 2017;49(10):2056-2063, DOI 10.1249/MSS.0000000000001331, PMCID PMC7059860.

Three inputs: current activity level; symptoms or known cardiovascular, metabolic or renal disease; desired intensity. Risk-factor counting was removed, verbatim: "risk factor profiling is no longer included... may be overly conservative and unnecessarily refer adults for medical clearance."

Symptom list, verbatim, "At rest or during activity": pain or discomfort in the chest, neck, jaw, arms or other areas that may result from ischemia; shortness of breath at rest or with mild exertion; dizziness or syncope; orthopnea or paroxysmal nocturnal dyspnea; ankle edema; palpitations or tachycardia; intermittent claudication; known heart murmur; unusual fatigue or shortness of breath with usual activities.

For an asymptomatic, disease-free, inactive 38-year-old the guidance is, verbatim: "recommended to begin light to moderate intensity physical exercise without clearance, and gradually progress."

**PAR-Q+ is a licensing blocker. Do not embed it.** The current version is PAR-Q+ 2025. Page 4: "You must use the entire questionnaire and NO changes are permitted." Its downloads page: "must remain unaltered and may not be incorporated into electronic surveys, research tools, or any derivative materials without the express written consent of the PAR-Q+ Collaboration." A native-screen re-implementation is not permitted without consent. Build the gate from the ACSM algorithm instead.

Extra cover from the Physical Activity Guidelines 2018, verbatim: "People without diagnosed chronic conditions... and who do not have symptoms... most likely do not need to consult with a health care provider... People who develop new symptoms when increasing their levels of activity should consult a health care provider."

**Soreness against pain.** Onset 8-24 h, peak 24-72 h, resolved in about 7 days. The commonly cited 6-12 h onset is not verifiable anywhere. Sources: Gussoni et al., J Funct Morphol Kinesiol 2023;8(4):146, DOI 10.3390/jfmk8040146; Hotfiel et al., DOI 10.1055/a-0753-1884; Insights Imaging 2024;15:67, DOI 10.1186/s13244-024-01619-6. Cheung, Hume, Maxwell, Sports Med 2003;33(2):145-164: "Eccentric exercises or novel activities should be introduced progressively over a period of 1 or 2 weeks."

**The pain-monitoring model, verbatim.** Silbernagel, Thomee, Eriksson, Karlsson, Am J Sports Med 2007;35(6):897-906, DOI 10.1177/0363546506298279: "the pain was allowed to reach level 5 on the visual analog scale (VAS), where 0 is no pain and 10 is the worst pain imaginable, during the exercise training. The pain after the exercise program was allowed to reach 5 on the VAS but should have subsided by the following morning. Pain and stiffness... were not allowed to increase from week to week." In their RCT, n=38, continuing to load under this model was no worse than six weeks of rest, and both groups improved (P<.01).

**Rhabdomyolysis.** Tietze and Borchers, Sports Health 2014;6(4):336-339, DOI 10.1177/1941738114523544, PMCID PMC4065559: "Exertional rhabdomyolysis may be an extreme continuation of delayed-onset muscle soreness." Presentation: "muscle weakness, swelling, pain, and occasionally, darkening of the urine." Risk factors: "sudden alterations in training regimen, heat illness, poor conditioning, and dehydration", which is exactly what an over-eager progression algorithm creates in a deconditioned beginner.

Why the app ships no risk score: no RCT shows any progression strategy reduces injuries, and the best multidisciplinary machine-learning model, with genetic, biomechanical and nutritional inputs, reaches only AUC 0.784 (NPJ Digit Med 2026;9:213, DOI 10.1038/s41746-026-02413-y).

---

# At a glance

**[A], defend freely.** 2-3 full-body sessions a week for novices. 1-3 sets to start. Full range of motion. 60-120 s rest. RIR 1-3. Novices under-report how close to failure they are by about a rep. Reps and leverage substitute for load. Tempo within 0.5-8 s is neutral. Failure is not required. The per-session cap at 110% of the 30-day longest. The Silbernagel pain rule. The rhabdomyolysis triad. %HRR approximates %VO2R. Cardiac drift breaks that past about 30 minutes. Swain's 30% and 45% VO2R floors.

**[B], guideline-endorsed with weaker evidence underneath.** The ACSM band boundaries themselves. The 2-10% rule, at ACSM's own grade B, from a 1999 review, dropped in 2026. The cardio ramp. The ACSM screening algorithm. Unilateral progression.

**[C], convention, label it internally.** The 2-for-2 rule. Plus 1-2 reps a week. The entire deload protocol. The talk test as the primary in-session cue. Density as a lever. Auto-deload on repeated same-site pain.

**[X], do not ship.** The 10% rule as injury prevention, P=.90. Acute-chronic workload gauges or readiness scores. RIR 4 or higher as a target. A five-zone %HRmax dial as the primary interface. Any personalised injury-risk number. PAR-Q+ as native screens.

**Citation traps.** Cite Persinger 2004 by PMID 15354048 only; both circulating DOIs are wrong. Kotarsky 2018 is 10.1519/JSC.0000000000002345, not ...002478. Bok 2022's PubMed DOI field is corrupt; use 10.1007/s40279-022-01690-3.
