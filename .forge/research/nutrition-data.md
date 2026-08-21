# Nutrition data: where the numbers come from

Research note for the architect. Every URL below was fetched on **2026-08-21**. Every
file size is a measured `Content-Length` or a byte count on disk, not a claim copied
from a page. Every coverage percentage was computed by parsing the actual data.

Scope: one self-hosted user in France, eating French, Italian, Mediterranean, Asian,
Indian and Middle Eastern food. Must show kcal, protein, carbohydrate, fat and fibre
per portion. Must never claim clinical precision. Must work offline inside a Docker
image or a seeded database. No paid SaaS.

---

## 1. Verdict first

Ship **ANSES CIQUAL** as the bundled base table. Seed it at build time from a derived
CSV committed to the repo. Measured cost: **2,298 rows, 272 KB as CSV, 463 KB as
SQLite, 84 KB gzipped JSON.** Licence permits redistribution inside the app.

Add **Open Food Facts** as an opt-in barcode lookup at runtime, caching only the
products actually scanned. Do not bundle it. Measured cost of bundling: 1.28 GB
compressed CSV or 12.7 GB compressed JSONL, for a base whose fibre field is empty on
two thirds of French products.

Use **USDA FNDDS Portions and Weights** (881 KB, public domain) as the portion-size
reference for the photo flow. Do not use USDA FoodData Central for composition.

Do **not** hand-curate a seed table. 463 KB of ANSES data beats 400 hand-typed rows on
accuracy, on provenance, and on the time it costs to build.

---

## 2. ANSES CIQUAL

**Official source:** https://ciqual.anses.fr/
**Download page:** https://ciqual.anses.fr/cms/telechargement
**Open-data mirror (2020):** https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual-2020
**Open-data mirror (2025, with XML):** https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY
**DOI:** 10.57745/RDMHWY
**Publisher:** Agence nationale de sécurité sanitaire de l'alimentation, de l'environnement et du travail (Anses)
**Licence:** Licence Ouverte / Open Licence 2.0 (Etalab), SPDX `etalab-2.0`. Confirmed
in three places: `"license": "fr-lo"` on the data.gouv API, `{"name": "etalab 2.0"}` on
the Dataverse API for the 2025 DOI, and the licence text itself at
https://github.com/etalab/licence-ouverte/blob/master/LO.md
**Checked:** 2026-08-21

### What the licence actually permits

Licence Ouverte 2.0 is a permissive attribution licence. The reuser is free to
"communiquer, reproduire, copier", to "adapter, modifier, extraire et transformer", and
to "diffuser, redistribuer, publier et transmettre, exploiter à titre commercial".

The single obligation is paternité: "mentionner la paternité de l'«Information» : sa
source (a minima le nom du « Concédant ») et la date de la dernière mise à jour".

So: bake the table into the Docker image, transform it, ship it, even sell it. Name
Anses and the version date. There is no share-alike, no non-commercial clause, no
notification requirement. This is the cleanest licence of the four candidates.

One caveat the licence itself states: the attribution must not suggest the reuse is
official or endorsed by Anses. The app's disclaimer must therefore say "data from
Anses" and never "approved by Anses".

### What it covers, measured

The 2020 XML archive was downloaded and parsed. Hard numbers:

| Fact | Measured value |
|---|---|
| Foods in `alim` (2020) | 3,185 |
| Food groups in `alim_grp` | 136 |
| Constituents in `const` (2020) | 67 |
| Composition rows in `compo` | 211,898 |
| Foods named `(aliment moyen)`, generic averages | 116 (2020), 166 mapped in the 2025 average-foods table |
| Foods in 2025 | 3,484 across 74 constituents (per the DOI landing page) |

Nutrients required by this goal, all present, with their CIQUAL constituent codes:

| Need | `const_code` | Label |
|---|---|---|
| kcal | 328 | Energie, Règlement UE N° 1169/2011 (kcal/100 g) |
| protein | 25000 | Protéines, N x facteur de Jones (g/100 g) |
| carbohydrate | 31000 | Glucides (g/100 g) |
| fat | 40000 | Lipides (g/100 g) |
| **fibre** | **34100** | **Fibres alimentaires (g/100 g)** |

Fibre is present. That answers the question directly, and it is the reason CIQUAL wins:
fibre is the field most often missing everywhere else.

Also useful and already in the table: sugars (32000), saturated fat (40302), salt
(10004), plus iron, calcium, magnesium, zinc, vitamin D, B12 and folate. The lab-result
feature can lean on those later without a second data source.

### Coverage completeness, measured on the real file

| Field | Foods with a usable value | Blank or `-` |
|---|---|---|
| Protein | 3,167 of 3,185 (99.4%) | 18 |
| Fat | 3,169 (99.5%) | 16 |
| Carbohydrate | 3,104 (97.5%) | 81 |
| Fibre | 3,125 (98.1%) | 60 |
| **kcal (any of the four energy codes)** | **2,298 (72.1%)** | 887 |
| All five together | **2,298** | |

**This is the gotcha.** All four energy columns (327, 328, 332, 333) have identical
coverage: 2,298 foods. The other 887 foods carry macros but no computed energy. The app
must fall back to Atwater factors when code 328 is empty:

```
kcal = 4·protein_g + 4·(carb_g - polyols_g) + 2.4·polyols_g + 9·fat_g + 2·fibre_g + 7·alcohol_g
```

Those are the EU Regulation 1169/2011 Annex XIV conversion factors, which is the same
basis CIQUAL uses for code 328, so a computed value is consistent with a published one.
Flag the row as `energy_source = 'computed'` so the UI can be honest about it.

### Data-format gotchas, all observed directly

1. **The XML is not well-formed XML.** Encoding is `windows-1252`, and food names
   contain unescaped `<`, for example `Panaché préemballé (<1° alc.)`. Python's
   `ElementTree` fails at line 1274 of `alim_2020_07_07.xml`. Parse the XLSX instead,
   or regex the XML, or run it through a tolerant HTML parser. Do not assume a strict
   XML parser will work.
