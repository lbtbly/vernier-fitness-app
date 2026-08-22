/**
 * What a measurement looks like once it has left the database and before it has
 * reached a screen.
 *
 * Data only. No sentence is composed here and no label is chosen here: the
 * provenance columns travel as the values they are and every word around them
 * comes from the string catalogue at render time. The one exception is
 * `dedupReason`, which is a stored record of a decision, written once when the
 * row was written and never re-worded after.
 *
 * Client safe: no database import, so a component can hold one of these without
 * dragging the query builder into the browser bundle.
 */
export type MeasurementView = {
  id: string;
  rootId: string;
  metric: string;
  rawValue: string;
  rawUnit: string;
  value: number | null;
  unit: string;
  conversionFactor: number | null;
  timeZone: string;
  source: string;
  measuredAt: string;
  importedAt: string;
  confidence: string;
  importVersion: string;
  dedupDecision: string;
  dedupReason: string;
  sourceRecordId: string;
  correctionIndex: number;
  correctionReason: string | null;
  /** Set when the source record stands in for a different origin, as a demo row does. */
  sourceRecordSource: string | null;
};

/** What the quick-log sheet needs to open: the last waist reading and today's entries. */
export type LogSnapshot = {
  asOf: string;
  timeZone: string;
  today: MeasurementView[];
  lastWaist: MeasurementView | null;
  openQuestions: number;
};
