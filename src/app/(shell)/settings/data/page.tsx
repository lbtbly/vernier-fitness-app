import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DataControls } from '@/components/DataControls';
import { OperatorAlerts } from '@/components/OperatorAlerts';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ChevronIcon, DownloadIcon, OkIcon, ShieldIcon, WarnIcon } from '@/components/icons';
import { readOpenAlerts } from '@/db/alerts';
import { readDeletionRuns } from '@/db/backup';
import { readMachineStatus } from '@/db/machine';
import { readDeletableCategories } from '@/db/purge';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { alertBody, categoryLabel, fileSize } from '@/lib/display';
import { longDate, shortDateTime, time24 } from '@/lib/format';
import { readSession } from '@/lib/session';
import { strings } from '@/lib/strings';
import * as schema from '@/db/schema';
import { enumerateSchemaTables, exportedTables } from '@/lib/backup/tables';

/**
 * How many tables a download carries, counted from the schema rather than
 * written down: a slice that adds one moves this number without anybody
 * remembering to.
 */
const exportedTableCount = exportedTables(
  enumerateSchemaTables(schema as unknown as Record<string, unknown>),
).length;

export const metadata = { title: strings.data.title };
export const dynamic = 'force-dynamic';

/**
 * Screen 12 frame 3: the archive, the export, this machine, and the one control
 * in this product that destroys something.
 *
 * IT IS THE OPERATOR'S SINGLE SURFACE and it is deliberately one screen rather
 * than four cards spread across Settings. The two questions the sheet says an
 * operator asks at 23:00 are what the listener binds to and whether last
 * night's archive verified, and both are answered here without scrolling past
 * anything that is not about this machine.
 *
 * NO CREDENTIAL IS RENDERED, and the card that says so out loud is drawn from
 * the sheet. Every value on this page is state: a path, an instant, a count, a
 * version, a free-space figure. `tests/e2e/backup.spec.ts` searches the rendered
 * markup for the seeded credential values and expects none of them.
 */