2. **Decimal separator is a comma.** `0,001` not `0.001`.
3. **Missing is `-`, not empty.**
4. **Censored values exist.** Measured across the five fields of interest: 418
   occurrences of `traces`, 223 of `< 0,5`, and a long tail of `< 0,3`, `< 3`, `< 1`,
   `< 0,1`. Decide once: `traces` and `< x` both become 0 with a `censored` flag, or
   both become x/2. Pick 0 and flag it. It matters most for fibre and saturated fat.
5. **2025 dropped the XML from ciqual.anses.fr.** The download page now offers only
   `.xls` and `.xlsx`. The 2025 XML lives on the research repository under the DOI.

### Cuisine coverage, measured by matching food names

The goal names six cuisines. Matching French food names against cuisine keywords:

| Cuisine | Distinct CIQUAL entries matched | Examples found |
|---|---|---|
| Asian | 104 | Sushi ou Maki aux produits de la mer, Nem, Tofu nature, Lait de coco, Nouilles, Pho |
| Italian | 84 | Pizza margherita, Risotto, Lasagne, Gnocchi, Ravioli, Polenta, Pesto, Tiramisu |
| Middle Eastern | 44 | Graine de couscous, Falafel, Tajine de poulet, Merguez, Boulgour, Harissa, Baklava |
| Mediterranean / Greek | 34 | Taboulé, Tzatziki, Houmous, Feta, Tapenade, Moussaka, Pois chiche |
| **Indian** | **19** | Lassi, Curry en poudre, Sauce au curry, Tandoori. **No naan, no paneer, no dal, no biryani.** |

Indian is the weak spot, and it is weak only at the *dish* level. At the *ingredient*
level CIQUAL is strong everywhere: lentils (15), chickpea (4 including flour), rice
(44), yoghurt (54), turmeric, cumin, coriander seed, ginger, coconut milk, spinach,
chicken (52), lamb (39), ghee-adjacent butters (47). A dal computed from red lentils,
onion, tomato, oil, turmeric and cumin is accurate. A dal looked up as a dish is
missing. This is the single strongest argument for the recipe model in section 6.

---

## 3. Open Food Facts

**Data page:** https://world.openfoodfacts.org/data
**Terms:** https://world.openfoodfacts.org/terms-of-use
**Licence:** Open Database License (ODbL) 1.0 for the database, Database Contents
Licence (DbCL) for individual contents, CC BY-SA for photographs.
**Checked:** 2026-08-21

### Coverage, live counts from the v2 search API

| Query | Count |
|---|---|
| All products worldwide | **4,698,017** |
| `countries_tags=en:france` | **1,260,422** |
| France + `states_tags=en:nutrition-facts-completed` | **933,063** (74.0% of French products) |
| World + nutrition-facts-completed | 3,558,059 |

French branded coverage is genuinely excellent. This is the French flagship open-data
project and France is its densest market. If the user scans a Carrefour own-brand
product, Open Food Facts will have it and CIQUAL will not.

### But the fibre field is the problem

Two independent measurements:

**A. Bulk CSV sample.** 62 MB of the compressed world CSV was streamed and
decompressed to 634 MB, giving 227,462 product rows. Of those, 15,036 carried
`en:france`.

| Field | All rows in sample | France-tagged rows |
|---|---|---|
| `product_name` | 96.0% | 84.8% |
| `energy-kcal_100g` | 18.0% | 60.1% |
| `proteins_100g` | 17.8% | 59.5% |
| `carbohydrates_100g` | 17.8% | 59.4% |
| `fat_100g` | 17.7% | 59.4% |
| **`fiber_100g`** | **13.0%** | **33.6%** |
| `serving_size` | 63.8% | 18.0% |

Honest caveat: the CSV is ordered by barcode, so the first 227k rows over-represent
short and malformed codes. Treat the world column as a floor, not an estimate.

**B. The head of the distribution, which is what actually matters.** The 300
most-scanned French products (`sort_by=unique_scans_n`) were pulled from the API:

| Field | Present |
|---|---|
| kcal, protein, carbohydrate, fat | **94%** each |
| **fibre** | **77%** |
| `serving_quantity` | 76% |

That is the real shape of the base: excellent on the products a person actually buys,
thin in the long tail. For a one-person app that scans maybe 300 distinct products a
year, 94% macro coverage and 77% fibre coverage is workable, provided the app can say
"fibre unknown" instead of silently writing 0.

### The bulk exports and their measured sizes

| Export | URL | Measured size |
|---|---|---|
| CSV, tab-separated, gzip | https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | **1,275,171,186 bytes (1.28 GB)**, ~9 GB uncompressed |
| CSV, French field names | https://static.openfoodfacts.org/data/fr.openfoodfacts.org.products.csv.gz | 1,294,369,794 bytes (1.29 GB) |
| JSONL, gzip | https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz | **12,718,204,979 bytes (12.7 GB)** |
| MongoDB dump | https://static.openfoodfacts.org/data/openfoodfacts-mongodbdump.gz | not measured, comparable order |
| Parquet on Hugging Face | https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet | **7,785,838,824 bytes (7.8 GB)** |

Note the `fr.` export is *not* a France subset. It is the whole database with French
field labels, and it is the same order of magnitude as the world file.

The CSV header was decoded: **211 columns, 123 of them `*_100g`.** The five fields
needed here all exist and are named `energy-kcal_100g`, `proteins_100g`,
`carbohydrates_100g`, `fat_100g`, `fiber_100g`. Also present and useful:
`serving_size`, `serving_quantity`, `countries_tags`, `nutriscore_grade`,
`last_modified_t`.

### What ODbL actually obliges

Three obligations, and only the first bites here:

1. **Attribution.** Any public use of the data must credit Open Food Facts and name the
   licence, with a link to https://openfoodfacts.org or to the specific product page.
   This applies to a screen the user sees, so it applies to this app.
2. **Share-alike.** If you publicly use a *derivative database*, you must offer that
   derivative under ODbL. A private single-user app served over Tailscale to one person
   does not publicly distribute a database, so share-alike is not triggered. It would
   be triggered the moment the app is published or a data export is shared. Note the
   trigger in `docs/` so a future decision to publish does not quietly breach it.
