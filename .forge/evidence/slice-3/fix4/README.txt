# The five C6 closures, attacked. Builder, 2026-08-22, after the fourth verify.

Every plant the verifier used at reverify4, reproduced against the closed
checks. The tree was rebuilt with the plants in it, the database re-seeded
through the boot path, both checks run, and every plant removed again. No plant
reached a commit: git log --all -S over "page 4, row 11", "A directory that did
not exist yesterday" and "Vernier checked the door" returns nothing, and
git grep over src and public at HEAD finds none of the attack strings.

1. Seed copy read back as owner data.
   Planted: src/db/demo.ts reference 'page 4, row 11' on the laboratory row,
   rebuilt, truncated, re-seeded so the column really carried it.
   npm run strings          exit 0, it is not a sentence and never was
   npm run strings:rendered exit 1
     /source/[id]  [source record demo_src_ldl]  span.num
       read: "page 4, row 11"   why: no catalogue key accounts for it
   The six references and the six word-bearing detail values are catalogue keys
   now, and DATA_QUERIES reads `where not seed`, so the seed cannot excuse
   itself through a column again.

2. A CSS content property.
   Planted: .chip::after{content:" Not synced yet"} in src/app/globals.css.
   npm run strings          exit 1  src/app/globals.css:556  css content
   npm run strings:rendered exit 1, twenty fragments, every chip on every
     surface, read off getComputedStyle(element, '::after') as span.chip::after.

3. The <code> exemption.
   Planted: helperNote() returning 'sign-in', rendered as <code>{helperNote()}</code>.
   npm run strings          exit 0, still a shape and not a sentence
   npm run strings:rendered exit 1 in three states
     / quick log  [the answer carried no words]  code  read: "sign-in"
   MACHINE_TEXT_ELEMENTS and MACHINE_TOKENS are deleted. No element is exempt.

4. The forged provenance marker.
   Planted: <span data-authored="platform">Load failed</span>.
   The rendered walk still excuses the fragment, four states, because both
   halves of provenance genuinely hold: the markup says platform and WebKit
   said "Load failed" in that run. That is the defeat, and it is closed from
   the other side. The same run reads the shipped tree:
     rendered strings: 1 literal(s) in the shipped tree impersonate the platform
       src/components/QuickLog.tsx:459  "Load failed"
   exit 1. 73 files of src and public are read for the browser's own words on
   every run, and the words are printed beside the count.

5. The root of src/.
   Planted: a sentence in src/middleware.ts.
     npm run strings exit 1  src/middleware.ts:40  sentence
       "Vernier checked the door and the door was locked."
   And a directory that did not exist when the walk was written:
     npm run strings exit 1  src/features/probe.ts:1  sentence
   There is no directory list any more. The walk is src/, all of it, .ts, .tsx
   and .css, and what is still outside it is printed on every run.

Nothing else got through in this pass. What remains outside the union is
printed by the checks themselves: public/sw.js, which cannot import the
catalogue; a screen no seeded state can reach; and two catalogued strings placed
next to each other, which A4 puts under the screen line that owns the screen.
