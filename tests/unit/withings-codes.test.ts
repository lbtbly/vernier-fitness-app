import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TYPES,
  BLOOD_PRESSURE_TYPES,
  MEASTYPES_PARAM,
  METRIC_OF_TYPE,
  type WithingsMeasureGroup,
  attributionOf,
  decodeMeasure,
  externalKeyOf,
  harvest,
  isAllowedType,
  isBloodPressureType,
} from '@/lib/withings/codes';
import { DEMO_BLOOD_PRESSURE_GRPID, demoGroups } from '@/lib/withings/demo-dataset';

/**
 * The type table, the decode and the first of the two blood pressure nets.
 *
 * Everything asserted here comes out of `.forge/research/withings.md`, which
 * was read against the OpenAPI spec on 2026-08-21. Where a number here
 * disagrees with a live response, the research is what gets re-read.
 */

const SCALE_GRPID = 900_001;
const MONITOR_GRPID = 900_002;

function scaleGroup(): WithingsMeasureGroup {
  return {
    grpid: SCALE_GRPID,
    attrib: 0,
    date: 1_594_245_600,
    created: 1_594_246_600,
    modified: 1_594_257_200,
    category: 1,
    measures: [
      { value: 76542, type: 1, unit: -3 },
      { value: 2185, type: 6, unit: -2 },
      { value: 16725, type: 8, unit: -3 },
      { value: 59817, type: 5, unit: -3 },
      { value: 56430, type: 76, unit: -3 },
      { value: 3387, type: 88, unit: -3 },
      { value: 41220, type: 77, unit: -3 },
      { value: 62, type: 11, unit: 0 },
    ],
  };
}

/**
 * A blood pressure monitor on the same Withings account, which is the whole
 * reason the drop has to take the group rather than the measure: the group
 * holds systolic, diastolic AND the monitor's own heart rate, and type 11 is on
 * this product's allowlist.
 *
 * The two pressure measures carry a value of zero. A fixture holding a real
 * systolic reading would be this product writing a blood pressure number into
 * its own tree, which is the one thing the brief says it never does, and the
 * shape is what the rule reads.
 */
function monitorGroup(): WithingsMeasureGroup {
  return {
    grpid: MONITOR_GRPID,
    attrib: 0,
    date: 1_594_300_000,
    created: 1_594_300_004,
    modified: 1_594_300_004,
    category: 1,
    measures: [
      { value: 0, type: 9, unit: 0 },
      { value: 0, type: 10, unit: 0 },
      { value: 71, type: 11, unit: 0 },
    ],
  };
}

describe('the measure type allowlist', () => {
  it('is the eight codes, sent explicitly, and never an unfiltered call', () => {
    expect(MEASTYPES_PARAM).toBe('1,5,6,8,11,76,77,88');
    expect(ALLOWED_TYPES).toHaveLength(8);
    expect([...ALLOWED_TYPES]).toEqual([1, 5, 6, 8, 11, 76, 77, 88]);
    for (const type of ALLOWED_TYPES) expect(Object.hasOwn(METRIC_OF_TYPE, type)).toBe(true);
  });

  it('holds neither blood pressure code, and the two it names are 9 and 10', () => {
    expect([...BLOOD_PRESSURE_TYPES]).toEqual([9, 10]);
    for (const type of BLOOD_PRESSURE_TYPES) {
      expect(isBloodPressureType(type)).toBe(true);
      expect(isAllowedType(type)).toBe(false);
      expect(Object.hasOwn(METRIC_OF_TYPE, type)).toBe(false);
    }
  });

  it('leaves the cardiac codes alone, because they belong to another device', () => {
    // Pulse wave velocity, atrial fibrillation twice, the four ECG intervals
    // and vascular age. None is a scale reading and none is asked for.
    for (const type of [91, 130, 139, 135, 136, 137, 138, 155, 12, 54, 170, 226]) {
      expect(isAllowedType(type)).toBe(false);
    }
  });

  it('maps type 11 to a standing heart rate and never to the resting one', () => {
    // The watch reports a resting rate over a night and the scale reads a pulse
    // while the owner stands on it. Folding one into the other would put two
    // populations in one series and make the trend describe neither.
    expect(METRIC_OF_TYPE[11].metric).toBe('standing_heart_rate');
    expect(METRIC_OF_TYPE[11].unit).toBe('bpm');
  });
});