3. **No DRM without a parallel unrestricted version.** Not relevant.

The DbCL on individual contents is effectively a public-domain dedication of the
contents. Product photographs are CC BY-SA, a stricter licence, so do not cache OFF
product images.

### Crowdsourced quality caveats, worth stating plainly

- Anyone can edit. There is no expert validation gate. Values are transcribed from
  packaging by volunteers and by OCR, and transcription errors survive.
- Unit confusion is endemic: kJ entered in a kcal field, per-serving values entered in
  a per-100 g field. Sanity-check every ingested row: reject `energy-kcal_100g > 900`,
  reject any macro `> 100`, reject rows where 4P + 4C + 9F deviates from stated kcal by
  more than 30%.
- Products drift. Recipes are reformulated and the barcode stays the same. A cached row
  goes stale silently. Keep `last_modified_t` and re-fetch anything older than a year.
- Missing means missing, not zero. 23% of France-tagged products in the popular sample
  had no fibre at all. Store `NULL` and render "unknown", never `0 g`.
- Availability is not guaranteed. During this research session
  `world.openfoodfacts.org` returned HTTP 503 "Page temporarily unavailable" on several
  attempts before succeeding on retry. A hard runtime dependency on it would produce a
  broken barcode scanner on an ordinary Tuesday. Cache aggressively, fail soft.

---

## 4. USDA FoodData Central

**Downloads:** https://fdc.nal.usda.gov/download-datasets
**Licence:** US public domain, published as CC0 1.0. USDA asks, but does not require,
that FoodData Central be listed as the source.
**Suggested citation:** U.S. Department of Agriculture, Agricultural Research Service.
FoodData Central, 2019. https://fdc.nal.usda.gov
**Checked:** 2026-08-21

Datasets and shapes as listed on the download page:

| Dataset | Latest release | Formats | Zipped |
|---|---|---|---|
| Foundation Foods | April 2026 | JSON, CSV | 459 KB to 3.7 MB (**measured: 3,424,407 bytes** for the April 2025 CSV zip) |
| SR Legacy | April 2018 | JSON, CSV | 6.7 to 12.3 MB |
| FNDDS / Survey Foods | October 2024 | JSON, CSV | 3.7 to 200 MB |
| Branded Foods | April 2026 | JSON, CSV | 195 to 428 MB, 2.9 to 3.1 GB unzipped |
| Full download | April 2026 | CSV | 460 MB zipped, 3.1 GB unzipped |

**Verdict: not the composition source for this app.** The licence is the best possible,
CC0 with no obligations at all, but relevance fails:

- Branded Foods is a US retail catalogue. Useless for a shopper in France.
- SR Legacy has not been updated since 2018.
- Foundation Foods is small and high quality but US-centric in its food list and its
  cooking conventions.
- Fibre in FDC is reported as "Fiber, total dietary" measured by AOAC 991.43, while
  CIQUAL and EU labelling use the AOAC 2009.01 / EU 1169/2011 definition, which counts
  resistant starch and some oligosaccharides differently. Mixing them in one table
  silently mixes two definitions of the same word. Do not mix.
- Energy in FDC is Atwater-based and generally consistent, but the food identities are
  not the ones this user eats.

**Keep exactly one thing from USDA: portion weights.** See section 7.

---

## 5. Other candidates, and the hand-curated question

**Frida, Danish Food Composition Database (DTU Food).**
https://frida.fooddata.dk/data, free spreadsheet download, version 5.5 released
2025-12-19. Credit required on each display. Excellent quality, Nordic food list.
No advantage over CIQUAL for a French user. Skip.

**CoFID, McCance and Widdowson's Composition of Foods Integrated Dataset (UK).**
https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
Open Government Licence, so redistribution is fine with attribution. Strong on
English-language food names, which is relevant because this app's UI language is
English. Worth keeping as a *labelling* crib for English food names, not as a second
composition table. Skip for V1.

**EuroFIR / FoodEXplorer.** Aggregates national tables including CIQUAL. Membership and
licensing gate. Paid access. Excluded by the no-paid-SaaS constraint.

**Nutritionix, Edamam, Spoonacular, FatSecret.** All paid or freemium SaaS with
per-call quotas and terms that forbid caching. Excluded by constraint, and each one
would also become a network dependency on an app that must work offline.

**A hand-curated seed table of a few hundred foods.** This is the honest question, and
the answer is measured, not rhetorical. A 400-row slice of the CIQUAL core table
serialises to **41,243 bytes, 40 KB**. The complete 2,298-row core table serialises to
**272 KB CSV, 463 KB SQLite, 84 KB gzipped JSON**. The full table costs **423 KB more**
than a hand-curated 400 rows, and it costs zero hours of typing, carries a real
provenance chain to Anses, and never has a wrong number because someone mistyped it at
one in the morning.

**A hand-curated table would be the honest answer if the full table were expensive. It
is not. It costs less than one product photograph.** Ship the full table.

What *is* worth hand-curating is a small **alias layer**: 100 to 200 rows mapping
English and everyday names to CIQUAL codes. "Chicken breast" to *Poulet, blanc, cuit*.
"Olive oil" to *Huile d'olive*. "Greek yoghurt" to *Yaourt à la grecque*. That is
translation work, not nutrition work, and it is where the user-visible quality lives.

---

## 6. Design answers

### 6.1 The smallest data asset that does not lie

**Recommendation: the CIQUAL core table, 2,298 rows, seeded into Postgres from a
committed CSV. 272 KB in the repository, roughly 1.5 MB as a Postgres table with
indexes.**

Derivation, already run and verified:

- Parse `alim`, `alim_grp` and `compo` from the CIQUAL release.
- Keep constituents 328, 25000, 31000, 40000, 34100. Optionally 32000, 40302, 10004.
- Keep only rows where all five core nutrients resolve. That is 2,298 foods.
- For the other 887, compute kcal by Atwater and mark `energy_source='computed'`. That
  lifts the table to roughly 3,100 usable rows for a further ~90 KB, and is worth it.