export default async function DataPage() {
  const config = getConfig();
  const session = await readSession();
  if (!session) redirect('/sign-in');

  const [csrfToken, machine, categories, deletions, alerts] = await Promise.all([
    readCsrfToken(),
    readMachineStatus(),
    readDeletableCategories(),
    readDeletionRuns(5),
    readOpenAlerts(),
  ]);

  const when = (iso: string | null) =>
    iso === null ? null : shortDateTime(new Date(iso), config.timeZone);

  const archive = machine.archive;
  const archiveChip =
    archive.integrity === 'verified'
      ? { className: 'chip g', text: strings.data.archiveVerified }
      : archive.outcome === 'failed'
        ? { className: 'chip a', text: strings.data.archiveFailedChip }
        : { className: 'chip w', text: strings.data.archiveUnverified };

  return (
    <>
      <ScreenTitle label={strings.settings.title} title={strings.data.title} sub={strings.data.sub} />

      <OperatorAlerts alerts={alerts} timeZone={config.timeZone} />

      {/* The archive card, which is the first thing on the sheet and the first
          thing an operator wants. */}
      <section className="card" data-card="archive">
        <span className="lbl">{strings.data.archiveTitle}</span>
        {archive.lastGoodAt === null ? (
          <div className="card empty" style={{ marginTop: 'var(--s3)' }} data-state="empty">
            <div className="head">{strings.data.archiveNever}</div>
            <p className="sub">{strings.data.archiveNeverBody}</p>
          </div>
        ) : (
          <div className="between" style={{ alignItems: 'flex-end', marginTop: 'var(--s2)' }}>
            <div className="stack">
              <span className="metric" data-archive-at="true">
                {longDate(new Date(archive.lastGoodAt), config.timeZone)},{' '}
                {time24(new Date(archive.lastGoodAt), config.timeZone)}
              </span>
              <span className="note num">{strings.data.archiveEncrypted(fileSize(archive.bytes))}</span>
            </div>
            <span className={archiveChip.className} data-archive-integrity={archive.integrity}>
              {archive.integrity === 'verified' ? <OkIcon /> : <WarnIcon />}
              {archiveChip.text}
            </span>
          </div>
        )}

        <div className="row" style={{ marginTop: 'var(--s3)' }}>
          <span className="grow sub mut">{strings.data.archiveDestination}</span>
          <span className="num" data-archive-destination={archive.destination}>
            {archive.destination === 'configured'
              ? archive.directory
              : strings.data.archiveDestinationFallback}
          </span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.data.archiveRetention}</span>
          <span className="num">{strings.data.archiveRetentionValue(archive.retention)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.data.archiveRestoreTested}</span>
          <span className={machine.restore.warn ? 'num warn' : 'num'} data-restore-checked="true">
            {when(machine.restore.lastAt) ?? strings.data.archiveRestoreNever}
          </span>
        </div>
        {archive.lastGoodAt === null ? null : (
          <div className="row">
            <span className="grow sub mut">{strings.data.archiveList}</span>
            <span className="num" data-archive-count={archive.onDisk.length}>
              {strings.data.archiveRetentionValue(archive.onDisk.length)}
            </span>
          </div>
        )}

        <DataControls
          csrfToken={csrfToken}
          categories={categories}
          archiveRunning={archive.outcome === 'running'}
        />
      </section>

      {/* Export, three rows, one per shape, exactly as the sheet draws them. */}
      <section className="card" data-card="export">
        <span className="lbl">{strings.data.exportTitle}</span>
        {[
          {
            id: 'json',
            title: strings.data.exportJson,
            body: strings.data.exportJsonBody,
            action: strings.data.exportJsonAction,
            href: '/api/export/json',
          },
          {
            id: 'csv',
            title: strings.data.exportCsv,
            body: strings.data.exportCsvBody,
            action: strings.data.exportCsvAction,
            href: '/api/export/csv',
          },
          {
            id: 'pdf',
            title: strings.data.exportPdf,
            body: strings.data.exportPdfBody,
            action: strings.data.exportPdfAction,
            href: '/api/export/pdf',
          },
        ].map((row) => (
          <div className="row" key={row.id}>
            <div className="stack grow">
              <span>{row.title}</span>
              <span className="note">{row.body}</span>
            </div>
            {/*
              A plain anchor with `download`, not a fetch. The response is a
              stream with a Content-Disposition on it, and letting the browser
              own the download is what keeps a two hundred megabyte export off
              the main thread and out of memory.
            */}
            <a
              className="btn icon"
              href={row.href}
              download
              aria-label={row.action}
              data-export={row.id}
            >
              <DownloadIcon />
            </a>
          </div>
        ))}
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.data.exportNote(exportedTableCount)}
        </p>
      </section>

      {/* This machine. Container state, headroom, the two instants, the syncs,
          and the thresholds each of them is judged against. */}
      <section className="card" data-card="machine">
        <span className="lbl">{strings.data.machineTitle}</span>
        {machine.containers.map((container) => (
          <div className="row" key={container.name} data-container={container.name}>
            <span className="grow sub mut">
              {container.name === 'app' ? strings.data.machineApp : strings.data.machineDatabase}
            </span>
            <span className={container.running ? 'chip g' : 'chip a'}>
              {container.running
                ? strings.data.machineRunning(
                    container.since ? shortDateTime(new Date(container.since), config.timeZone) : '',
                  )
                : strings.data.machineUnreachable}
            </span>
          </div>
        ))}
        {machine.containers[1].version === '' ? null : (
          <div className="row">
            <span className="grow sub mut">{strings.data.machineDatabase}</span>
            <span className="num">{strings.data.machinePostgres(machine.containers[1].version)}</span>
          </div>
        )}
        {machine.disks.map((disk) => (
          <div className="row" key={disk.label} data-disk={disk.label}>
            <span className="grow sub mut">{strings.data.machineDisk}</span>
            <span className={disk.warn ? 'num warn' : 'num'} data-disk-warn={disk.warn ? 'true' : 'false'}>
              {disk.free === null || disk.total === null
                ? strings.data.machineDiskUnknown
                : strings.data.machineDiskValue(fileSize(disk.free), fileSize(disk.total))}
            </span>
          </div>
        ))}
        <div className="row">
          <span className="grow sub mut">{strings.data.machineArchive}</span>
          <span className={archive.warn ? 'num warn' : 'num'} data-machine-archive="true">
            {when(archive.lastGoodAt) ?? strings.data.archiveNever}
          </span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.data.machineRestore}</span>
          <span className={machine.restore.warn ? 'num warn' : 'num'}>
            {when(machine.restore.lastAt) ?? strings.data.archiveRestoreNever}
          </span>
        </div>
        {machine.integrations.map((integration) => (
          <div className="row" key={integration.provider} data-machine-sync={integration.provider}>
            <span className="grow sub mut">
              {strings.data.machineSync}: {integration.name}
            </span>
            <span className={integration.warn ? 'num warn' : 'num'}>
              {integration.lastSuccessfulSyncAt
                ? shortDateTime(new Date(integration.lastSuccessfulSyncAt), config.timeZone)
                : strings.data.machineNeverSynced}
            </span>
          </div>
        ))}
        <div className="row">
          <span className="grow sub mut">{strings.data.machineListening}</span>
          <span className="mono">{machine.origin.listener}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.data.machineOrigin}</span>
          <span className="mono">{machine.origin.appUrl}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.data.machineRpId}</span>
          <span className="mono">{machine.origin.rpId}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.data.machineThresholds}</span>
          <span className="num" data-thresholds="true">
            {strings.data.machineThresholdsValue(
              fileSize(machine.thresholds.diskBytes),
              machine.thresholds.archiveHours,
              machine.thresholds.syncHours,
            )}
          </span>
        </div>
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.data.machineNote}
        </p>
      </section>

      {/* What this screen never shows, from frame 1 of the same sheet. */}
      <section className="card flat" style={{ borderStyle: 'dashed' }} data-card="no-credential">
        <div className="between" style={{ marginBottom: 'var(--s1)' }}>
          <span className="lbl">{strings.data.neverShownTitle}</span>
          <ShieldIcon />
        </div>
        <p className="sub">{strings.data.machineNoCredential}</p>
      </section>

      {/* How a restore works, which the archive card's second button points at. */}
      <section className="card" id="restore" data-card="restore">
        <span className="lbl">{strings.data.restoreTitle}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.data.restoreBody}
        </p>
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.data.restoreVerify}
        </p>
        <p className="mono">
          {strings.data.restoreVerifyCommand(archive.fileName || strings.data.archiveNamePattern)}
        </p>
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.data.restoreInto}
        </p>
        <p className="mono">
          {strings.data.restoreIntoCommand(
            archive.fileName || strings.data.archiveNamePattern,
            strings.data.restoreCheckDatabase,
          )}
        </p>
        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.data.restoreLive}
        </p>
        <p className="note">{strings.data.restoreDoc}</p>
      </section>

      {deletions.length === 0 ? null : (
        <section className="card" data-card="deletions">
          <span className="lbl">{strings.data.deleteHistory}</span>
          {deletions.map((deletion) => (
            <div className="row" key={deletion.id} data-deletion={deletion.category}>
              <span className="grow sub">
                {strings.data.deleteHistoryRow(
                  categoryLabel(deletion.category),
                  shortDateTime(new Date(deletion.requestedAt), config.timeZone),
                  Object.values(deletion.removed).reduce((total, count) => total + Number(count), 0),
                )}
              </span>
              <span className={deletion.outcome === 'done' ? 'chip' : 'chip w'}>
                {deletion.outcome === 'done'
                  ? strings.data.deleteAction
                  : strings.data.deleteRefused}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* Blood pressure, which has no setting because there is nothing to set.
          Frame 3 of the sheet draws this card and these words. */}
      <section className="card flat" style={{ borderStyle: 'dashed' }} data-card="blood-pressure">
        <span className="lbl">{strings.data.bloodPressureLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s1)' }}>
          {strings.data.bloodPressureBody}
        </p>
      </section>

      <div className="actions">
        <Link prefetch={false} className="btn quiet block" href="/settings">
          {strings.settings.title}
          <ChevronIcon />
        </Link>
      </div>

      {alerts.length === 0 ? null : (
        <p className="visually-hidden" data-alert-summary="true">
          {alertBody(alerts[0].cause, alerts[0].detail)}
        </p>
      )}
    </>
  );
}