describe('the value decode', () => {
  it('reads the documented examples exactly', () => {
    expect(decodeMeasure(76542, -3)).toEqual({ text: '76.542', number: 76.542 });
    expect(decodeMeasure(2185, -2)).toEqual({ text: '21.85', number: 21.85 });
    expect(decodeMeasure(20, -1)).toEqual({ text: '2.0', number: 2 });
    expect(decodeMeasure(62, 0)).toEqual({ text: '62', number: 62 });
    expect(decodeMeasure(7, 3)).toEqual({ text: '7000', number: 7000 });
    expect(decodeMeasure(5, -3)).toEqual({ text: '0.005', number: 0.005 });
    expect(decodeMeasure(-2185, -2).text).toBe('-21.85');
  });

  it('shifts the digits rather than multiplying by a binary float', () => {
    // WHAT WOULD MAKE THIS GO RED: writing `value * 10 ** unit`, which is what
    // the spec's formula says and what IEEE 754 cannot do exactly. 70.064 kg is
    // a fat-free mass this owner will produce, and the naive computation stores
    // a raw value of "70.06400000000001": a number the product would print, and
    // a number that can never match the same reading arriving again.
    const naive = 70064 * 10 ** -3;
    expect(String(naive)).toBe('70.06400000000001');
    expect(decodeMeasure(70064, -3).text).toBe('70.064');
    expect(decodeMeasure(70064, -3).number).not.toBe(naive);
    expect(decodeMeasure(70064, -3).number).toBe(Number('70.064'));
  });

  it('never hard-codes a scale factor per type, because the exponent moves', () => {
    // The same type, two exponents, in one account. A per-type factor would
    // read the second of these as 8.61 kg.
    expect(decodeMeasure(86100, -3).number).toBe(86.1);
    expect(decodeMeasure(861, -1).number).toBe(86.1);
  });
});

describe('the attribution flag', () => {
  it('keeps a device reading and a hand-typed one, and refuses the other three', () => {
    expect(attributionOf(0)).toBe('device');
    expect(attributionOf(8)).toBe('device');
    expect(attributionOf(2)).toBe('manual');
    // 1 is ambiguous, 4 is flagged by Withings as possibly inaccurate, and 5 is
    // a blood pressure monitor writing automatically.
    expect(attributionOf(1)).toBe('refused');
    expect(attributionOf(4)).toBe('refused');
    expect(attributionOf(5)).toBe('refused');
  });
});

describe('the first blood pressure net, at the fetch layer', () => {
  it('drops the whole group, so the heart rate beside the pressure is never harvested', () => {
    const groups = [scaleGroup(), monitorGroup()];
    const result = harvest(groups);

    // The population this zero is beside, printed. A clean walk over nothing
    // reads exactly like a clean walk over everything, and the difference is
    // the whole of the third failure class this run keeps finding.
    console.log(
      `harvest walked ${result.groupsSeen} groups and ${result.measuresSeen} measures: ${JSON.stringify(
        groups.map((group) => ({ grpid: group.grpid, types: group.measures.map((m) => m.type) })),
      )}`,
    );
    expect(result.groupsSeen).toBe(2);
    expect(result.measuresSeen).toBe(11);

    // Nothing at all from the monitor's group.
    const fromMonitor = result.rows.filter((row) => row.grpid === MONITOR_GRPID);
    expect(fromMonitor).toEqual([]);

    // And specifically its type 11, which IS on the allowlist and would have
    // been harvested by any rule that filtered measure by measure.
    expect(result.rows.some((row) => row.type === 11 && row.grpid === MONITOR_GRPID)).toBe(false);

    // WHAT MAKES THAT ZERO MEAN SOMETHING: the scale's own type 11 is here. If
    // the drop were too wide, or if nothing were ever harvested, this fails.
    const scalePulse = result.rows.find((row) => row.type === 11 && row.grpid === SCALE_GRPID);
    expect(scalePulse?.value).toBe(62);
    expect(result.rows).toHaveLength(8);

    expect(result.droppedGroups).toEqual([
      { grpid: MONITOR_GRPID, dropped: 'blood_pressure', types: [9, 10, 11] },
    ]);
  });

  it('drops a group whose attribution is not the owner on this scale', () => {
    const ambiguous = { ...scaleGroup(), grpid: 900_003, attrib: 1 };
    const result = harvest([ambiguous]);
    expect(result.rows).toEqual([]);
    expect(result.droppedGroups[0].dropped).toBe('not_attributable');
    // Beside the population: the same group with attrib 0 harvests eight rows.
    expect(harvest([scaleGroup()]).rows).toHaveLength(8);
  });

  it('drops a user objective, because category 2 is a goal and not a measurement', () => {
    const objective = { ...scaleGroup(), grpid: 900_004, category: 2 };
    expect(harvest([objective]).rows).toEqual([]);
    expect(harvest([objective]).droppedGroups[0].dropped).toBe('objective');
  });

  it('keys every row on grpid and type, so the same measure has one identity', () => {
    const result = harvest([scaleGroup()]);
    expect(result.rows.map((row) => row.externalKey)).toEqual([
      `${SCALE_GRPID}:1`,
      `${SCALE_GRPID}:6`,
      `${SCALE_GRPID}:8`,
      `${SCALE_GRPID}:5`,
      `${SCALE_GRPID}:76`,
      `${SCALE_GRPID}:88`,
      `${SCALE_GRPID}:77`,
      `${SCALE_GRPID}:11`,
    ]);
    expect(externalKeyOf(123, 1)).toBe('123:1');
  });
});