- Normalise the comma decimal separator, map `-` to NULL, map `traces` and `< x` to 0
  with a `censored` boolean.

Measured artefact sizes for the 2,298-row version:

| Serialisation | Bytes | Human |
|---|---|---|
| CSV, 10 columns | 272,105 | 0.27 MB |
| SQLite, indexed on name | 462,848 | 0.46 MB |
| JSON, gzipped | 84,390 | 0.08 MB |
| 400-row slice, CSV | 41,243 | 40 KB |

Add on top:

| Asset | Rows | Size |
|---|---|---|
| CIQUAL core | ~3,100 | ~360 KB CSV |
| Portion reference (section 7) | ~150 curated | ~10 KB |
| English alias layer | ~200 | ~8 KB |
| **Total seeded asset** | **~3,450** | **under 400 KB in the repo** |

Everything else, the branded French products, arrives at runtime through an opt-in
Open Food Facts lookup and is cached per product. After a year of daily use that cache
is a few hundred rows and a few hundred kilobytes.

This computes a week of menus and a shopping list without lying, because every number
traces to Anses, every missing number is NULL rather than 0, and every computed number
is flagged.

### 6.2 How to model a recipe's nutrition

**Recommendation: compute from ingredient rows, then store the result as a versioned
per-serving snapshot with provenance. One direction of truth, one materialised cache.
Not "both" as a choice the code makes at read time.**

The reasoning, grounded in section 2's cuisine measurement:

- Dish-level rows do not exist for the cuisines this user eats. CIQUAL has 19 entries
  matching Indian keywords and no naan, no paneer, no dal. Ingredient rows cover all
  six cuisines. Computing from ingredients is the only approach that works across the
  whole menu.
- The shopping list needs ingredient quantities anyway. Once you hold
  `recipe_ingredient(food_id, grams)`, the nutrition is a sum. Storing a separate
  hand-entered per-serving estimate creates a second number that will disagree with the
  first and nobody will know which is right.
- A stored per-serving estimate alone cannot answer "swap the rice for quinoa", which
  the coach must do.

But a pure computed-at-read-time model is also wrong, for two reasons: the weekly
review must show what the user ate *then*, under the ingredient data as it stood then;
and recomputing every recipe on every dashboard render is wasteful.

So:

```
recipe(id, name, servings, ...)
recipe_ingredient(recipe_id, food_id, grams, note)
recipe_nutrition(recipe_id, computed_at, per_serving_kcal, protein_g, carb_g,
                 fat_g, fibre_g, provenance, confidence, coverage_pct,
                 source_food_ids_hash)
```

`provenance` is an enum, and it is the thing that keeps the app honest:

| Value | Meaning | UI treatment |
|---|---|---|
| `computed_ciqual` | Every ingredient resolved to a CIQUAL row | plain number |
| `computed_mixed` | Some ingredients from Open Food Facts | plain number, source list on tap |
| `computed_partial` | One or more ingredients unresolved | number plus "n ingredients not counted" |
| `user_entered` | User typed the per-serving figure | "your value" badge |
| `ai_estimate` | Vision model estimated it from a photo | "estimate" badge, range not point, always editable |
| `label_scan` | Read from a packaged product's own label | plain number |

`coverage_pct` is the share of total recipe mass whose nutrition resolved. Below 85%,
render the range wider and say so. Fibre needs its own coverage number, because it is
the field most likely to be NULL.

Cooking losses matter and are the honest limit of the ingredient approach: raw to
cooked weight changes, fat absorbed by frying, water lost by roasting. Do not model
retention factors in V1. Instead, prefer CIQUAL's cooked entries where they exist
(*Poulet, blanc, cuit* rather than *cru*), state the assumption once in the UI, and let
the range absorb the rest.

### 6.3 Daily targets, computed prudently

**Which BMR equation.** Use **Mifflin-St Jeor**. The Academy of Nutrition and Dietetics
Evidence Analysis Library states: "If indirect calorimetry is not available, the
registered dietitian nutritionist (RDN) should use the Mifflin-St. Jeor equation using
actual weight to estimate resting metabolic rate (RMR) in overweight or obese adults",
and adds that "Other equations evaluated did not predict resting metabolic rate as
accurately as the Mifflin-St. Jeor equation."
https://www.andeal.org/template.cfm?template=guide_summary&key=4341

The original paper, verified: Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA,
Koh YO. "A new predictive equation for resting energy expenditure in healthy
individuals." *Am J Clin Nutr* 1990;51:241-247. DOI 10.1093/ajcn/51.2.241, PMID
2305711. Derived from 498 healthy adults, 251 men and 247 women, aged 19 to 78, with
REE measured by indirect calorimetry. The paper itself reports that "The Harris-Benedict
Equations derived in 1919 overestimated measured REE by 5% (p less than 0.01)".

**Exact formulas.**

```
Mifflin-St Jeor (1990), the default
  men:   RMR = 10·weight_kg + 6.25·height_cm − 5·age_y + 5
  women: RMR = 10·weight_kg + 6.25·height_cm − 5·age_y − 161

Harris-Benedict, revised by Roza & Shizgal (1984), for comparison only
  men:   BMR = 88.362 + 13.397·weight_kg + 4.799·height_cm − 5.677·age_y
  women: BMR = 447.593 +  9.247·weight_kg + 3.098·height_cm − 4.330·age_y

Katch-McArdle, when body-fat percentage is genuinely known
  LBM = weight_kg · (1 − bodyfat_fraction)
  RMR = 370 + 21.6·LBM_kg
  (identical to Cunningham's 1991 revision; Cunningham 1980 gave 500 + 22·FFM)
```

