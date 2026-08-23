import Link from 'next/link';
import { DietaryRules } from '@/components/DietaryRules';
import { GenerateWeek } from '@/components/GenerateWeek';
import { ScreenTitle } from '@/components/ScreenTitle';
import { TargetEditor } from '@/components/TargetEditor';
import { DEFAULT_MAX_COOK_MINUTES, readLatestWeight, readRuleRows, readTarget } from '@/db/nutrition';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { sourceLabel } from '@/lib/display';
import { shortDate } from '@/lib/format';
import { type PalLevel, type Sex } from '@/lib/nutrition';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.nutrition.targetsTitle };

/**
 * Where the daily figures come from, and the three floors that stand between a
 * number and the database.
 *
 * The weight is prefilled from the latest stored reading with its source named
 * beside it, and it is editable: the equation needs a weight and the owner may
 * have weighed himself somewhere this app cannot see. With nothing stored the
 * field says so rather than starting at a number nobody measured.
 */
export default async function TargetsPage() {
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();
  const [target, weight, rules] = await Promise.all([
    readTarget(),
    readLatestWeight(),
    readRuleRows(),
  ]);

  const weightSource = weight
    ? strings.nutrition.weightFrom(sourceLabel(weight.source), shortDate(weight.at, timeZone))
    : strings.nutrition.weightNone;

  return (
    <>
      <ScreenTitle
        label={strings.tabs.eat}
        title={strings.nutrition.targetsTitle}
        sub={strings.nutrition.targetsSub}
      />
      <TargetEditor
        csrfToken={csrfToken}
        weightSource={weightSource}
        initial={{
          sex: (target?.sex as Sex) ?? 'male',
          ageYears: target ? String(target.ageYears) : '',
          heightCm: target ? String(target.heightCm) : '',
          weightKg: target ? String(target.weightKg) : weight ? weight.kg.toFixed(1) : '',
          level: (target?.activityLevel as PalLevel) ?? 'light',
          rateKgPerWeek: target ? target.rateKgPerWeek.toFixed(2) : '0.33',
        }}
      />
      <DietaryRules rules={rules} csrfToken={csrfToken} />
      {target ? (
        <GenerateWeek csrfToken={csrfToken} maxCookMinutes={DEFAULT_MAX_COOK_MINUTES} />
      ) : null}
      <p className="note centre" style={{ paddingBottom: 'var(--s5)' }}>
        <Link href="/eat">{strings.tabs.eat}</Link>
      </p>
    </>
  );
}