describe('the demonstration account, which is a dataset and not a stub', () => {
  const anchor = '2026-08-23';

  it('carries six weeks of real body composition with two mornings missing', () => {
    const groups = demoGroups(anchor, anchor, 'initial');
    const scale = groups.filter((group) => group.grpid !== DEMO_BLOOD_PRESSURE_GRPID);
    console.log(`demonstration account holds ${groups.length} groups, ${scale.length} from the scale`);
    // Forty-three mornings less the two the owner was away.
    expect(scale).toHaveLength(41);
    for (const group of scale) {
      expect(group.measures.map((measure) => measure.type).sort((a, b) => a - b)).toEqual([
        1, 5, 6, 8, 11, 76, 77, 88,
      ]);
    }
  });

  it('holds one blood pressure group, so the drop has something real to drop', () => {
    const groups = demoGroups(anchor, anchor, 'initial');
    const bp = groups.find((group) => group.grpid === DEMO_BLOOD_PRESSURE_GRPID);
    expect(bp).toBeDefined();
    expect(bp!.measures.map((measure) => measure.type).sort((a, b) => a - b)).toEqual([9, 10, 11]);

    const result = harvest(groups);
    expect(result.rows.some((row) => row.grpid === DEMO_BLOOD_PRESSURE_GRPID)).toBe(false);
    expect(result.droppedGroups).toHaveLength(1);
    // 41 groups times 8 measures, and none of the three from the monitor.
    expect(result.rows).toHaveLength(41 * 8);
    expect(result.measuresSeen).toBe(41 * 8 + 3);
  });

  it('holds arithmetic the owner can check: fat mass plus fat-free mass is the weight', () => {
    const groups = demoGroups(anchor, anchor, 'initial');
    const rows = harvest(groups).rows.filter((row) => row.grpid === groups[0].grpid);
    const by = (metric: string) => rows.find((row) => row.metric === metric)!.value;
    expect(by('fat_mass') + by('fat_free_mass')).toBeCloseTo(by('weight'), 2);
    expect(by('muscle_mass') + by('bone_mass')).toBeCloseTo(by('fat_free_mass'), 2);
    expect((by('fat_mass') / by('weight')) * 100).toBeCloseTo(by('fat_ratio'), 1);
  });

  it('revises the newest group when the fixture moves on, and bumps its modification time', () => {
    const before = demoGroups(anchor, anchor, 'initial');
    const after = demoGroups(anchor, anchor, 'revised');
    const newestBefore = before.find((group) => group.grpid !== DEMO_BLOOD_PRESSURE_GRPID)!;
    const newestAfter = after.find((group) => group.grpid === newestBefore.grpid)!;

    expect(newestAfter.modified).toBeGreaterThan(newestBefore.modified);
    expect(newestAfter.measures[0].value).not.toBe(newestBefore.measures[0].value);
    // Everything else is untouched, so an incremental poll carries one group.
    const changed = after.filter((group) => {
      const was = before.find((other) => other.grpid === group.grpid);
      return !was || was.modified !== group.modified;
    });
    expect(changed.map((group) => group.grpid)).toEqual([newestBefore.grpid]);
  });
});