**When to use Katch-McArdle.** Only when body-fat percentage comes from a method worth
trusting. The Withings Body Smart reports body fat by bioelectrical impedance, and BIA
on a single scale is sensitive to hydration, time of day, food and exercise in the
preceding hours. Its *trend* is informative; its *absolute value* can be several points
off. So: keep Mifflin-St Jeor as the target-setting equation, show Katch-McArdle
alongside as a second opinion, and only let it drive targets if the user explicitly
opts in after being told the caveat. Katch-McArdle is the better equation when LBM is
measured well, because fat-free mass was the single best predictor of REE in Mifflin's
own data (R² = 0.64 for REE = 19.7·FFM + 413, against R² = 0.71 for the full
Mifflin model). Garbage LBM makes it the worse one.

**Worked for this user: 38 y, male, 183 cm, 89.0 kg.**

| Equation | Result | Note |
|---|---|---|
| **Mifflin-St Jeor** | **1,849 kcal/day** | 890 + 1143.75 − 190 + 5 |
| Harris-Benedict revised | 1,943 kcal/day | +5.1%, exactly the overestimate Mifflin reported |
| Katch-McArdle at 25% body fat | 1,812 kcal/day | LBM 66.8 kg |
| Katch-McArdle at 22% body fat | 1,870 kcal/day | LBM 69.4 kg |
| Mifflin at goal weight 76 kg | 1,719 kcal/day | recompute as weight falls |

**Activity multipliers.** The defensible base is the FAO/WHO/UNU 2004 expert
consultation on human energy requirements, which classifies physical activity level
(PAL) as: sedentary or light activity **1.40 to 1.69**, moderately active or active
**1.70 to 1.99**, vigorously active **2.00 to 2.40**.
https://www.fao.org/3/y5686e/y5686e.pdf

The familiar 1.2 / 1.375 / 1.55 / 1.725 / 1.9 ladder that every online calculator uses
is a convention, not a guideline. It has no primary source and its bottom rung, 1.2, is
below the FAO/WHO/UNU floor for any ambulatory adult. Do not use it.

Use this instead, and label each row with what it actually means:

| Label in the UI | PAL | Description |
|---|---|---|
| Desk job, little movement | 1.40 | Seated work, under 5,000 steps, no training |
| Desk job, some walking | 1.55 | 5,000 to 8,000 steps, 1 to 2 sessions a week |
| Active, trains regularly | 1.70 | 8,000+ steps, 3 to 4 sessions a week |
| Physically demanding or trains hard | 1.90 | Manual work, or 5+ hard sessions a week |

Better still, since this app already has Apple Health and a training log: derive PAL
from measured active energy rather than asking. Start at 1.55, then reconcile monthly
against observed weight change, which is the only real feedback signal. A PAL that
predicts the wrong weight trajectory is wrong, whatever the user selected.

At PAL 1.55, TDEE = 1,849 × 1.55 = **2,866 kcal/day**.

**Safe weekly rate of loss.** Mainstream guidance converges on **0.5 to 1 kg per
week**, equivalently 1 to 2 lb:

- NHLBI Clinical Guidelines on the Identification, Evaluation, and Treatment of
  Overweight and Obesity in Adults: "Weight loss should be about 1 to 2 lb/week for a
  period of 6 months", with an initial goal to "reduce body weight by approximately 10
  percent from baseline", achieved through "a deficit of 500 to 1,000 kcal/day".
  https://www.ncbi.nlm.nih.gov/books/NBK2004/
- CDC: people who lose weight at "about 1 to 2 pounds a week" are more likely to keep
  it off. https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html
- NHS gives the same 0.5 to 1 kg per week.

A useful second cap, standard in body-composition practice, is **0.5% to 1.0% of body
weight per week**, which for an 89 kg man is 0.45 to 0.89 kg. Take the stricter of the
two.

**This user's plan is comfortably inside every guideline.** 89 kg to 76 kg is 13 kg over
about 39 weeks, which is **0.33 kg/week, 0.37% of body weight per week**. At the
conventional 7,700 kcal per kg of body fat that implies a deficit of **367 kcal/day**,
so a target of roughly **2,500 kcal/day** at PAL 1.55, recomputed monthly as weight
falls.

Two honesty notes to put in the code comments and, in plain words, in the UI:

- The 7,700 kcal/kg rule (3,500 kcal/lb) is a static approximation and it overpredicts
  long-run loss, because expenditure falls as mass falls. Hall KD, Sacks G,
  Chandramohan D, Chow CC, Wang YC, Gortmaker SL, Swinburn BA. "Quantification of the
  effect of energy imbalance on bodyweight." *Lancet* 2011;378:826-837. DOI
  10.1016/S0140-6736(11)60812-X, PMID 21872751. The paper shows "the bodyweight
  response to a change of energy intake is slow, with half times of about 1 year". Use
  the rule to set a starting target, then let measured weight correct it. Never present
  it as a prediction.
- Every one of these equations is a population regression. Mifflin-St Jeor explained 71%
  of variance in its own derivation sample. Individual error of ±10% is ordinary, which
  for this user is ±185 kcal at rest and roughly ±290 kcal on TDEE. Say so once, in the
  UI, next to the number.

**The floor that triggers a warning.** Three tiers, and the app should implement all
three:

| Tier | Threshold for this user | Action |
|---|---|---|
| **Soft warning** | Target below estimated RMR, i.e. **1,849 kcal** today | Show a caution: "below your estimated resting needs". Allow, but explain. |
| **Hard warning** | Target below **1,500 kcal/day** for a man | Block by default. Requires explicit confirmation and a line recommending a professional. NHLBI's low-calorie diet range for men is 1,200 to 1,600 kcal/day; anything under it is a very-low-calorie diet, which is medically supervised territory. |
| **Rate warning** | Planned loss above **0.89 kg/week** (1% of body weight) or above **1.0 kg/week** absolute | Refuse to generate the plan, propose the nearest compliant rate instead. |

Also warn upward. If a proposed target implies a deficit above **1,000 kcal/day**,
flag it, because that is the top of the NHLBI range and, on this user's TDEE, it would
push intake under 1,900 kcal for no benefit given a 9-month horizon.

**Macro floors, so the target is not just a calorie number.**

