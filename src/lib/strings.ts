/**
 * Every user-facing string in the shell, keyed. Nothing is written inline in a
 * component, so the pseudo-locale run and the string inventory both have one
 * place to read. English ships first; the shape is here for the second language.
 */
export const strings = {
  tabs: {
    today: 'Today',
    health: 'Health',
    train: 'Train',
    eat: 'Eat',
    settings: 'Settings',
  },

  today: {
    title: 'Today',
    emptyTitle: 'Nothing planned yet',
    emptyBody:
      'Your day fills in once the owner account exists and a source is connected. Until then there is nothing here, and the app will not invent a number to fill the space.',
    /**
     * The sentence that keeps the daily number in its place, and F35 turns on
     * it. It sits under the chart, in note type, beside the reading it is about.
     */
    hydration: 'One reading moves with hydration, so the average is what the app reads.',
    since: (when: string) => `since ${when}`,
    waistMeasured: (when: string) => `Measured ${when}.`,
    closing: "Trends over days, never this morning's number.",
  },

  health: {
    title: 'Health',
    sub: 'Weight, waist, activity, sleep and the lab archive',
    emptyTitle: 'No measurements yet',
    emptyBody:
      'Weight and waist share one axis here, with activity, sleep, resting heart rate and your blood panels below them. The first reading starts the trend.',
    rangeLabel: 'How far back',
    range7: '7 days',
    range30: '30 days',
    range6m: '6 months',
    rangeYear: 'Year',
    /** F35's sentence, on the screen the rubric names it on. */
    hydration:
      'Percentages and weights from the scale move with hydration. Read the 28-day direction, not today.',
    closing: 'Tap any number to see where it came from and every correction it has ever had.',
    noBloodPressure:
      'Blood pressure is not handled anywhere in this app, by design. There is no field to fill and no toggle to find.',
  },

  train: {
    title: 'Train',
    sub: 'The proposed week, the session player and the movement catalogue',
    emptyTitle: 'No sessions yet',
    emptyBody:
      'Three to five sessions are proposed each week, each one carrying the reason it was placed where it was, and each one accepted on its own.',
  },

  settings: {
    title: 'Settings',
    sub: 'The operator surface: integrations, consent, backup and machine state',
    installationTitle: 'This installation',
    installationNote:
      'These four values come from the environment file on the Mac mini and are read on every request. No credential is rendered on this screen, now or ever.',
    fieldAppName: 'Application name',
    fieldOrigin: 'Application origin',
    fieldRpId: 'Passkey relying party',
    fieldTimeZone: 'Time zone',
    emptyTitle: 'No integrations connected',
    emptyBody:
      'Withings, Apple Health, Google Calendar and the mail relay each connect from here, and each one reports its state and its last successful sync. None is connected yet.',

    integrationsTitle: 'Integrations',
    integrationsNote:
      'A credential entered here is encrypted with the master key on this machine before it is written, and it is never rendered again. This screen shows state, scope and last successful sync, which is everything you need to know whether a source is working.',
    stateLabel: 'State',
    /**
     * The chip beside each integration. `integration.state` is a column value
     * with three settings and it used to be printed straight onto the screen,
     * so `/settings` carried four chips reading "not connected" from the
     * database rather than from here. A state is a fact the database keeps; the
     * words for it are copy and belong in this file.
     */
    integrationStates: {
      connected: 'Connected',
      disconnected: 'Not connected',
      error: 'Not working',
    },
    scopeLabel: 'Scope',
    lastSyncLabel: 'Last successful sync',
    neverSynced: 'No successful sync yet',
    chooseIntegration: 'Which integration',
    credentialLabel: 'Credential',
    credentialHelp:
      'Paste the token or key the service issued. It is encrypted on arrival and cannot be read back from this screen, an API response or a log line.',
    saveCredential: 'Save the credential',
    disconnect: 'Disconnect',
    checkCredential: 'Check it still opens',
    checkPassed: 'The stored credential opens under the running master key.',
    checkFailed: 'The stored credential did not open. The master key does not match the one it was written with.',
    saved: 'Saved and encrypted.',
    disconnected: 'Disconnected. The stored credential was deleted.',

    passkeysTitle: 'Passkeys',
    passkeysNote:
      'A passkey is bound to the relying party, which is the tailnet name and not the machine name, so renaming the Mac mini does not invalidate it.',
    passkeysEmpty: 'No passkey is registered yet. The backup password is the only way in.',
    addPasskey: 'Add a passkey on this device',
    passkeyAdded: 'Passkey added.',
    passkeyDeviceType: 'Device type',
    passkeyBackedUp: 'Backed up',
    passkeyLastUsed: 'Last used',
    passkeyNeverUsed: 'Not used yet',
    passkeySynced: 'Synced',
    passkeyLocal: 'This device only',
    yes: 'Yes',
    no: 'No',

    sessionTitle: 'This session',
    signOut: 'Sign out',
    signedInWith: 'Signed in with',
    sessionExpires: 'This session expires',
    /** How the live session was opened. The column holds a token; these are the words. */
    sessionMethods: {
      passkey: 'A passkey on this device',
      password: 'The backup password',
      bootstrap: 'The one-time account setup',
      recovery: 'A recovery link minted on the Mac mini',
    },
    /** What the authenticator reported about where the passkey lives. */
    passkeyDeviceTypes: {
      singleDevice: 'Bound to one device',
      multiDevice: 'Usable across your devices',
    },

    /**
     * The four integrations, named and explained. The scope beside each one in
     * src/db/integrations.ts is an OAuth value and stays there: it is what the
     * service was asked for, not a sentence written for a reader.
     */
    providers: {
      withings: {
        name: 'Withings',
        purpose: 'Weight, fat mass and heart rate from the Body Smart scale.',
      },
      apple_health: {
        name: 'Apple Health',
        purpose: 'Steps, workouts, sleep and resting heart rate from the iPhone shortcut.',
      },
      google_calendar: {
        name: 'Google Calendar',
        purpose: 'Free-busy reads and writes into the Vernier calendar only.',
      },
      mail_relay: {
        name: 'Mail relay',
        purpose: 'The Sunday review, sent from this machine.',
      },
    },
  },

  signIn: {
    title: 'Sign in',
    lead: 'Your health data, on your machine.',
    passkeyAction: 'Sign in with passkey',
    passwordAction: 'Use the backup password',
    passkeyRetry: 'Try the passkey again',
    passwordLabel: 'Backup password',
    passwordSubmit: 'Sign in',
    working: 'Working',
    tailscaleNote:
      'Tailscale gets you to this screen. It does not get you in. A passkey or the backup password is always required.',
    rpNoteLead: 'Passkeys are registered to',
    rpNoteTail:
      'which is the tailnet and not the machine name. Renaming the Mac mini keeps them working.',
    fieldOrigin: 'Application origin',
    fieldRpId: 'Passkey relying party',
    fieldRpName: 'Relying party name',

    createTitle: 'Create the owner account',
    createLead:
      'This runs once. After it completes, this screen is gone and the only way in is a passkey or this password.',
    createAction: 'Create account and add a passkey',
    createWorking: 'Creating the account',
    repeatLabel: 'Repeat it',
    passwordRequirement: (length: number) =>
      `At least 12 characters. You typed ${length}.`,
    /** The same three sentences src/lib/password.ts returns, so the rule and the copy are one. */
    passwordTooShort: (minimum: number, typed: number) =>
      `At least ${minimum} characters. You typed ${typed}.`,
    passwordTooLong: (maximum: number) => `At most ${maximum} characters.`,
    passwordRepeated: 'One character repeated is not a password.',
    passwordVariety: 'Three of these four: a lower case letter, a capital, a digit, a symbol.',
    passwordReuse: 'Not a password you use anywhere else.',
    passwordHashNote: 'Hashed with Argon2id on this machine. It never leaves it.',
    repeatMatch: 'Both fields match.',
    repeatMismatch: 'The two fields do not match yet.',
    nextStepLabel: 'Next step',
    nextStepChip: 'Recommended',
    nextStepBody:
      'Add a passkey with Face ID right after. The password stays as the way back in if the phone is lost.',
    loseBothLabel: 'If you lose both',
    loseBothBody:
      'Recovery is a local procedure you run on the Mac mini, written down in docs/security.md. No security question. No password sent by email. Nothing to phone up and ask for.',

    refused: 'That did not work.',
    passkeyRegistered: 'Passkey added. Opening Vernier.',
    passkeySkipped:
      'The account exists and the password works. This browser offered no passkey, so add one from Settings on the iPhone or the Mac.',
    unreachableTitle: 'The Mac mini is not answering.',
    unreachableBody:
      'This device cannot reach the origin. Either it has left the tailnet, or the Mac mini is asleep or stopped. Sign-in needs the machine; nothing here works from the cache.',
    unreachableAction: 'Try again',
    stillUnreachable: 'Still no answer. The machine is asleep, stopped, or off the tailnet.',
    reachable: 'The Mac mini is answering again. Try signing in.',
  },

  offline: {
    title: 'Offline',
    cardTitle: 'This phone cannot reach the Mac mini',
    causePrefix: 'The app shell is stored on this device, so it opened. Everything else waits for',
    causeSuffix:
      'Either this device has left the tailnet, or the Mac mini is asleep or stopped.',
    action: 'Try again',
    worksTitle: 'What works offline',
    worksBody:
      'The shell, the five tabs and this screen. Nothing has been lost and nothing needs redoing.',
  },

  notFound: {
    title: 'No such page',
    body: 'That address is not part of Vernier. The five tabs below are the whole app.',
    action: 'Open Today',
  },

  error: {
    failedChip: 'Failed',
    title: 'This screen failed to load',
    lead: 'The rest of the app is unaffected. The five tabs below still work.',
    action: 'Try again',
    digestLabel: 'Error reference',
  },

  common: {
    createAccount: 'Set up the owner account',
    loading: 'Loading',
    close: 'Close',
    back: 'Back',
    cancel: 'Cancel',
    retry: 'Try again',
    /** The product name, which is copy like any other and has a key like any other. */
    productName: 'Vernier',
    sections: 'Sections',
  },

  /**
   * What a route says when it refuses, and what the shell says when a write
   * cannot be applied.
   *
   * These are user-facing copy like any other. A refusal reaches a person: the
   * gate renders the error field straight onto the screen, the value sheet
   * renders it into the error card, and a `curl` on the tailnet reads it as
   * prose. Naming a JSON field to that person, which this catalogue used to do
   * in four places, tells them nothing they can act on.
   *
   * Every line here is one cause and one next step, which is what screen 00's
   * error card draws and what D3 grades.
   */
  api: {
    jsonBody: 'Expected a JSON body.',

    session: {
      signInFirst: 'Sign in first.',
      signInFirstDetail:
        'This endpoint needs the owner session, and the cookie on this request names none.',
    },

    csrf: {
      failed: 'Anti-forgery check failed.',
      noHeader: (header: string) => `This request carried no ${header} header. Nothing was written.`,
      noCookie:
        'This request carried no anti-forgery cookie. Reload the sign-in screen and try again.',
      mismatch:
        'The anti-forgery token does not match the one issued to this browser. Nothing was written.',
      stale: 'The anti-forgery token predates the current session. Reload the screen and try again.',
    },

    log: {
      noKey: 'This write carried no idempotency key.',
      noKeyDetail:
        'Every quick-log write is keyed by the client UUID its outbox entry holds, so a retry applies once.',
      bodyDetail: 'Open the quick log and save again. Nothing was stored.',
      nothingSent: 'Nothing was sent to store.',
      nothingSentDetail: 'Fill at least one field before saving.',
      /**
       * Every value in the write was refused, so nothing was stored. One
       * outcome, one shape: this answers 422 exactly as a refused correction
       * does, rather than 200 with a list of rejections the caller has to
       * notice.
       */
      allRejected: 'Nothing in that entry could be stored.',
      allRejectedDetail:
        'Every value in it was refused and each one carries its reason. Fix them and save again; nothing was written.',
      unknownMetric: (metric: string) => `Vernier stores no metric called ${metric}.`,
      blank: 'A blank field is not stored. Blank stays blank, never zero.',
      notANumber: (raw: string) => `${raw} is not a number, so it was not stored.`,
      outOfRange: (min: number, max: number) =>
        `A rating is a whole number from ${min} to ${max}.`,
      outOfBand: (metric: string, low: string, high: string, unit: string) =>
        `${metric} is stored between ${low} and ${high} ${unit}. Nothing outside that is a measurement.`,
      correctionNeedsValue: 'That correction is missing the new number.',
      correctionRefused: 'That correction was not stored.',
      correctionNeedsValueDetail:
        'Type the number it should be and save again. The original is kept either way.',
      correctionTargetGone: (id: string) => `There is no value ${id} to correct.`,
      correctionTargetGoneDetail:
        'It was never stored, or this screen is older than the database. Open Today again.',
      failed: 'That write did not go through.',
      failedDetail:
        'Nothing was stored and nothing was changed. Try again; if it keeps failing, the Mac mini is the place to look.',
      alreadyApplying: 'This write is already being applied under the same idempotency key.',
    },

    correction: {
      /** Screen 00's error card, on the value sheet. One cause, one action. */
      title: 'The correction was not saved',
      lead: 'The value on file has not moved and nothing was written.',
      chip: 'Failed',
      retry: 'Try again',
    },

    bootstrap: {
      bodyDetail: 'Type the password twice and try again.',
      /** The owner's name when he gives none. It reaches the screen, so it has a key. */
      defaultDisplayName: 'Owner',
      ownerExists: 'The owner account already exists.',
      ownerExistsDetail:
        'Vernier holds exactly one account and it is created once. Sign in with your passkey or the backup password.',
      mismatch: 'The two passwords do not match.',
      mismatchDetail: 'Type the same password in both fields.',
      weak: 'That password is not strong enough.',
    },

    password: {
      bodyDetail: 'Type the backup password and try again.',
      noOwner: 'No owner account yet.',
      noOwnerDetail: 'Nothing has been created on this machine. Create the owner account first.',
      createOwnerFirst: 'Create the owner account first.',
      wrong: 'That password does not match.',
    },

    passkey: {
      bodyDetail: 'The passkey ceremony did not finish on this device. Start it again.',
      /** What a passkey is called when the owner names it nothing. Settings prints it. */
      defaultLabel: 'This device',
      notAnAssertion: 'That is not a passkey assertion.',
      notARegistration: 'That is not a passkey registration.',
      noneRegistered: 'No passkey is registered yet.',
      noneRegisteredDetail: 'Sign in with the backup password, then add a passkey from Settings.',
      ceremonyExpired: 'That passkey attempt expired.',
      ceremonyExpiredDetail:
        'Ceremonies last two minutes and are good for one use. Try the passkey again.',
      registrationExpired: 'That registration expired.',
      registrationExpiredDetail: 'Ceremonies last two minutes and are good for one use. Start again.',
      noMatch: 'No passkey on this device matched.',
      notVerified: 'That passkey did not verify.',
      notVerifiedDetail: 'The attestation did not check out against this relying party.',
    },

    rateLimit: {
      tooMany: 'Too many attempts.',
      paused: (seconds: number) => `Sign-in is paused for ${seconds} seconds.`,
      attemptsLeft: (left: number, windowSeconds: number) =>
        `${left} ${left === 1 ? 'attempt' : 'attempts'} left, then a ${windowSeconds} second pause.`,
      attemptsLeftShort: (left: number) => `${left} attempts left.`,
      window: (windowSeconds: number, wait: number) =>
        `Five failures inside ${windowSeconds} seconds pauses sign-in. Wait ${wait} seconds and try again.`,
      windowPassword: (windowSeconds: number, wait: number) =>
        `Five failures inside ${windowSeconds} seconds pauses sign-in. Wait ${wait} seconds and try again. A correct password will not open it any sooner.`,
    },

    /**
     * The goal route. It edits an intention and not a measurement, so it takes
     * an UPDATE, and every refusal here still writes nothing at all.
     */
    goal: {
      bodyDetail: 'Open the goal on Health and save again. Nothing was written.',
      noGoal: 'There is no goal to edit.',
      noGoalDetail:
        'A goal is created with a start weight and a start date, and this installation has none.',
      badValue: 'That target weight was not stored.',
      badDate: 'That target date was not stored.',
      badDateDetail: 'Give a date in the form the field offers. Nothing was written.',
      dateBeforeStart: (start: string) =>
        `The target date has to fall after the goal started on ${start}. Nothing was written.`,
      dateInThePast: 'The target date has already passed, so there is no line left to draw.',
      sameAsStart: 'The target weight is the weight the goal started from, so the line is flat.',
    },

    integrations: {
      bodyDetail: 'Choose an integration and paste the credential it issued.',
      unknownProvider: 'That is not an integration Vernier knows.',
      unknownProviderDetail:
        'Withings, Apple Health, Google Calendar and the mail relay are the four.',
      emptyCredential: 'That credential is empty.',
      emptyCredentialDetail: 'Paste the token or key the integration issued.',
      willNotOpen: 'The stored credential will not open.',
    },

    launch: {
      notAReport: 'That is not a launch report.',
      notAReportDetail:
        'This endpoint records two things the browser reports at launch: whether Vernier opened from the Home Screen, and whether this device can keep the screen awake. A report carries those two answers, whether the browser is being driven, and the ticket the page it came from was served with. Nothing else is stored here.',
      /**
       * The refusal that closes the door a bare curl walked through. Every
       * other witness on this route asks who is calling, and no header answers
       * that: a driven WebKit and Safari are the same bytes on the wire. This
       * one asks whether the page was served at all, and the ticket that
       * answers it is minted only into a document rendered for a live session.
       */
      notThisApp: 'That launch report did not come from a launch of Vernier.',
      notThisAppDetail:
        'Every page Vernier renders for a signed-in session carries a ticket, and the launch report sends it back. This report carried one this server did not mint, or one minted for another session, or one older than a quarter of an hour. Nothing was stored.',
      /**
       * What a driven browser is told. C2 reads this row back as proof the
       * owner opened Vernier from his Home Screen, so a row a test can author
       * is not proof of anything, and the endpoint says so in the body rather
       * than dropping the report without a word.
       *
       * NOT A 4xx, DELIBERATELY. The report is raised from the root layout, so
       * every page a driven browser opens raises one, and a refusal status
       * would put a console error and a failed request on every screen the
       * suite walks. C9 counts exactly those, on Today, on Health and through
       * the quick log. So the answer is 200 with the outcome in it: the caller
       * is told the report was not recorded and why, and the walk stays clean.
       */
      automated: 'A driven browser cannot report a launch.',
      automatedDetail:
        'This row is read back as evidence that Vernier opened from the Home Screen on the owner\'s phone, so it is only written by a browser a person is holding. Nothing was stored. Point the run at the scratch instance on 127.0.0.1:3101 instead.',
      /**
       * The witness that fires for WebKit, which is the engine the owner's
       * devices run and the one this suite drives. Playwright's WebKit sends a
       * genuine Safari user agent, so nothing in a header says it is automated;
       * what it does say is Macintosh, and a Macintosh has no Home Screen to put
       * an icon on. The claim is refused rather than the caller identified.
       */
      notAHomeScreen: 'A Home Screen launch cannot be reported from a desktop.',
      notAHomeScreenDetail:
        'This row is read back as evidence that Vernier opened from the Home Screen icon on the owner\'s iPhone, and the browser reporting this launch says it is running on a desktop. Nothing was stored. A launch that reports no Home Screen is recorded as usual.',
    },

    recovery: {
      unusable: 'That recovery link is not usable.',
      noToken: 'The link carried no token. Mint one on the Mac mini with scripts/recovery.sh link.',
      noOwner: 'No owner account exists on this machine yet, so there is nothing to recover.',
      spent: 'It has expired or has already been used. Mint a new one on the Mac mini.',
    },

    boot: {
      missingConfig: (name: string) =>
        `Configuration is missing ${name}. Set it in the environment file at the project root and restart the stack.`,
      badAppUrl: (value: string) =>
        `APP_URL is not a URL: ${value}. Expected something like https://host.example.ts.net.`,
      wrongAlgorithm: (algorithm: string) =>
        `The stored password names algorithm ${algorithm}, and this build verifies argon2id only.`,
      databaseSilent: (attempts: number, detail: string) =>
        `Postgres did not answer after ${attempts} attempts: ${detail}`,
    },

    storage: {
      noDatabaseUrl:
        'Configuration is missing DATABASE_URL. Compose builds it from POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB, so a missing value here means the environment file is incomplete.',
      outboxOpen: 'IndexedDB refused to open.',
      outboxWrite: 'The outbox refused the write.',
      ownerExists: 'The owner account already exists. Vernier holds exactly one, and it is created once.',
    },

    masterKey: {
      missing: (name: string, detail: string) =>
        `${name} is ${detail}. Vernier will not start without it: every third-party credential in the database is encrypted with it, and starting without it would mean writing the next one in the clear. Set ${name} in the environment file at the project root to 32 random bytes in base64url and restart the stack.`,
      mismatch: (name: string, provider: string, detail: string) =>
        `${name} does not decrypt the stored ${provider} credential: ${detail}. The key in the environment differs from the one this row was written with. Nothing is returned and nothing is overwritten. Restore the original key, or delete the row and connect the integration again.`,
    },

    nutrition: {
      bodyDetail: 'Open the Eat screen and try again. Nothing was written.',
      noPlan: 'There is no week to change.',
      noPlanDetail: 'Generate a week first. Nothing was written.',
      noMeal: 'There is no such meal in this week.',
      noMealDetail: 'The week was regenerated since this screen loaded. Open Eat again.',
      badState: 'That is not something a meal can be set to.',
      badStateDetail: 'A meal is accepted, edited or rejected, one at a time. Nothing was written.',
      noAlternative: 'That ingredient has no free-from alternative stored.',
      noAlternativeDetail:
        'Only an item with a stored alternative can be swapped, and this one has none. Nothing was written.',
      noRecipe: 'There is no such recipe.',
      noRecipeDetail: 'It was never stored, or this screen is older than the database.',
      badCookTime: 'That cooking time was not stored.',
      badCookTimeDetail: 'Give a whole number of minutes between 10 and 180. Nothing was written.',
      emptyCatalogue: 'No recipe fits your rules and your cooking time.',
      emptyCatalogueDetail:
        'Every recipe in the catalogue is either over the time limit or refused by one of your rules. Raise the time limit or change a rule. Nothing was written.',
      generateFailed: 'The week did not generate.',
      generateFailedDetail: 'Nothing was written and the week you had is untouched.',
    },

    targets: {
      bodyDetail: 'Open Targets and try again. Nothing was written.',
      badRate: 'That rate of loss was not stored.',
      badRateDetail: 'Give a number of kilograms a week. Nothing was written.',
      badLevel: 'That is not an activity level Vernier offers.',
      badLevelDetail:
        'The four levels come from the FAO/WHO/UNU bands, 1.40 to 1.90. Nothing was written.',
      noBody: 'Vernier has no weight reading to compute a target from.',
      noBodyDetail:
        'A target needs a weight, a height, an age and a sex. Log a weight first; nothing is estimated in its place.',
      refused: 'The target was not stored.',
    },

    shopping: {
      bodyDetail: 'Open the shopping list and try again. Nothing was written.',
      noList: 'There is no shopping list to change.',
      noListDetail: 'Confirm a week first, and the list is built from what you accepted.',
      noItem: 'There is no such line on this list.',
      noItemDetail: 'It was removed, or this screen is older than the database.',
      badQuantity: 'That quantity was not stored.',
      badQuantityDetail: 'A quantity is a number above zero. Nothing was written.',
      deductedNotTickable: 'A deducted line has nothing to tick.',
      deductedNotTickableDetail:
        'It is already covered by your recipe box or your cupboard, and it stays on the list so you can see that. Nothing was written.',
    },
  },

  /** The manifest and the document head, which is copy a share sheet reads out. */
  manifest: {
    description:
      'One person, one health record, on one machine. Trends over days, provenance on every value, nothing written without a confirmed diff.',
    documentDescription:
      'Vernier. One person, one health record, on one machine. Trends over days, provenance on every value, nothing written without a confirmed diff.',
  },

  /**
   * The demonstration seed's own copy.
   *
   * Every word the seed writes into a free-text column is here, because the
   * seed is the product writing and a person reads the result on /source/[id].
   * `reference: 'page 2, row 7'` and `reference: 'quick-log'` sat in
   * src/db/demo.ts and painted on that screen with no key, and both string
   * checks passed over them: the source scanner reads neither as a sentence and
   * the rendered scanner read them back out of the column as if the owner had
   * typed them. The column is the same column a real import writes, so the
   * check now builds its data vocabulary from `where not seed` and the seed's
   * own words take keys like every other string the product authored.
   *
   * The numbers stay numbers. A row count, a page number, a factor and an HTTP
   * status are read as the value shapes they are and none of them is copy.
   */
  demoSeed: {
    refused: 'DEMO_MODE is not 1, so the demonstration seed refused to run and wrote nothing.',
    shortcutName: 'Vernier daily export',
    derivationRule: 'mean of daily readings, no interpolation',
    /** The laboratory on the demonstration blood panel. It prints on the source screen. */
    laboratory: 'Biogroup',
    /** What each seeded source record carries as its reference. One per source shape. */
    reference: {
      weight: '1184',
      steps: 'batch-3391',
      waist: 'quick-log',
      ldl: 'page 2, row 7',
      average: 'weight-7d',
      energy: 'seed',
    },
    /** The detail rows those records carry, wherever the value is words rather than a number. */
    field: {
      endpoint: 'measure?action=getmeas',
      syncWindow: '24 h',
      enteredOn: 'iPhone',
      printedValue: '1.44 g/L',
      storedValue: '3.72 mmol/L',
      derivationWindow: '7 d',
      /** A sync that covered a week rather than a night. Same column, same screen. */
      weekWindow: '7 d',
    },
    /**
     * The sessions the seed plans, which is what adherence is counted against.
     *
     * The cause is a reason and not a label. "Placed at 18:45, your calendar is
     * clear from 18:00" names the fact the app acted on; "recommended" names
     * nothing, and the panel was explicit that the second kind is what makes a
     * person stop trusting the first.
     */
    session: {
      strength: 'Home strength',
      calisthenics: 'Calisthenics and core',
      walk: 'Brisk walk and mobility',
      mat: 'mat and backpack',
      bar: 'bar and rings',
      park: 'the park loop',
      eveningCause: 'Your calendar is clear from 18:00.',
      morningCause: 'The evening was already taken.',
    },
  },

  /**
   * The quick-log sheet, screen 03. Six values, one Save, and the copy says
   * plainly that the write lands on the phone first, because that is what makes
   * a basement gym with a captive wifi portal a non-event rather than a bug.
   */
  quickLog: {
    open: 'Quick log',
    title: 'Quick log',
    firstTime: 'First time',
    close: 'Close the quick log',
    save: 'Save',
    saving: 'Saving',
    savedNote: 'Saves on this phone first. Nothing here needs a network.',
    blankNote: 'Fill what you have. Blank fields stay blank, they are not stored as zero.',
    waist: 'Waist',
    waistDown: 'Down half a centimetre',
    waistUp: 'Up half a centimetre',
    waistLastPrefix: 'Last',
    /** Screen 02's control on the waist card. It raises this same sheet. */
    measure: 'Measure',
    /**
     * The stepper moves the last measurement by half a centimetre, so with no
     * last measurement it has nothing to move. It says so rather than counting
     * up from zero: one tap used to queue 0.5 cm and report it as saved, and the
     * band this product stores a waist in starts at 30.
     */
    waistNoBase: 'Your last measurement did not load, so there is nothing to step from. Type the number.',
    /** A write the queue would not take. Screen 00's error card, in the sheet. */
    refusedTitle: 'That entry was not saved',
    refusedBody:
      'Nothing was put on this phone and nothing was sent. Change what is named here and save again.',
    waistEmptyTitle: 'No waist measurement yet',
    /** Also the method the demonstration waist record carries, so it is written once. */
    waistMethod: 'Tape at the navel, standing, breathing out',
    waistEmptyBody:
      'Tape at the navel, standing, breathing out. Same spot each time matters more than the exact number.',
    energy: 'Energy',
    energyLow: 'Drained',
    energyHigh: 'Strong',
    fatigue: 'Fatigue',
    fatigueLow: 'None',
    fatigueHigh: 'Wiped out',
    hunger: 'Hunger',
    hungerLow: 'None',
    hungerHigh: 'Ravenous',
    satiety: 'Satiety after eating',
    satietyLow: 'Still empty',
    satietyHigh: 'Too full',
    note: 'Note',
    notePlaceholder: 'Anything worth remembering.',
    ratingOf: (value: number, max: number) => `${value} of ${max}`,
    ratingLabel: (field: string, value: number, max: number) => `${field}, ${value} of ${max}`,
    nothingToSave: 'Nothing is filled in yet, so there is nothing to save.',
    loadingLabel: 'Reading your last measurements',
    errorTitle: 'Your last measurements did not load',
    /**
     * The cause, when the Mac mini answered and the answer carried no words of
     * its own: a proxy 502, an HTML error page, a body that is not JSON. This
     * was composed inline in the component for three verifications, `HTTP 502
     * at 14:32.`, three tokens of Vernier's own copy with no key. C6 does not
     * care that it was short or that it sat in a slot the browser sometimes
     * fills. It is the product's copy, so it has a key.
     */
    errorStatus: (status: number, time: string) =>
      `The Mac mini answered ${status} at ${time} and gave no reason.`,
    /**
     * What follows the cause, whoever wrote the cause.
     *
     * It is its own key rather than the tail of a template because the cause is
     * sometimes Vernier's words and sometimes the browser's, and the two are
     * marked apart in the markup. A check can then excuse the browser's words on
     * provenance instead of excusing whatever lands in this position.
     */
    errorBody:
      'The sheet still saves: a write goes to this phone first and uploads when the Mac mini answers.',
    staleTitle: (days: number) =>
      days === 1 ? 'Waist last measured yesterday' : `Waist last measured ${days} days ago`,
    staleBody: 'Measure again at the navel, standing, breathing out.',
    offlineTitle: 'Saved on this phone',
    offlineBody: (queued: number) =>
      queued === 1
        ? '1 entry is waiting to upload. It keeps the time you typed it, not the time it arrives.'
        : `${queued} entries are waiting to upload. Each keeps the time you typed it, not the time it arrives.`,
    /**
     * The stepper moves the last measurement by half a centimetre, so it needs
     * a last measurement. With none it says so and the number is typed instead,
     * which is the whole of F23's tap count on a first-ever waist: stepping up
     * from nothing took sixty taps to reach the bottom of the stored band.
     */
    waistTypeIt: 'Type the first one. The buttons move it half a centimetre at a time after that.',
    /** The muted placeholder `03-quick-log.html` frame 3 draws. Not a number, and not zero. */
    waistBlank: '--',
    waistFieldLabel: 'Waist in centimetres',
  },

  /**
   * Today's own additions this slice: the entry point, what was just logged,
   * and the two words that keep a reversal honest.
   *
   * `justLogged` names the card the quick log raises the moment a write is
   * committed on this phone. `onFile` names the list of values that stand
   * today. They were the same key once, so Today drew two cards side by side
   * both headed JUST LOGGED, which is two different things wearing one label.
   */
  todayLog: {
    onFile: 'On file',
    queued: 'Queued',
    /**
     * What a parked or failed upload holds as its reason. The queue keeps it on
     * the entry and a later screen prints it, so it is copy and not a log line.
     */
    uploadStatus: (status: number) => `The Mac mini answered ${status}.`,
    stored: 'Stored',
    removed: 'Removed',
    needsLogging: 'Needs logging',
    nothingDue: 'Nothing is due right now.',
    waistDue: 'Waist, due today.',
    energyDue: 'Evening energy, not logged.',
    dueCount: (count: number) => `${count}`,
    openValue: 'Open the value',

    /**
     * Screen 03 frame 2 draws Undo and Edit and annotates them "undoable for
     * as long as it sits in the queue". That clause is the whole design and
     * the copy states it rather than implying it: while the entry is on this
     * phone the write really can be dropped, and once the Mac mini has it the
     * table refuses DELETE and the only honest reversal is a correction.
     */
    undo: 'Undo',
    edit: 'Edit',
    correct: 'Correct it',
    whatHappensNextLabel: 'What happens next',
    whatHappensNext:
      'On the next connection the queue uploads in order and each entry keeps the time you typed it, not the time it arrived. If the Mac mini already holds a value for today, the app asks which one is right. It does not choose for you.',

    /**
     * THE OFFLINE LINE UNDER TODAY'S TITLE, WHICH IS NOT A NOTICE.
     *
     * DESIGN.md section 4 defines the offline state as "a one-line banner under
     * the title with the queue count", `02-today.html` frame 3 and
     * `03-quick-log.html` frame 2 both draw it neutral, and the ruling in
     * `.forge/RULING-SLICE-4.md` question 2 puts it back there after the build
     * folded it into the warn notice region: a queue needs no action, clears
     * itself, and "2 things are waiting on you" was not true, because they are
     * waiting on the network. The count is on the line, where F24 needs it.
     *
     * The words are screen 02 frame 3's own.
     */
    queueTitle: 'Offline.',
    queueBody: (queued: number) =>
      queued === 1 ? '1 entry saved on this phone.' : `${queued} entries saved on this phone.`,

    /**
     * A just-logged entry, as rows in the day card. `.forge/AMENDMENTS.md` A6
     * settles the two sheets: screen 02 frame 3 for where it sits, screen 03
     * frame 2 for what it carries, and the four feelings on one line, never
     * four. `entryPart` and `entryLine` are how that line is composed, so the
     * running-on names below are catalogued rather than lower-cased at render.
     */
    feelingName: {
      energy: 'Energy',
      fatigue: 'Fatigue',
      hunger: 'Hunger',
      satiety: 'Satiety',
    },
    feelingRunOn: {
      energy: 'energy',
      fatigue: 'fatigue',
      hunger: 'hunger',
      satiety: 'satiety',
    },
    entryPart: (name: string, value: string) => `${name} ${value}`,
    entryLine: (parts: string[]) => parts.join(', '),
    entryNote: 'Note',
    entrySavedQueued: (time: string) => `Saved ${time}, on this phone`,
    entrySaved: (time: string) => `Saved ${time}`,
  },

  /**
   * Provenance. Every label on the value sheet and the source screen lives
   * here, including the deduplication reasons, which are rendered once at write
   * time and stored beside the row the way an audit reason is.
   */
  provenance: {
    sourceLabel: 'Source',
    sources: {
      withings: 'Withings',
      apple_health_shortcut: 'Health',
      manual: 'Manual',
      lab_pdf: 'Lab PDF',
      derived: 'Derived',
      demo: 'Demo',
    },
    standsInFor: (source: string) => `Demonstration data, standing in for ${source}.`,
    staleLabel: (source: string, days: number) =>
      days === 1 ? `${source}, 1 day old` : `${source}, ${days} days old`,
    confidenceLabel: 'Confidence',
    confidences: {
      measured_device: 'Measured, device',
      measured_manual: 'Measured by hand',
      reported: 'Reported by you',
      printed: 'Printed by the laboratory',
      estimated: 'Estimated',
      derived: 'Derived from stored values',
      demo: 'Demonstration data',
    },
    dedupLabel: 'Deduplication',
    dedupDecisions: {
      unique: 'Kept',
      kept_over_duplicate: 'Kept',
      correction: 'Correction',
    },
    dedupReasons: {
      identical: (params: { metric: string; value: string; source: string }) =>
        `The same ${params.metric} of ${params.value} from ${params.source} was already stored for that day.`,
      conflictsWithCorrection: (params: { source: string; incoming: string; corrected: string }) =>
        `${params.source} sent ${params.incoming} where you corrected the stored value to ${params.corrected}. Nothing was written.`,
      keptOverOther: (params: { source: string; value: string }) =>
        `Kept. ${params.source} ${params.value} was already stored for that day and reads second.`,
      otherWins: (params: { source: string; value: string }) =>
        `${params.source} ${params.value} is the better reading for that day, so this one was not stored.`,
      firstOfDay: () => 'The first reading of this metric on this day.',
    },
    /**
     * The whole id, never a slice of one. Eight characters of a UUID reads as
     * a mangled word rather than an identifier, and this sentence is frozen on
     * the row at write time: it is the line somebody follows back to the
     * original months later, so it names something they can search for.
     */
    correctionOf: (id: string) => `Corrects the reading ${id}, which stays readable.`,
    seeded: 'Seeded. Nothing else described this metric on this day.',

    valueSheetTitle: 'Value',
    storedValue: 'Stored value',
    measuredAt: 'Measured',
    importedAt: 'Imported',
    importVersion: 'Import version',
    timeZoneLabel: 'Time zone',
    printedOriginal: 'Printed by the laboratory',
    conversionLine: (printed: string, factor: string, stored: string) =>
      `${printed}  x ${factor}  ${stored}`,
    correctionHistory: 'Correction history',
    correctThisValue: 'Correct this value',
    correctionValueLabel: (unit: string) =>
      unit === '' ? 'The number it should be' : `The number it should be, in ${unit}`,
    correctionReasonLabel: 'Why, in your own words',
    saveCorrection: 'Save the correction',
    noCorrection: 'No correction on this value.',
    appendOnly: 'Append only',
    correctionRow: (from: string, to: string) => `${to}, was ${from}`,
    correctionBy: (when: string, reason: string) => `Corrected by you, ${when}. ${reason}`,
    original: 'Original',
    neverOverwritten:
      'A correction is never overwritten. A later import that disagrees becomes a question, not a decision.',
    openSource: 'Open the source',
    openSourceHint: 'Tap 2 reaches the record that carried this reading.',
    valueNotFound: 'No such value',
    valueNotFoundBody: 'That value is not in this database. Nothing was deleted; the id does not exist.',

    sourceScreenTitle: 'Source',
    sourceKinds: {
      sync_batch: 'Device sync batch',
      shortcut_payload: 'Phone payload',
      lab_page: 'Laboratory page',
      model_reply: 'Photo and model reply',
      derivation: 'Derivation',
      manual_entry: 'Manual entry',
      demo_record: 'Demonstration record',
    },
    sourceReference: 'Reference',
    sourceOccurredAt: 'Recorded',
    sourceImportedAt: 'Stored',
    sourceRows: 'Rows from this record',
    sourceNoRows: 'This record carried no stored row.',
    sourceNotFound: 'No such source',
    sourceNotFoundBody: 'That source record is not in this database.',
    fields: {
      'source.field.endpoint': 'Endpoint',
      'source.field.window': 'Window',
      'source.field.rowsReceived': 'Rows received',
      'source.field.rowsStored': 'Rows stored',
      'source.field.result': 'HTTP result',
      'source.field.shortcut': 'Shortcut',
      'source.field.laboratory': 'Laboratory',
      'source.field.page': 'Page',
      'source.field.printedValue': 'Printed value',
      'source.field.factor': 'Conversion factor',
      'source.field.storedValue': 'Stored value',
      'source.field.inputs': 'Inputs',
      'source.field.rule': 'Rule',
      'source.field.seed': 'Seed version',
      'source.field.enteredOn': 'Entered on',
      'source.field.method': 'Method',
      'source.field.correctedFrom': 'Corrected from',
      'source.field.correctedTo': 'Corrected to',
      'source.field.correctionOf': 'Correction of',
      'source.field.reason': 'Reason',
    },
    allSourcesLabel: 'Sources, one chip each',
    allSourcesNote:
      'Origin is chrome, never a colour. An estimate is the same chip with a dashed border and a demonstration row a dotted one, because colour is reserved for state.',
  },


  /**
   * The trend charts, which are the product's signature and therefore the
   * place its copy has to be most careful.
   *
   * Two sentences run through everything here. The seven-day average leads and
   * the daily reading is deliberately secondary, because a body-composition
   * scale moves with hydration and this morning's number is mostly water. And
   * absence is drawn, never smoothed: a gap says it is a gap, an average on a
   * short window states the count it was computed on, and no line is ever
   * carried across a hole.
   *
   * Every chart's `<title>`, `<desc>` and hidden table copy is here too, which
   * is what a screen reader actually reads.
   */
  trend: {
    /*
     * A chart's spoken summary.
     *
     * The window count lives in the title and never in the middle of a
     * description, and that is a checker fact rather than a taste. The closed
     * world check tiles a rendered sentence out of catalogue anchors with no
     * backtracking, and "30 days" is itself a catalogue string: the range
     * control on Health is labelled with it. A description reading "... over 30
     * days, one point per reading ..." was therefore read as the range label
     * followed by copy with no key. Counts go at the end of a title, where the
     * anchor cannot swallow the sentence after it.
     */
    weightTitle: (days: number) => `Weight, the last ${days} days`,
    weightDesc:
      'Daily readings as unconnected dots, the seven-day average as the solid line, and the goal trajectory dashed inside its corridor. Days with no reading are hatched and are never joined up.',
    bodyTitle: (days: number) => `Weight and waist, the last ${days} days`,
    bodyDesc:
      'Weight above and waist below, on one time axis. Weight carries its seven-day average and the goal trajectory; waist is measured by hand and is drawn as the readings it has. The days the scale went quiet are hatched in both bands.',
    waistTitle: (days: number) => `Waist, the last ${days} days`,
    waistDesc:
      'Waist measurements, joined between the readings that exist. A tape measure is used about once a week by one person in one place, so two readings a week apart are two comparable measurements and are drawn joined; nothing between them is invented.',
    activityTitle: (days: number) => `Steps, the last ${days} days`,
    activityDesc:
      'One bar per day. A day the phone sent nothing has no bar and is hatched, never a bar of zero.',
    sleepTitle: (nights: number) => `Sleep, the last ${nights} nights`,
    sleepDesc:
      'One bar per night. A night the watch did not record has no bar and is hatched, never a bar of zero.',
    heartTitle: (days: number) => `Resting heart rate, the last ${days} days`,
    heartDesc:
      'Resting heart rate, one point per reading, joined only between the readings that exist.',

    /*
     * The hidden table's caption, one per chart rather than one template taking
     * a metric name. The template took `strings.metrics.waist.toLowerCase()`,
     * which is the product authoring a word the catalogue does not hold: the
     * catalogue says "Waist" and the screen said "waist". A lower-cased
     * catalogue string is a new string.
     */
    captionWeight: 'Every stored weight reading behind this chart, with its date.',
    captionWaist: 'Every stored waist measurement behind this chart, with its date.',
    captionSteps: 'Every stored step count behind this chart, with its date.',
    captionSleep: 'Every stored night of sleep behind this chart, with its date.',
    captionHeart: 'Every stored resting heart rate behind this chart, with its date.',
    columnDate: 'Date',
    columnValue: 'Value',
    columnSource: 'Source',
    noReading: 'No reading',

    legendAverage: (window: number) => `${window}-day average`,
    legendDaily: 'Daily reading',
    legendGoal: (target: string, unit: string) => `Line to ${target} ${unit}`,

    /** The gap sentence. One per run of missing days, naming the dates it covers. */
    gapNote: (from: string, to: string) =>
      `${from} to ${to} have no reading. The line is broken across them, not smoothed.`,
    gapOneDay: (day: string) => `${day} has no reading.`,
    /** The count clause, which is the whole of why a short window is allowed on screen at all. */
    shortWindow: (count: number, size: number) =>
      `Last week's average used ${count} days of ${size}.`,
    headlineWindow: (count: number, size: number) =>
      `This average used ${count} days of ${size}.`,
    /**
     * The two thresholds in prose. Spelled rather than interpolated, because
     * "7 days" mid-sentence is the range control's own label and reads as one.
     * `tests/unit/trend.test.ts` asserts the constants are still five and
     * seven, so the sentence cannot drift from the rule it describes.
     */
    dashedNote:
      'The average is dashed where its window held five or six days of seven, and is not drawn at all below five.',
    nothingYet: 'Not enough readings yet to draw an average.',
  },

  /**
   * The goal, which is one straight line and one honest comparison.
   *
   * The trajectory is a plan, never a prediction and never a score. The copy
   * says where the average sits against the line and what the last four weeks
   * actually did, and it never grades the owner for either.
   */
  goal: {
    label: 'Goal',
    heading: 'Weight goal',
    from: (start: string, unit: string, when: string) => `From ${start} ${unit} on ${when}.`,
    below: (delta: string, unit: string, target: string, when: string) =>
      `${delta} ${unit} below the line to ${target} ${unit} on ${when}.`,
    above: (delta: string, unit: string, target: string, when: string) =>
      `${delta} ${unit} above the line to ${target} ${unit} on ${when}.`,
    onTheLine: (target: string, unit: string, when: string) =>
      `On the line to ${target} ${unit} on ${when}.`,
    pace: (change: string, unit: string) => `28-day pace ${change} ${unit} a week.`,
    paceUnknown: 'The 28-day pace needs four weeks of readings and does not have them yet.',
    corridor: (band: string, unit: string) =>
      `The band around the line is plus or minus ${band} ${unit}.`,
    edit: 'Edit the goal',
    targetValueLabel: (unit: string) => `Target weight, in ${unit}`,
    targetDateLabel: 'Target date',
    save: 'Save the goal',
    saving: 'Saving',
    saved: 'Saved. The trajectory is redrawn below.',
    emptyTitle: 'No goal set',
    emptyBody:
      'A goal is a start weight, a target weight and a date. The chart draws the straight line between them and nothing else; it is a plan, not a prediction.',
    refusedTitle: 'The goal was not saved',
  },

  /**
   * Adherence, which is a count over its denominator and never a percentage.
   *
   * A percentage hides the denominator and the denominator is the honest part:
   * two of three reads as a week with one still to come, sixty-seven percent
   * reads as a grade. Nothing here is coloured, because a missed session is a
   * Thursday that ran late.
   */
  adherence: {
    label: 'Adherence',
    count: (done: number, planned: number) => `${done} of ${planned}`,
    lastDays: (days: number) => `sessions, last ${days} days`,
    alsoLastDays: (days: number) => `last ${days} days`,
    note: 'Two missed sessions in a month is not a failure state, and the app does not colour it like one.',
    emptyTitle: 'No sessions planned yet',
    emptyBody:
      'Adherence counts completed sessions against planned ones. With nothing planned there is no denominator, so there is no number to show.',
    dayDone: 'Session completed',
    dayMissed: 'Session missed',
    dayPlanned: 'Session planned',
    dayNone: 'No session',
    /**
     * One pill, as a screen reader hears it. The row is seven coloured shapes
     * to the eye and seven sentences to the tree, and the sentence is written
     * here rather than glued together in the markup.
     */
    dayCell: (when: string, state: string) => `${when}, ${state}`,
  },

  /** Today's day card: the session, the meals and what is due. */
  day: {
    label: 'Your day',
    sessionNone: 'No session planned for today.',
    sessionNoneBody: 'Nothing is due. The week is proposed on Sunday and accepted one session at a time.',
    when: (from: string, to: string, place: string) => `${from} to ${to}, ${place}`,
    minutes: (count: number) => `${count} min`,
    states: {
      planned: 'Not started',
      completed: 'Done',
      missed: 'Missed',
    },
    meals: 'Meals',
    mealsNone: 'Nothing logged today.',
  },

  /**
   * A source that has stopped sending, which the panel called the failure mode
   * of the whole product: not an error, silence. The chip carries the age, the
   * line under it carries the cause, and the chart hatches the range so the
   * silence is visible as a shape and not only as words.
   */
  stale: {
    hours: (source: string, hours: number) =>
      hours === 1 ? `${source}, 1 hour old` : `${source}, ${hours} hours old`,
    shortcutCause: (when: string) => `The iPhone shortcut last sent a batch on ${when}.`,
    scaleCause: (when: string) => `The scale last synced on ${when}.`,
    notConnected: (source: string) =>
      `${source} is not connected, so nothing has arrived and nothing is being estimated in its place.`,
    fresh: (source: string, when: string) => `${source} last sent a reading on ${when}.`,
    affectedRange: (from: string, to: string) => `${from} to ${to}`,
    noDataNotZero: 'No data. Not zero.',
    /** The same fact inside a hatched band, where there is room for three words. */
    noData: 'No data',
    /**
     * The banner on Today. One key rather than an age and a cause glued
     * together in the markup, so the sentence a person reads has one home.
     */
    banner: (age: string, cause: string) => `${age}. ${cause}`,
    /**
     * The banner's one visible line, whatever the count is.
     *
     * F27 counts pixels above the fold and the number of quiet sources is data,
     * so the line that carries it cannot grow with it. This one names how many
     * have stopped and nothing else; the ages and the causes sit one tap below
     * it, and each source's own chip and cause line still ship in the card that
     * source feeds. The wording is the only thing that changes between one quiet
     * source and five, and it changes by a numeral.
     */
    bannerSummary: (count: number) =>
      count === 1 ? 'One source has gone quiet.' : `${count} sources have gone quiet.`,
  },

  /**
   * The five body signals. Each one renders its value when it is there and
   * names its own absence when it is not, and none of them ever renders a zero
   * for a missing value: a zero is a measurement and absence is not.
   */
  signals: {
    label: 'Body signals',
    bodyLabel: 'Body',
    activity: 'Activity',
    sleep: 'Sleep',
    heart: 'Heart',
    steps: 'Steps',
    stepsAverage: (days: number) => `${days}-day average`,
    /** The card sub-lines, written here rather than assembled at a call site. */
    stepsOn: (when: string) => `steps, ${when}`,
    restingOn: (when: string) => `resting heart rate, ${when}`,
    waistSince: (change: string, unit: string, when: string) =>
      `waist, ${change} ${unit} since ${when}`,
    waistPlain: 'waist',
    averageNote: (window: number, change: string, unit: string) =>
      `Weight, ${window}-day average, ${change} ${unit} on the week`,
    averagePlain: (window: number) => `Weight, ${window}-day average`,
    sleepDuration: (hours: number, minutes: string) => `${hours} h ${minutes}`,
    sleepNight: (when: string) => `night of ${when}`,
    resting: 'Resting heart rate',
    recovery: 'Recovery, heart rate variability',
    vo2: 'VO2 max',
    changeOver: (days: number) => `over ${days} days`,

    stepsEmptyTitle: 'No step counts stored',
    stepsEmptyBody:
      'Steps arrive from a shortcut on the iPhone. Until one does, this stays empty rather than showing a zero you did not walk.',
    sleepEmptyTitle: 'No sleep stored',
    sleepEmptyBody:
      'Sleep duration arrives with the same shortcut. A night the watch did not record stays absent here and is never padded out.',
    restingEmptyTitle: 'No resting heart rate stored',
    restingEmptyBody:
      'Resting heart rate arrives once a day with the same shortcut. Nothing is estimated in the meantime.',
    recoveryEmpty: 'Not stored. Heart rate variability arrives from the watch.',
    vo2Empty: 'Not stored. The watch estimates it every few weeks.',
    openIntegrations: 'Open integrations',
    /**
     * Screen 02's control on the body-signals card. The phone pushes, the Mac
     * mini never pulls, so the thing that ends the silence is a shortcut run on
     * the iPhone and the app can only say where it is set up.
     */
    runShortcut: 'Run the shortcut on the iPhone',
    vo2Note:
      'VO2 max arrives from the watch every few weeks. Between two readings the app shows the last one with its date, never a fresh-looking number.',
    sleepNote:
      'Phases arrive when the watch records them. Nights without phases are stored as a duration only, never padded out.',
  },

  /** The stored blood panel, read here and validated on screen 05. */
  panel: {
    label: (when: string) => `Blood panel, ${when}`,
    note: 'Reference intervals come from the laboratory sheet. This app explains what an analyte measures and never tells you what your result means for you. Take questions to your doctor.',
  },

  /**
   * The one region under Today's title, and the only thing that may sit between
   * the title and the day card.
   *
   * F27 counts pixels above the fold, and every notice Today can raise is data:
   * how many sources have gone quiet, how many imports are waiting, how many
   * entries are on the phone. A line each made the region's height a function of
   * how much is wrong, so two of them put the weight trend 43 px under the fold
   * and five would have put it 200 px under. Silence is the failure mode, so the
   * answer is never to draw fewer warnings: the answer is one line whose wording
   * changes and whose height does not, with everything one tap under it.
   *
   * When there is one notice the line is that notice's own summary, because a
   * count of one tells the owner less than the thing itself does. Past one it is
   * the count, and the disclosure carries every line unabridged.
   */
  notices: {
    summary: (count: number) =>
      count === 1 ? '1 thing is waiting on you' : `${count} things are waiting on you`,
  },

  /** The re-import question, which holds both values and writes nothing. */
  question: {
    title: 'An import disagrees with your correction',
    body: 'Nothing was written. Both values are here and the stored one has not moved.',
    stored: 'What you corrected it to',
    incoming: 'What the import sent',
    raisedAt: 'Raised',
    openCount: (count: number) =>
      count === 1 ? '1 import is waiting on you' : `${count} imports are waiting on you`,
  },

  /**
   * The unit as a sentence names it, which is not always the suffix a value
   * prints. A rating prints "4 of 5", and asking for "the number it should be,
   * in of 5" is what interpolating a display suffix into prose produces. The
   * symbols stay symbols: DESIGN.md fixes kg, cm, km, kcal and g on every
   * surface, and prose does not get its own second set.
   */
  unitNames: {
    kg: 'kg',
    cm: 'cm',
    km: 'km',
    kcal: 'kcal',
    g: 'g',
    step: 'steps',
    min: 'minutes',
    bpm: 'beats a minute',
    ms: 'ms',
    'mL/kg/min': 'mL/kg/min',
    point: 'points, 1 to 5',
    'mmol/L': 'mmol/L',
    'g/L': 'g/L',
    'µg/L': 'µg/L',
    text: '',
  },

  /** Units, so a number and its unit are never concatenated inside a component. */
  units: {
    kg: 'kg',
    cm: 'cm',
    km: 'km',
    kcal: 'kcal',
    g: 'g',
    step: 'steps',
    min: 'min',
    bpm: 'bpm',
    ms: 'ms',
    'mL/kg/min': 'mL/kg/min',
    point: 'of 5',
    'mmol/L': 'mmol/L',
    'g/L': 'g/L',
    'µg/L': 'µg/L',
    text: '',
  },

  /**
   * Eat: the nutrition week, the meal, the targets, the shopping list and the
   * data-sources screen.
   *
   * ONE WORD IN HERE CARRIES MORE WEIGHT THAN ANY OTHER, AND IT IS `unknown`.
   * A nutrient this app does not have is stored null and rendered with that
   * word, never as 0, because a zero is a measurement and absence is not. It is
   * the difference between not knowing a food's fibre and knowing the food has
   * none, and CIQUAL leaves fibre out on seventy of its three and a half
   * thousand rows, so it is not a hypothetical.
   *
   * The second is `estimate`. Every number on these screens comes from a food
   * table averaging a food type, not from a laboratory measuring the plate in
   * front of the owner, and the copy says so on every surface rather than once
   * in a settings page nobody opens.
   */
  nutrition: {
    /** The absent nutrient. Not "0 g", not "-", not an empty cell. */
    unknown: 'unknown',
    energy: 'Energy',
    protein: 'Protein',
    carbohydrate: 'Carbs',
    fat: 'Fat',
    fibre: 'Fibre',
    /** The short heads on a day total, where four labels have to fit one line. */
    proteinShort: 'P',
    carbohydrateShort: 'C',
    fatShort: 'F',
    range: (low: string, high: string) => `${low} to ${high}`,
    aroundRange: (low: string, high: string, unit: string) =>
      `Around ${low} to ${high} ${unit}`,

    weekTitle: 'Next week',
    weekRange: (from: string, to: string) => `${from} to ${to}`,
    dailyTarget: 'daily target',
    plannedRate: 'a week, planned',
    rateLoss: (kg: string) => `-${kg} kg`,
    rateHold: 'Holding weight',
    /**
     * What the target actually is, named. The wireframe's note said the figure
     * comes from the weight trend "not from a formula", and F80 says the
     * opposite in as many words: Mifflin-St Jeor with an activity level from
     * the published 1.40 to 1.90 bands. The rubric line wins over the sheet,
     * and the copy names the equation and the band rather than hiding them.
     */
    targetBasis: (rmr: string, pal: string, tdee: string) =>
      `Mifflin-St Jeor puts your resting needs near ${rmr} kcal. At activity level ${pal}, from the FAO/WHO/UNU 1.40 to 1.90 bands, that is about ${tdee} kcal a day before the deficit.`,
    targetEstimateNote:
      'These are estimates from population equations, not measurements of your metabolism. The scale over four weeks is the real measurement.',
    weekClosing:
      'Calories and macros are estimates from a food table, not a laboratory. They are good enough to steer a trend and no more.',

    /** The four rules, summarised over the generated week. */
    rulesBanner: (parts: string[]) => parts.join(' '),
    ruleExcluded: (subject: string) => `No ${subject} in any meal this week, by exclusion.`,
    ruleAllergy: (subject: string) =>
      `No ${subject} in any meal this week, and none in the shopping list, by allergy.`,
    ruleIntolerance: (subject: string, days: number) =>
      days === 1
        ? `A ${subject}-free alternative on 1 day, by intolerance.`
        : `A ${subject}-free alternative on ${days} days, by intolerance.`,
    rulePreference: (subject: string, days: number) =>
      days === 1
        ? `${subject} allowed and used on 1 day.`
        : `${subject} allowed and used on ${days} days.`,
    ruleNone: 'No allergy, intolerance, exclusion or preference is stored yet.',
    /** The four kinds, as the profile screen names them. Four rules, four words. */
    ruleKinds: {
      allergy: 'Allergy',
      intolerance: 'Intolerance',
      exclusion: 'Exclusion',
      preference: 'Preference',
    },
    ruleKindEffects: {
      allergy: 'Refused. Nothing containing it is ever generated, bought or suggested.',
      intolerance: 'Substituted. The item stays, and a free-from alternative is planned in its place.',
      exclusion: 'Omitted. Nothing containing it is generated, and the list says why it is absent.',
      preference: 'Ranked. It changes what is chosen first and never removes anything.',
    },
    ruleSubjects: {
      shellfish: 'shellfish',
      lactose: 'lactose',
      nuts: 'nuts',
      gluten: 'gluten',
    },

    slots: {
      breakfast: 'breakfast',
      lunch: 'lunch',
      dinner: 'dinner',
      snack: 'snack',
    },
    mealLine: (parts: string[]) => parts.join(' · '),
    cookTime: (minutes: number) => `${minutes} min`,
    lactoseFreeChip: 'lactose-free',
    boxSuppliedChip: 'recipe box',

    accept: 'Accept',
    edit: 'Edit',
    reject: 'Reject',
    /** What each control does, spoken, naming the meal it acts on. */
    acceptMeal: (meal: string) => `Accept ${meal}`,
    editMeal: (meal: string) => `Edit ${meal}`,
    rejectMeal: (meal: string) => `Reject ${meal}`,
    openMeal: (meal: string) => `Open ${meal}`,
    states: {
      proposed: 'Waiting',
      accepted: 'Accepted',
      edited: 'Edited',
      rejected: 'Rejected',
    },
    tally: (accepted: number, edited: number, waiting: number, rejected: number) =>
      `${accepted} accepted, ${edited} edited, ${waiting} waiting, ${rejected} rejected`,
    regenerate: 'Regenerate',
    confirmWeek: 'Confirm the week and build the list',
    openShopping: 'Open the shopping list',
    generateWeek: 'Generate the week',
    generating: 'Generating',
    maxCookLabel: 'Longest you will cook, in minutes',
    maxCookNote:
      'No recipe over this goes into the week. Change it and regenerate to see a different week.',

    weekEmptyTitle: 'No week generated yet',
    weekEmptyBody:
      'Breakfasts, weekday lunches and at-home dinners are proposed against your target and your four dietary rules. Nothing is written until you accept a meal.',
    weekErrorTitle: 'The week did not generate',
    weekErrorBody:
      'Nothing was written and last week is untouched. The rest of the app is unaffected.',
    weekLoading: 'Building next week',
    weekOfflineTitle: 'Offline.',
    weekOfflineBody: 'The week you last loaded is on this phone. Nothing new can be generated until the Mac mini answers.',
    weekStaleTitle: (days: number) =>
      days === 1 ? 'This week was generated yesterday' : `This week was generated ${days} days ago`,
    weekStaleBody: 'Your weight has moved since. Regenerate to recompute the target and the meals.',

    mealTitle: 'Meal',
    perServing: 'Per serving',
    servings: (count: number) => (count === 1 ? '1 serving' : `${count} servings`),
    ingredients: 'Ingredients',
    ingredientLine: (grams: string, name: string) => `${grams} g ${name}`,
    ingredientUnresolved: 'Not counted. No food table row matches this ingredient.',
    /** Where a recipe's numbers came from, one word per provenance value. */
    provenance: {
      computed_ciqual: 'Computed from Anses Ciqual rows',
      computed_mixed: 'Computed from mixed sources',
      computed_partial: 'Computed, with ingredients missing',
      user_entered: 'Your value',
      ai_estimate: 'Estimate',
      label_scan: 'Read from the label',
    },
    provenanceLabel: 'Where these numbers come from',
    coverageLabel: 'Mass covered',
    fibreCoverageLabel: 'Fibre covered',
    coveragePct: (pct: string) => `${pct}%`,
    /** Below 85 percent the number is a band, and the shortfall is stated. */
    coverageShortfall: (pct: string, threshold: number) =>
      `${pct}% of this recipe's mass resolved to a food row, which is under ${threshold}%. The energy is shown as a range because the rest could be anything.`,
    fibreShortfall: (pct: string) =>
      `Fibre resolved on ${pct}% of the mass, so the fibre figure is thinner than the others. It carries its own number for exactly that reason.`,
    computedEnergyChip: 'Computed energy',
    computedEnergyTitle: 'This energy was computed, not published',
    /**
     * F79's marker, in words, one tap from the number. Anses publishes an
     * energy value for most of its rows and not all of them, and the ones it
     * leaves out are filled here by the same conversion factors Anses uses for
     * the ones it publishes, so the two are consistent and still tellable
     * apart.
     */
    computedEnergyBody:
      'Anses publishes no energy value for this food, so Vernier computed one from its protein, carbohydrate, fat and fibre using the EU Regulation 1169/2011 Annex XIV conversion factors. Those are the same factors Anses uses for the values it does publish.',
    computedEnergyCount: (computed: number, total: number) =>
      `${computed} of ${total} ingredients carry a computed energy.`,
    publishedEnergyBody: 'Every ingredient here carries an energy value Anses published.',
    openProvenance: 'Where this number came from',

    snapshotLabel: 'Snapshot',
    snapshotVersion: (version: number, when: string) => `Version ${version}, computed ${when}`,
    snapshotNote:
      'The per-serving figures are computed from the ingredient rows once and stored, so the week you ate reads back under the food data as it stood then.',
    sourceChanged: 'An ingredient source changed',
    sourceChangedBody:
      'The food rows behind this recipe are not the ones the stored figures were computed from. Nothing has been replaced and the stored snapshot still stands. Recompute it or keep it.',
    sourceChangedHashes: (stored: string, incoming: string) =>
      `Stored snapshot ${stored}, ingredient rows now ${incoming}.`,
    recompute: 'Recompute the snapshot',
    keepSnapshot: 'Keep the stored figures',
    questionOpen: (count: number) =>
      count === 1 ? '1 recipe is waiting on you' : `${count} recipes are waiting on you`,

    lactoseFreeTitle: 'Lactose-free alternative',
    lactoseFreeBody:
      'Lactose is stored as an intolerance, so every dairy item in a generated meal offers an alternative. Choosing it recomputes this meal from the alternative ingredient rows.',
    lactoseFreeSwap: (from: string, to: string) => `Swap ${from} for ${to}`,
    lactoseFreeUndo: (from: string, to: string) => `Put ${to} back for ${from}`,
    lactoseFreeChosen: (name: string) => `${name} is in this meal.`,
    macrosBefore: 'Before the swap',
    macrosAfter: 'After the swap',

    targetsTitle: 'Targets',
    targetsSub: 'Where the daily calorie and macro figures come from',
    targetEmptyTitle: 'No daily target yet',
    targetEmptyBody:
      'A target is computed from the Mifflin-St Jeor equation and an activity level from the published 1.40 to 1.90 bands. Nothing is planned against a number this app invented.',
    /** The chip on the card a changed ingredient source raises. */
    questionChip: 'Waiting on you',
    equationLabel: 'Equation',
    equationName: 'Mifflin-St Jeor, 1990',
    equationCitation:
      'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr 1990;51:241-247.',
    restingLabel: 'Estimated resting needs',
    /**
     * The four facts Mifflin-St Jeor needs, asked for by name.
     *
     * Sex is asked because the equation has two forms and the constant differs
     * by 166 kcal between them, and because the hard floor differs too. It is
     * asked once, it is stored on the target row beside the answer it produced,
     * and nothing else in this product reads it.
     */
    sexLabel: 'Sex, which the equation has two forms for',
    sexMale: 'Male',
    sexFemale: 'Female',
    ageLabel: 'Age in years',
    heightLabel: 'Height in centimetres',
    weightLabel: 'Weight in kilograms',
    weightFrom: (source: string, when: string) => `Filled from your ${source} reading on ${when}.`,
    weightNone: 'No weight is stored yet, so type the one you want the target computed against.',
    yourRules: 'Your rules',
    yourRulesNote:
      'Four kinds, four behaviours, and nothing resolves one as another. An allergy is refused, an intolerance is substituted, an exclusion is omitted and a preference only changes what is reached for first.',
    addRule: 'Add a rule',
    removeRule: (kind: string, subject: string) => `Remove the ${subject} ${kind}`,
    ruleLine: (kind: string, subject: string) => `${kind}: ${subject}`,
    chooseKind: 'Which kind',
    chooseSubject: 'What it covers',
    activityLabel: 'Activity level',
    activityBandNote:
      'The four levels below are the FAO/WHO/UNU 2004 physical activity level bands, 1.40 to 1.90. The 1.2 rung every online calculator starts at has no primary source and sits below the floor for any adult who walks.',
    activityLevels: {
      sedentary: 'Desk job, little movement',
      light: 'Desk job, some walking',
      active: 'Active, trains regularly',
      veryActive: 'Physically demanding, or trains hard',
    },
    activityDescriptions: {
      sedentary: 'Seated work, under 5,000 steps, no training',
      light: '5,000 to 8,000 steps, one or two sessions a week',
      active: '8,000 steps and over, three or four sessions a week',
      veryActive: 'Manual work, or five hard sessions a week',
    },
    palValue: (pal: string) => `PAL ${pal}`,
    tdeeLabel: 'Estimated daily needs',
    rateLabel: 'Planned loss, kg a week',
    rateNote:
      'A deficit is set from the rate, at the static 7,700 kcal per kilogram. That figure overpredicts long-run loss because expenditure falls as mass falls, so it sets the starting target and the scale corrects it.',
    saveTarget: 'Save the target',
    savingTarget: 'Saving',
    targetSaved: 'Saved. Next week is generated against the new figures.',
    targetRefusedTitle: 'The target was not saved',

    /** The three floors, each one in the words the owner reads on the screen. */
    cautionBelowResting: (target: string, rmr: string) =>
      `${target} kcal is below your estimated resting needs of ${rmr} kcal. That is allowed, and it means the deficit is coming out of a day that has not moved yet.`,
    blockedTitle: 'That target is below 1,500 kcal',
    blockedBody: (target: string, floor: number) =>
      `${target} kcal a day is under the ${floor} kcal floor this app will set on its own. Below it you are in very-low-calorie territory, which is medically supervised territory.`,
    blockedProfessional:
      'Take this to a doctor or a registered dietitian before you go there. If you have already, confirm below and the target is saved with that fact on it.',
    blockedConfirm: 'I have spoken to a professional. Save it anyway.',
    blockedCancel: 'Set a higher target',
    blockedConfirmed: (when: string) => `Confirmed on ${when}.`,
    rateRefusedTitle: 'That rate of loss is refused',
    rateRefusedBody: (requested: string, ceiling: string, weight: string) =>
      `${requested} kg a week is faster than one percent of your body weight, which at ${weight} kg is ${ceiling} kg a week. Nothing was written and no plan was generated.`,
    rateOffer: (ceiling: string) => `Use ${ceiling} kg a week instead`,
    rateCeiling: (ceiling: string, weight: string) =>
      `The fastest this app will plan for you at ${weight} kg is ${ceiling} kg a week, which is one percent of your body weight.`,
    deficitAboveCap: (deficit: string, cap: number) =>
      `The deficit is ${deficit} kcal a day, over the ${cap} kcal a day the guidance tops out at.`,

    shoppingTitle: 'Shopping',
    shoppingSub: 'One week, grouped the way the shop is laid out',
    toBuy: (count: number) => (count === 1 ? '1 to buy' : `${count} to buy`),
    shoppingCounts: (deducted: number, inTrolley: number) =>
      `${deducted} deducted, ${inTrolley} already in the trolley`,
    shoppingBars: 'Checked, still to find, and deducted before you left the house.',
    aisles: {
      produce: 'Produce',
      fish_meat: 'Fish and meat',
      dairy_chilled: 'Dairy and chilled',
      dry_goods: 'Dry goods',
      store_cupboard: 'Store cupboard',
    },
    itemMeals: (count: number) => (count === 1 ? '1 meal' : `${count} meals`),
    itemFor: (quantity: string, meals: string) => `${quantity} · ${meals}`,
    /** Countable things. A count is not a unit, so the noun is copy with a key. */
    countNouns: {
      eggs: 'eggs',
      heads: 'heads',
      fillets: 'fillets',
      items: 'items',
      bunches: 'bunches',
      tins: 'tins',
    },
    quantityCount: (amount: string, noun: string) => `${amount} ${noun}`,
    quantityMass: (amount: string, unit: string) => `${amount} ${unit}`,
    tickItem: (name: string) => `Tick ${name} off the list`,
    untickItem: (name: string) => `Put ${name} back on the list`,
    ticked: (name: string) => `${name}, in the trolley`,
    oneMore: (name: string) => `One more ${name}`,
    oneFewer: (name: string) => `One fewer ${name}`,
    moreOf: (name: string) => `More ${name}`,
    lessOf: (name: string) => `Less ${name}`,
    openItem: (name: string) => `Open ${name}`,
    closeItem: 'Close',
    /**
     * A deducted line. It stays on the screen with its original quantity struck
     * through, because a line that vanishes is a line you cannot check, and the
     * whole point of a deduction is that the owner can see it rather than trust
     * it.
     */
    deductedBox: (day: string) => `In your recipe box, ${day}`,
    deductedStock: (quantity: string, when: string) => `In stock, ${quantity}, marked ${when}`,
    deductedOriginal: (quantity: string) => `${quantity} was on the list`,
    inStockToggle: 'I already have these',
    inStockNote: 'Deducts from this list and every list until you say otherwise.',
    stockBanner: 'Stock counts are yours, not measured. The app never assumes you used something up.',
    quantityLabel: 'Quantity',
    quantityStepNote: (step: string, unit: string) =>
      `Steps of ${step} ${unit}. Your edit sticks for this week only and is not treated as a preference.`,
    quantityStepCountNote:
      'One at a time. Your edit sticks for this week only and is not treated as a preference.',
    whereFrom: 'Where this comes from',
    fromMeal: (meal: string, when: string, quantity: string) => `${meal}, ${when}, ${quantity}`,
    roundedToUnit: 'Rounded to a shop unit',
    roundedFromTo: (needed: string, bought: string) => `${needed} needed, ${bought} bought`,
    saveItem: 'Save',
    removeItem: 'Remove from this week',
    addItem: 'Add something',
    shoppingClosing: 'Ticks save on this phone first and upload when the Mac mini answers.',
    excludedNote: (subject: string) =>
      `No ${subject} appears on this list, in any week. It is a stored rule on your profile, not a filter on this screen.`,

    shoppingEmptyTitle: 'No shopping list yet',
    shoppingEmptyBody:
      'The list is built from the meals you accepted. Confirm a week and everything it needs lands here, grouped by aisle, with the recipe box and your cupboard already deducted.',
    shoppingErrorTitle: 'The shopping list did not load',
    shoppingErrorBody: 'Nothing was changed. The rest of the app is unaffected.',
    shoppingLoading: 'Reading this week\'s list',
    shoppingOfflineTitle: 'Offline.',
    shoppingOfflineBody: (queued: number) =>
      queued === 1
        ? '1 tick saved on this phone.'
        : `${queued} ticks saved on this phone.`,
    shoppingStaleTitle: (days: number) =>
      days === 1 ? 'Built from a week accepted yesterday' : `Built from a week accepted ${days} days ago`,
    shoppingStaleBody: 'Confirm the current week to rebuild it.',

    dataSourcesTitle: 'Data sources',
    dataSourcesSub: 'Where every number on the Eat screens comes from',
    publisherLabel: 'Publisher',
    tableVersionLabel: 'Table version',
    licenceLabel: 'Licence',
    rowsLabel: 'Rows in the food table',
    lastUpdatedLabel: 'Last updated',
    ciqualPublisher:
      'Agence nationale de securite sanitaire de l\'alimentation, de l\'environnement et du travail (Anses)',
    ciqualTable: 'Table de composition nutritionnelle des aliments Ciqual 2025',
    ciqualLastUpdated: '3 November 2025',
    ciqualLicence: 'Licence Ouverte / Open Licence 2.0 (Etalab)',
    ciqualNotEndorsed: 'This application is not endorsed by or affiliated with Anses.',
    ciqualLink: 'Open ciqual.anses.fr',
    portionPublisher:
      'U.S. Department of Agriculture, Agricultural Research Service. USDA Food and Nutrient Database for Dietary Studies 2021-2023.',
    portionLicence: 'Public domain',
    portionUse: 'Portion weights only. No nutrition figure in this app comes from a USDA table.',
    energySourceLabel: 'Energy values',
    energySourceCounts: (published: number, computed: number, absent: number) =>
      `${published} published by Anses, ${computed} computed here by the EU 1169/2011 conversion factors, ${absent} with no energy at all.`,
    nullFibreCount: (count: number) =>
      count === 1
        ? '1 food carries no fibre value at all. It renders as unknown and never as 0.'
        : `${count} foods carry no fibre value at all. They render as unknown and never as 0.`,
    estimatesDisclaimer:
      'All figures are estimates. Energy and macronutrient values are averages for a food type, not measurements of the item you ate. This app is not a medical device and does not give medical advice.',
    dataSourcesLink: 'Data sources',
    dataSourcesFooter: 'Data: Anses Ciqual 2025 (Licence Ouverte 2.0). Estimates only.',
    /**
     * The everyday English name of an ingredient, and the name of a recipe
     * Vernier itself wrote.
     *
     * BOTH ARE COPY AND BOTH HAVE KEYS, EVEN THOUGH BOTH REACH THE SCREEN
     * THROUGH A DATABASE COLUMN. Anses names its rows in French, at laboratory
     * length: the row behind "Chicken breast" is "Poulet, filet sans peau cru".
     * The English beside it is a word this product chose for a person to read,
     * which is the definition C6 uses, and slice 3 already paid twice for the
     * idea that a column launders a sentence. The French name stays on the food
     * row screen beside the English one, because it is the publisher's own
     * identifier and dropping it would break the walk back to Anses.
     */
    foods: {
      spinach: 'Spinach',
      broccoli: 'Broccoli',
      potatoes: 'Potatoes',
      greenBeans: 'Green beans',
      courgette: 'Courgettes',
      peppers: 'Peppers',
      onion: 'Onions',
      cauliflower: 'Cauliflower',
      tomatoes: 'Tomatoes',
      sunDriedTomatoes: 'Sun-dried tomatoes',
      apple: 'Apples',
      banana: 'Bananas',
      frozenBlueberries: 'Frozen blueberries',
      raspberries: 'Raspberries',
      dill: 'Fresh dill',
      salmon: 'Salmon fillets',
      chickenBreast: 'Chicken breast',
      tinnedTuna: 'Tinned tuna',
      prawns: 'Prawns',
      mussels: 'Mussels',
      greekYoghurt: 'Greek yoghurt',
      semiSkimmedMilk: 'Semi-skimmed milk',
      fromageBlanc: 'Fromage blanc',
      eggs: 'Eggs',
      soyaYoghurt: 'Soya yoghurt',
      almondDrink: 'Almond drink',
      plantDessert: 'Plant dessert, no soya',
      rolledOats: 'Rolled oats',
      polenta: 'Polenta',
      whiteRice: 'White rice',
      quinoa: 'Quinoa',
      bulgur: 'Bulgur wheat',
      redLentils: 'Red lentils',
      chickpeas: 'Chickpeas',
      walnuts: 'Walnuts',
      almonds: 'Almonds',
      oliveOil: 'Olive oil',
      turmeric: 'Turmeric',
      cumin: 'Cumin seed',
      curryPowder: 'Curry powder',
    },

    /** The recipes Vernier ships. A recipe the owner imports carries his words. */
    recipes: {
      greekYoghurtBerriesWalnuts: 'Greek yoghurt, berries and walnuts',
      oatsBananaAlmonds: 'Oats, banana and almonds',
      eggsSpinachPotatoes: 'Eggs, spinach and potatoes',
      fromageBlancAppleAlmonds: 'Fromage blanc with apple and almonds',
      salmonSpinachPolenta: 'Salmon, spinach and polenta bowl',
      chickenQuinoaPeppers: 'Chicken, quinoa and roasted peppers',
      tunaChickpeaTomato: 'Tuna, chickpea and sun-dried tomato salad',
      chickenBulgurVegetables: 'Chicken and bulgur with roasted vegetables',
      prawnQuinoaSalad: 'Prawn and quinoa salad',
      salmonDillPotatoes: 'Salmon, dill potatoes and green beans',
      chickenBroccoliTraybake: 'Chicken and broccoli traybake',
      lentilDalCauliflowerRice: 'Lentil dal with cauliflower and rice',
      polentaVegetablesEggs: 'Polenta, roasted vegetables and eggs',
      chickenTikkaRice: 'Chicken tikka with rice',
      tunaQuinoaGreenBeans: 'Tuna, quinoa and green beans',
      vegetableFrittata: 'Courgette and pepper frittata',
      prawnCourgetteRice: 'Prawn and courgette rice',
      musselsPotatoes: 'Mussels with potatoes',
      appleAlmonds: 'Apple and almonds',
      greekYoghurtWalnuts: 'Greek yoghurt and walnuts',
      bananaAlmonds: 'Banana and almonds',
      fromageBlancRaspberries: 'Fromage blanc with raspberries',
    },

    /**
     * The honest limit of computing a recipe from its ingredients, said once
     * rather than hidden. Raw to cooked weight changes, frying absorbs oil and
     * roasting loses water, and this app models none of that in its first
     * version. It uses the raw Anses rows against raw weights, which is exact
     * arithmetic on the ingredient and an approximation of the plate.
     */
    rawWeightNote:
      'Ingredients are counted at their raw weight against the raw Anses rows. Cooking changes weight, and this app does not model that yet, so read these as the ingredients you bought rather than the plate you served.',
    foodTitle: 'Food',
    foodPublishedName: 'Name as Anses publishes it',
    foodEnglishName: 'Name in this app',
    foodGroupLabel: 'Anses group',
    foodPer100g: 'Per 100 g',
    foodCensored: 'Read as a ceiling, not a measurement',
    foodCensoredBody: (fields: string) =>
      `Anses printed "traces" or a "less than" value for ${fields}, so Vernier stored 0 and marked it. A censored zero is a limit somebody measured against, not a measurement of nothing.`,
    foodNotFound: 'No such food',
    foodNotFoundBody: 'That food is not in this database. Nothing was deleted; the id does not exist.',
    foodNoFibreExample: 'A food with no fibre value',
    foodComputedExample: 'A food whose energy Vernier computed',
    foodExampleNone: 'Every food in the table carries this value, so there is no example to show.',
    dataSourcesEmptyTitle: 'The food table is empty',
    dataSourcesEmptyBody:
      'No food row is loaded, so nothing can be planned and nothing would be honest to show. The table seeds at boot from the file committed with this build.',
  },

  metrics: {
    weight: 'Weight',
    waist: 'Waist',
    energy: 'Energy',
    fatigue: 'Fatigue',
    hunger: 'Hunger',
    satiety: 'Satiety',
    note: 'Note',
    steps: 'Steps',
    sleep_minutes: 'Sleep',
    resting_heart_rate: 'Resting heart rate',
    hrv: 'Heart rate variability',
    vo2_max: 'VO2 max',
    weight_average_7d: 'Weight, 7-day average',
    ldl_cholesterol: 'LDL cholesterol',
  },
} as const;