- **Protein.** Anchor to 1.6 to 2.2 g per kg of body weight. Morton RW et al. "A
  systematic review, meta-analysis and meta-regression of the effect of protein
  supplementation on resistance training-induced gains in muscle mass and strength in
  healthy adults." *Br J Sports Med* 2018;52(6):376-384, PMID 28698222. 49 studies,
  1,863 participants; the dose-response plateaued near **1.62 g/kg/day**, with the
  confidence interval extending to about 2.2. In an energy deficit, higher is
  defensible: Helms ER et al. *Int J Sport Nutr Exerc Metab* 2014;24(2):127-138
  concluded that energy-restricted resistance-trained athletes likely need **2.3 to 3.1
  g/kg of fat-free mass**. For this user: **145 to 195 g/day**, and put the daily target
  at **160 g**.
- **Fibre.** ANSES sets the French reference at **30 g/day** for adults. This is exactly
  why fibre must be in the data model, not an afterthought.
- **Fat.** Not below 20% of energy, and not below 0.8 g/kg, whichever is higher. At
  2,500 kcal that is a floor of 56 g.
- **Carbohydrate.** Whatever remains. Do not set a carbohydrate floor for a
  general-population fat-loss plan; there is no mainstream basis for one.

**One line the UI must carry near the target, always:** these are estimates from
population equations, not measurements of this person's metabolism. The scale over four
weeks is the real measurement.

### 6.4 Never claiming clinical precision, concretely

This is a design constraint that has to be implemented, not just promised:

- Store NULL, render "unknown". Never coerce a missing nutrient to 0.
- Round outward, not inward. kcal to the nearest 10 when computed from ingredient rows,
  to the nearest 25 when estimated from a photo. Macros to the nearest gram when
  computed, nearest 5 g when estimated.
- Every screen carrying a nutrition number carries its provenance, one tap away.
- No decimal places on any user-facing macro. `Protein 32 g`, never `31.7 g`.
- The word "estimate" is a badge, not a footnote.

---

## 7. Portion sizes for the photo-estimation flow

### The source

**USDA FNDDS 2021-2023, Portions and Weights.**
https://www.ars.usda.gov/ARSUserFiles/80400530/apps/2021-2023%20FNDDS%20At%20A%20Glance%20-%20Portions%20and%20Weights.xlsx
**Measured size: 881,227 bytes. Parsed: 22,047 rows.** Public domain (US government
work). Suggested citation: U.S. Department of Agriculture, Agricultural Research
Service. 2024. *USDA Food and Nutrient Database for Dietary Studies 2021-2023.*

It is the only free, bulk, machine-readable portion-weight table with this coverage.
Its food identities are American, but a medium slice of bread weighs the same in Lyon.
Use it for portion *geometry*, then look the nutrition up in CIQUAL. Never take
nutrition from FNDDS.

The French photographic standard, *Portions alimentaires: manuel-photos pour
l'estimation des quantités* (SU.VI.MAX, Hercberg / Deheeger / Preziosi, Economica
2002; validated in Le Moullec et al., *Cah Nutr Diét* 1996;31:158-164, 237 photographs
across 687 volunteers), is the right reference for a French user, but it is a printed
book under commercial copyright. Not redistributable. Cite it, do not ship it.

### A practical starter table, gram weights read directly from FNDDS

| Item | Portion | Grams |
|---|---|---|
| Baguette / French bread | thin slice / regular slice / thick slice | 32 / 64 / 96 |
| Sandwich bread | thin / medium / thick slice | 24 / 28 / 43 |
| Croissant | mini / small / medium | 28 / 42 / 57 |
| Pita bread | small / medium / large | 28 / 57 / 85 |
| Pasta, cooked | 1 cup cooked; 1 oz dry yields | 140; 80 |
| Rice, white, cooked | 1 cup | 163 |
| Rice, brown, cooked | 1 cup | 196 |
| Couscous, cooked | 1 cup | 160 |
| Noodles, cooked | 1 cup | 160 |
| Lentils, cooked | 1 cup | 180 to 185 |
| Chickpeas, cooked | 1 cup | 180 to 185 |
| Potato, boiled | baby / small / medium | 60 / 130 / 170 |
| Chips, from fresh | 1 medium potato yields | 70 |
| Chicken breast, cooked | small / medium breast | 110 / 130 |
| Chicken breast, cooked | 1 cup diced | 135 |
| Chicken curry | 1 cup | 240 |
| Egg, whole | 1 egg | 50 |
| Camembert | 1 wedge (38 mm) | 38 |
| Milk, whole | 1 cup | 244 |
| Olive oil | 1 tablespoon | 14 |
| Butter | 1 tablespoon / 1 pat | 14 / 7 |
| Hummus | 1 tablespoon / 1 pot | 15 / 70 |
| Falafel | 1 patty | 17 |
| Sushi | 1 piece | 30 |
| Avocado | 1 cup sliced | 150 |
| Walnuts | 1 oz / 1 cup | 28 / 120 |
| Almonds | 1 cup | 141 |
| Apple, raw | small / medium / large | 165 / 200 / 242 |
| Banana, raw | 1 banana | 126 |
| Lettuce, raw | 1 cup | 20 to 35 |
| Cooked vegetables | 1 cup | ~160 |

Curate roughly 150 rows of this shape into the seed. It costs about 10 KB.

Add hand-based heuristics on top, because they need no reference object in the photo
and they are how people actually think:

| Hand cue | Approximate |
|---|---|
| Palm, without fingers | 100 to 120 g cooked meat or fish |
| Closed fist | 150 to 200 g cooked rice, pasta or vegetables |
| Cupped hand | 30 to 40 g nuts, or 40 g dry cereal |
| Thumb, first joint to tip | 10 to 15 g fat, cheese or nut butter |

Label these as rules of thumb, which is literally what they are, and never let them
override a weighed value.

### How to express an estimate as a range

The evidence is unambiguous and it is worse than most people assume. Lucassen DA,
Willemsen RF, Geelen A, Brouwer-Brolsma EM, Feskens EJM. "The accuracy of portion size
estimation using food images and textual descriptions of portion sizes: an evaluation
study." *J Hum Nutr Diet* 2021;34:945-952. DOI 10.1111/jhn.12878, PMID 33761165. True
intake of one lunch was measured in 40 participants and compared with self-report.
**Only 35% of image-based portion estimates fell within 25% of the true amount, and
only 13% fell within 10%.** Text-based description did better, 50% within 25% and 31%
within 10%, and the authors concluded text-based assessment was the more accurate of
the two.

The systematic review reaches the same place from the other direction: Amoutzopoulos B
et al. "Portion size estimation in dietary assessment: a systematic review of existing
tools, their strengths and limitations." *Nutr Rev* 2020;78:885-900. PMID 31999347.
542 portion-size estimation elements identified across 334 studies, of which only 21
were ever validated against actual food amounts, and "only a few validation studies were
of high quality."

So a photo estimate presented as "487 kcal" is a lie about precision, and a ±10% band
would still be wrong roughly seven times in eight.

**The rule to implement:**

1. **Never render a bare point estimate from a photo.** Render a range.
2. **Default band: −25% / +35%**, asymmetric because under-reporting is the documented
   direction of error in self-reported dietary assessment.
3. **Snap to a coarse grid.** kcal to the nearest 25. Protein, carbohydrate, fat and
   fibre to the nearest 5 g. A grid finer than the error is theatre.
4. **Narrow the band as evidence arrives.** Each of these tightens it:

| Evidence | Band |
|---|---|
| Photo only, no reference object | −25% / +35% |
| Photo plus a known reference (hand, standard plate, cutlery) | −20% / +25% |
| User picked a named portion from the table ("1 medium slice") | −15% / +15% |
| Packaged product, barcode scanned, label read | −5% / +5% |
| User weighed it | exact, no range |

5. **Show the midpoint in the daily total, the range on the item.** Totalling ranges
   across a day compounds them into a band so wide it stops informing. Sum the
   midpoints for the daily figure, and mark the day's confidence by the share of its
   energy that came from estimates rather than weights.
6. **Always editable.** One tap from the range to a number field. That is both the
   goal's hard constraint on AI estimates and the mechanism by which the data improves.

Copy that works: **"Around 450 to 610 kcal · estimate · tap to correct"**. Not
"487 kcal".

---

## 8. Recommendation the architect can adopt as-is

**Primary composition source: ANSES CIQUAL 2025.** Bundled, seeded, offline, no network
call at runtime. Licence Ouverte 2.0 permits redistribution with attribution.

**Build-time pipeline:**
1. `scripts/fetch-ciqual.sh` downloads `Table Ciqual 2025_FR_2025_11_03.xlsx` (1.54 MB)
   and verifies its checksum.
2. `scripts/build-food-seed.ts` extracts the eight nutrient columns, normalises comma
   decimals, maps `-` to NULL and `traces` / `< x` to 0-with-flag, computes Atwater kcal
   where energy is missing, and writes `prisma/seed/foods.csv`.
3. That CSV is **committed to the repository**, roughly 360 KB. The build never needs
   the network. The Docker image never needs the network. The refresh script exists so a
   future CIQUAL release is a one-line change, not an archaeology project.
4. Prisma seed loads it into `food`. Add a GIN trigram index on the name columns for
   search.

**Secondary source: Open Food Facts, opt-in, runtime, cached.** Barcode scan hits the
v2 API, validates the response against the sanity rules in section 3, writes one row to
`food` with `source='off'` and `off_last_modified`, and never blocks a meal log on a
network call. If the API is down, the user types the label. A setting turns it off
entirely, and with it off the app is fully offline.

**Portion reference: FNDDS Portions and Weights**, curated to ~150 rows at seed time.

**Not used: USDA FoodData Central composition, Frida, CoFID, EuroFIR, and every paid
API.**

**Not built: a hand-curated seed table.** Measured at 40 KB for 400 rows against 272 KB
for the authoritative 2,298. The saving is not worth the loss of provenance.

**Total seeded data asset: about 3,450 rows, under 400 KB in the repository.**

### Schema sketch

```
food(
  id, source, source_ref,          -- 'ciqual'|'off'|'user', alim_code or barcode
  name_fr, name_en, group_code, subgroup_code,
  kcal_100g, protein_g, carb_g, fat_g, fibre_g,
  sugars_g, satfat_g, salt_g,
  energy_source,                   -- 'published'|'computed_atwater'
  censored_fields text[],          -- fields where 'traces' or '< x' became 0
  table_version,                   -- 'ciqual-2025-11-03'
  fetched_at
)
portion(id, food_id NULL, label_en, label_fr, grams, source)  -- 'fndds'|'user'
recipe(id, name, servings)
recipe_ingredient(recipe_id, food_id, grams, note)
recipe_nutrition(recipe_id, computed_at, per_serving_*, provenance,
                 coverage_pct, fibre_coverage_pct)
```

### Exact download URLs

```
CIQUAL 2025, Excel, primary, 1,544,342 bytes
https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202025_FR_2025_11_03.xlsx

CIQUAL 2025, legacy .xls, 4,500,992 bytes
https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202025_FR_2025_11_03.xls

CIQUAL 2025, XML set (research repository, DOI 10.57745/RDMHWY)
  compo_2025_11_03.xml     69,243,149 bytes  https://entrepot.recherche.data.gouv.fr/api/access/datafile/666249
  alim_2025_11_03.xml       1,581,031 bytes  https://entrepot.recherche.data.gouv.fr/api/access/datafile/666252
  alim_grp_2025_11_03.xml      80,421 bytes  https://entrepot.recherche.data.gouv.fr/api/access/datafile/666250
  const_2025_11_03.xml         17,955 bytes  https://entrepot.recherche.data.gouv.fr/api/access/datafile/666246
  sources_2025_11_03.xml      871,783 bytes  https://entrepot.recherche.data.gouv.fr/api/access/datafile/666248
  documentation PDF         4,236,848 bytes  https://entrepot.recherche.data.gouv.fr/api/access/datafile/666748

CIQUAL 2020, XML archive, 3,554,394 bytes (well-formedness caveat, section 2)
https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip

CIQUAL download page (canonical, check here for the next release)
https://ciqual.anses.fr/cms/telechargement

Open Food Facts, runtime API (no bulk download needed)
https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity,last_modified_t
  Send a descriptive User-Agent. Expect intermittent 503s. Retry with backoff.

Open Food Facts, bulk, only if a full local mirror is ever wanted
https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz   1.28 GB
https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz        12.7 GB
https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet  7.8 GB

USDA FNDDS Portions and Weights, 881,227 bytes
https://www.ars.usda.gov/ARSUserFiles/80400530/apps/2021-2023%20FNDDS%20At%20A%20Glance%20-%20Portions%20and%20Weights.xlsx

USDA FoodData Central downloads (not used, recorded for completeness)
https://fdc.nal.usda.gov/download-datasets
```

### Exact attribution text the app must display

Put this on a **Data sources** screen, reachable from Settings and linked from the
footer of every nutrition screen. The CIQUAL line is a licence obligation. The Open
Food Facts line is a licence obligation whenever OFF data is on screen. The FNDDS line
is courtesy, not obligation.

```
Nutrition data

Food composition: Table de composition nutritionnelle des aliments Ciqual 2025,
Anses (Agence nationale de sécurité sanitaire de l'alimentation, de l'environnement
et du travail). Last updated 3 November 2025. Licence Ouverte / Open Licence 2.0
(Etalab). https://ciqual.anses.fr
This application is not endorsed by or affiliated with Anses.

Packaged products: Open Food Facts contributors. Data under the Open Database
Licence (ODbL) v1.0, individual contents under the Database Contents Licence.
https://openfoodfacts.org

Portion weights: U.S. Department of Agriculture, Agricultural Research Service,
USDA Food and Nutrient Database for Dietary Studies 2021-2023. Public domain.
https://fdc.nal.usda.gov

All figures are estimates. Energy and macronutrient values are averages for a food
type, not measurements of the item you ate. This app is not a medical device and
does not provide medical advice.
```

Per-product attribution, shown on any screen displaying an Open Food Facts product:

```
Source: Open Food Facts (ODbL) · openfoodfacts.org/product/{barcode}
```

Short form for a screen footer, where a full block does not fit:

```
Data: Anses Ciqual 2025 (Licence Ouverte 2.0) · Open Food Facts (ODbL) · Estimates only
```

### Constants to put in one config file, not scattered through the code

```ts
export const NUTRITION = {
  bmrEquation: 'mifflin-st-jeor',
  pal: { sedentary: 1.40, light: 1.55, active: 1.70, veryActive: 1.90 },
  palDefault: 1.55,
  kcalPerKgBodyFat: 7700,          // static approximation, see Hall 2011
  maxWeeklyLossKg: 1.0,
  maxWeeklyLossFractionOfBodyWeight: 0.01,
  maxDailyDeficitKcal: 1000,       // NHLBI upper bound
  softFloorKcal: 'estimated_rmr',  // warn below estimated RMR
  hardFloorKcalMale: 1500,         // block below; NHLBI male LCD range is 1200-1600
  hardFloorKcalFemale: 1200,
  proteinGPerKg: { min: 1.6, target: 1.8, max: 2.2 },   // Morton 2018
  fibreGPerDay: 30,                                      // ANSES
  fatMinGPerKg: 0.8,
  fatMinFractionOfEnergy: 0.20,
  photoEstimateBand: { low: 0.75, high: 1.35 },
  namedPortionBand: { low: 0.85, high: 1.15 },
  labelBand: { low: 0.95, high: 1.05 },
  roundKcalComputed: 10,
  roundKcalEstimated: 25,
  roundMacroEstimatedG: 5,
} as const
```

---

## 9. Sources, with the date each was checked

All checked **2026-08-21**.

| Source | URL | Licence |
|---|---|---|
| ANSES CIQUAL | https://ciqual.anses.fr/ | Licence Ouverte 2.0 |
| CIQUAL 2025 dataset, DOI 10.57745/RDMHWY | https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY | etalab 2.0 |
| CIQUAL 2020 on data.gouv | https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual-2020 | fr-lo |
| Licence Ouverte 2.0 text | https://github.com/etalab/licence-ouverte/blob/master/LO.md | - |
| Open Food Facts data | https://world.openfoodfacts.org/data | ODbL 1.0 |
| Open Food Facts terms | https://world.openfoodfacts.org/terms-of-use | ODbL / DbCL / CC BY-SA |
| USDA FoodData Central | https://fdc.nal.usda.gov/download-datasets | Public domain, CC0 |
| USDA FNDDS portions | https://www.ars.usda.gov/.../2021-2023%20FNDDS%20At%20A%20Glance%20-%20Portions%20and%20Weights.xlsx | Public domain |
| Frida (DK) | https://frida.fooddata.dk/data | free, credit required |
| CoFID (UK) | https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid | Open Government Licence |
| Academy of Nutrition and Dietetics, RMR | https://www.andeal.org/template.cfm?template=guide_summary&key=4341 | - |
| Mifflin 1990, PMID 2305711 | https://doi.org/10.1093/ajcn/51.2.241 | - |
| NHLBI obesity guidelines | https://www.ncbi.nlm.nih.gov/books/NBK2004/ | - |
| CDC, losing weight | https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html | - |
| FAO/WHO/UNU 2004, human energy requirements | https://www.fao.org/3/y5686e/y5686e.pdf | - |
| Hall 2011, PMID 21872751 | https://doi.org/10.1016/S0140-6736(11)60812-X | - |
| Morton 2018, PMID 28698222 | https://doi.org/10.1136/bjsports-2017-097608 | - |
| Helms 2014, IJSNEM 24(2):127-138 | https://doi.org/10.1123/ijsnem.2013-0054 | - |
| Lucassen 2021, PMID 33761165 | https://doi.org/10.1111/jhn.12878 | - |
| Amoutzopoulos 2020, PMID 31999347 | https://doi.org/10.1093/nutrit/nuz107 | - |
| Le Moullec 1996, SU.VI.MAX photo manual validation | Cah Nutr Diét 1996;31:158-164 | book, copyrighted |
