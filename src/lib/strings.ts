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

  eat: {
    title: 'Eat',
    sub: 'The nutrition week, meal estimates and the shopping list',
    emptyTitle: 'No meals planned yet',
    emptyBody:
      'Breakfasts, weekday lunches and home dinners are planned against your calorie and macro targets, and the shopping list follows from them.',
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

    /** Everything the training routes refuse, and what they say when they do. */
    train: {
      noKey: 'This write carried no idempotency key.',
      noKeyDetail:
        'A session write is keyed by the client UUID its outbox entry holds, so a phone that retries in a basement gym applies it once.',
      bodyDetail: 'Nothing was written. Open the week again and repeat the action.',
      unknownAction: 'That is not something this endpoint does.',
      unknownActionDetail: 'Nothing was written, and the week is exactly as it was.',
      notFound: 'That session is not here.',
      notFoundDetail:
        'It may have been rejected, or it belongs to a week that has passed. Nothing was changed.',
      failed: 'The training write did not finish.',
      failedDetail:
        'Nothing was applied. What is on this phone is still on it and will upload when the Mac mini answers.',
      readinessIncomplete: 'The screening answer is incomplete.',
      readinessIncompleteDetail: 'All three questions are answered together or none of them is stored.',
      mediaNeedsMovement: 'A media record names the movement it belongs to.',
      mediaNeedsMovementDetail: 'Choose a movement and check the link again. Nothing was stored.',
      hostUnreachable: 'The video host could not be reached from this machine.',
      hostUnreachableDetail:
        'Nothing was stored. The check runs from the Mac mini rather than from your phone, because the answer depends on where it is asked from.',
    },

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

  /**
   * The movement catalogue's words. The rows themselves are in
   * `src/lib/catalogue.ts` and in the `movement` table, and they carry keys
   * rather than sentences, so this is the one place a cue is written.
   *
   * Every cue is paraphrase and every cue is short on purpose. The technique
   * references are named in `.forge/research/exercise-media.md` section 3 and
   * none of them may be copied: NHS text is Open Government Licence but
   * SHORTENING it flips the attribution rule, so an adapted cue carries the
   * generic licence line and never cites the NHS as its source. The Royal
   * Berkshire physiotherapy pack is the best per-movement reference in English
   * and is copyright, so it is read and not quoted. Growing Stronger's pictures
   * are public domain and its BOOK is copyright Tufts, so the GIFs are used and
   * the wording is not.
   */
  movement: {
    'wall-push-up': {
      name: 'Wall push-up',
      cue: "Stand an arm's length from the wall, hands at shoulder height. Bend the elbows until your nose is close to the wall, then push back. One straight line from head to heels.",
    },
    'push-up': {
      name: 'Push-up',
      cue: 'Hands under the shoulders, elbows tucked back rather than flared. Lower until the chest is a fist from the floor, then press up. Squeeze the glutes so the hips do not sag.',
    },
    'close-grip-push-up': {
      name: 'Close-grip push-up',
      cue: 'Hands narrow, thumbs almost touching. The elbows brush the ribs on the way down. Slower than it looks, and the triceps do most of it.',
    },
    'bench-dip': {
      name: 'Bench dip',
      cue: 'Hands on the chair edge behind you, fingers forward, feet out in front. Bend the elbows to about a right angle and press back up. Shoulders down, away from the ears.',
    },
    'triceps-dip': {
      name: 'Triceps dip',
      cue: 'Feet further out and legs straight, so more of you sits on your arms. Elbows point backwards, never out. Stop the set when the shoulders start to shrug.',
    },
    'chest-dip': {
      name: 'Chest dip',
      cue: 'On parallel bars, lean the chest forward a little. Lower until the upper arms are level with the floor, then press up. Shoulders stay down throughout.',
    },
    'wall-sit': {
      name: 'Wall sit',
      cue: 'Back flat to the wall, feet a stride out, slide down until the thighs are about level with the floor. Knees over the ankles, weight in the heels, breathing normally.',
    },
    'bodyweight-squat': {
      name: 'Bodyweight squat',
      cue: 'Feet about hip width. Sit back and down as if reaching for a chair: heels down, chest up, knees tracking over the toes. Two counts down, one up.',
    },
    'step-up': {
      name: 'Step-up',
      cue: 'Whole foot on the step, drive through that heel, stand tall at the top. Step down with control rather than dropping. The same number each side.',
    },
    lunge: {
      name: 'Lunge',
      cue: 'Step forward and lower until the front knee is about a right angle and the back knee is close to the floor. Trunk upright, no bend at the waist.',
    },
    'knee-extension': {
      name: 'Knee extension',
      cue: 'Sit tall in the chair. Straighten one knee until the leg is level, hold a beat, lower over three counts. No swinging.',
    },
    'pelvic-tilt': {
      name: 'Pelvic tilt',
      cue: 'On your back, knees bent. Flatten the low back into the mat by tilting the pelvis, hold for one breath, release. A small movement, and nothing lifts.',
    },
    'glute-bridge': {
      name: 'Glute bridge',
      cue: 'Feet flat, heels close to your seat. Squeeze the glutes and hamstrings and raise the hips to a straight line from shoulders to knees. Do not arch the back.',
    },
    'hamstring-curl': {
      name: 'Hamstring curl',
      cue: 'Hold the chair back. Bend one knee to bring the heel towards your seat with the thighs level, then lower over three counts.',
    },
    'hip-lift': {
      name: 'Single-leg hip lift',
      cue: 'The bridge with one foot off the mat. Keep the hips level: if one side drops, put the foot back down and finish the set on two.',
    },
    'hip-abduction': {
      name: 'Hip abduction',
      cue: 'On your side, legs straight and stacked. Raise the top leg to about 45 degrees with the toes pointing forward rather than up, then lower slowly.',
    },
    'calf-raise': {
      name: 'Calf raise',
      cue: 'Rise onto the balls of the feet, hold a beat at the top, lower over three counts until the heels touch. Hold something for balance if you need it.',
    },
    'donkey-calf-raise': {
      name: 'Bent-over calf raise',
      cue: 'Hinge forward with your hands on the chair and the hips high. Rise onto the balls of the feet from there, which puts more of you over the calves.',
    },
    'abdominal-brace': {
      name: 'Abdominal brace',
      cue: 'On your back, knees bent. Draw the navel gently towards the spine without holding your breath. Hold, then let go.',
    },
    'abdominal-curl': {
      name: 'Abdominal curl',
      cue: 'Knees bent, hands across the chest. Curl the shoulders off the mat until the shoulder blades clear it, then lower. The low back stays down.',
    },
    'dead-bug': {
      name: 'Dead bug',
      cue: 'On your back, arms up and knees over the hips. Lower one arm and the opposite leg towards the floor with the low back flat, return, then swap.',
    },
    crunch: {
      name: 'Crunch',
      cue: 'Curl up until the shoulder blades leave the mat, chin off the chest, and lower under control. Stop the set if the neck starts doing the work.',
    },
    'front-plank': {
      name: 'Front plank',
      cue: 'Elbows under the shoulders, one straight line from head to heels. Squeeze the glutes, brace the middle, breathe normally. Come down before the hips drop.',
    },
    'reverse-crunch': {
      name: 'Reverse crunch',
      cue: 'Knees bent over the hips. Curl the pelvis up so the hips lift a little off the mat, then lower slowly. The legs do not swing.',
    },
    'bicycle-crunch': {
      name: 'Bicycle crunch',
      cue: 'Shoulders off the mat. Bring one elbow towards the opposite knee while the other leg straightens, then alternate. Slow, not fast.',
    },
    'side-plank': {
      name: 'Side plank',
      cue: 'Elbow under the shoulder, hips stacked and lifted so the body makes one line. Bend the knees to make it easier. Both sides, same time.',
    },
    'lying-leg-raise': {
      name: 'Lying leg raise',
      cue: 'Legs straight, hands under your seat. Lower them until just before the low back lifts, then raise. That point is your range, and it moves.',
    },
    'mountain-climber': {
      name: 'Mountain climber',
      cue: 'From the top of a push-up, drive one knee towards the chest and back, then the other. Hips stay level and low, hands stay under the shoulders.',
    },
    'bird-dog': {
      name: 'Bird dog',
      cue: 'On hands and knees. Reach one arm forward and the opposite leg back until both are level with the trunk, hold a beat, swap. Nothing rotates.',
    },
    'floor-back-extension': {
      name: 'Floor back extension',
      cue: "Face down, arms by your sides. Lift the chest a hand's width off the mat looking at the floor, then lower. Small range, no crunching backwards.",
    },
    superman: {
      name: 'Superman',
      cue: 'Face down, arms ahead. Raise the arms, chest and legs together a little way, hold a beat, lower. Stop if the low back complains.',
    },
    'recovery-walk': {
      name: 'Recovery walk',
      cue: 'Brisk enough that you can still talk but not sing. Easy legs is the point of this one, not a workout in disguise.',
    },
    'treadmill-walk': {
      name: 'Treadmill walk',
      cue: 'Stand tall, look ahead, let the arms swing. Off the handrails once you are moving, and step to the sides to get on and off.',
    },
    'stationary-bike': {
      name: 'Stationary bike',
      cue: 'Set the saddle so the knee is almost straight at the bottom of the stroke. Steady cadence, and a resistance you can hold for the whole block.',
    },
    'treadmill-intervals': {
      name: 'Treadmill intervals',
      cue: 'A harder block, then an easy one, repeated. Ease off any time you cannot get out a few words.',
    },
    'jumping-jack': {
      name: 'Jumping jack',
      cue: 'Feet out and arms overhead, then back. Land softly through the whole foot. Step one foot out at a time if the jump is too much today.',
    },
    'high-knees': {
      name: 'High knees',
      cue: 'March or run on the spot, lifting each knee to about hip height. Land on the balls of the feet with the arms driving.',
    },
    burpee: {
      name: 'Burpee',
      cue: 'Squat, hands down, feet back to a plank, feet in, stand. Add the push-up or the jump when it feels easy, and leave the jump out if the knees object.',
    },
    'back-stretch': {
      name: 'Back stretch',
      cue: 'On your back, draw both knees gently towards the chest until the low back lengthens. Hold and breathe.',
    },
    'chest-stretch': {
      name: 'Chest stretch',
      cue: 'Hands behind the head, elbows wide, draw the shoulder blades together until the chest opens. Hold without arching the back.',
    },
    'hamstring-stretch': {
      name: 'Hamstring stretch',
      cue: 'Sit with one leg straight. Hinge forward from the hips with a long back until you feel it behind the thigh. Hold and breathe.',
    },
    'quad-stretch': {
      name: 'Quad stretch',
      cue: 'Stand tall holding a chair. Take one ankle behind you with the knees together and push the hip forward until you feel the front of the thigh.',
    },
    'toe-touch': {
      name: 'Toe touch',
      cue: 'Feet hip width, knees soft. Roll down towards the toes and let the head hang, then come up one vertebra at a time.',
    },
    'ankle-circle': {
      name: 'Ankle circles',
      cue: 'Lift one foot and draw slow circles with the toes, both directions. Small and controlled.',
    },
  },

  /**
   * The training week, screen 06.
   *
   * Every cause below names the input it acted on, because the panel's second
   * finding is that one unexplained placement costs the whole plan its
   * credibility. "Recommended" is a badge and says nothing; "you finished a
   * session on 3 of the last 4 Mondays" is a reason and can be argued with.
   */
  trainWeek: {
    label: (from: string, to: string) => `${from} to ${to}`,
    nextWeek: 'Next week',
    sessionCount: (count: number) => (count === 1 ? '1 session' : `${count} sessions`),
    range: (low: number, high: number) => `your range is ${low} to ${high}`,
    total: 'total',
    duration: (minutes: number) => `${minutes} min`,
    hoursAndMinutes: (hours: number, minutes: string) => `${hours} h ${minutes}`,
    shape: (strength: number, cardio: number) =>
      `${strength} full-body sessions and ${cardio} cardio, placed from the sessions you finished in the last 4 weeks.`,
    when: (from: string, to: string, place: string) => `${from} to ${to} · ${place}`,
    places: {
      home: 'mat at home',
      gym: 'gym',
      outdoors: 'outdoors',
    },
    kinds: {
      strength: 'Home strength',
      cardio: 'Gym cardio',
      intervals: 'Gym intervals',
      walk: 'Recovery walk',
    },
    fullBody: 'Full body',
    accept: 'Accept',
    edit: 'Edit',
    reject: 'Reject',
    states: {
      proposed: 'Not decided',
      edited: 'Edited',
      accepted: 'Accepted',
      rejected: 'Rejected',
    },
    rejectedNote:
      'Rejected. It will not be offered again this week, and the reason is kept so the app can tell whether this day never works or just this one.',
    decided: (accepted: number, rejected: number) => `${accepted} accepted, ${rejected} rejected`,
    undecided: (count: number) => `${count} still to decide`,
    askAgain: 'Ask for a different week',
    seeToday: "See today's plan",
    footerNote:
      'Accepted sessions appear on Today. Writing them into a calendar arrives with the calendar connection, and nothing reaches a calendar before you confirm the changes on screen.',
    proposeTitle: 'No week proposed yet',
    proposeBody:
      'Three to five sessions are proposed at a time, two or three of them full body, with at least 48 hours between two sessions that load the same muscle. Each one carries the reason it was placed where it was, and each one is accepted on its own.',
    propose: 'Propose next week',
    proposing: 'Working out the week',
    loadingLabel: 'Loading the proposed week',
    errorTitle: 'The proposed week did not load',
    errorBody: 'Everything already accepted is still on Today. Nothing was changed by this.',
    offlineTitle: 'Offline',
    offlineBody: (count: number) =>
      count === 1
        ? '1 decision is on this phone and will upload when the Mac mini is reachable.'
        : `${count} decisions are on this phone and will upload when the Mac mini is reachable.`,
    staleTitle: (days: number) => `This week was proposed ${days} days ago`,
    staleBody:
      'It was worked out from what you had done at the time. Ask for a different week and it is read again from today.',
    learnedLabel: 'What the app learned',
    learnedNone:
      'Nothing yet. Move a session three times and the app starts proposing the day you moved it to, and stops asking about the one you moved it from.',
    missedNote:
      'Missing a session does not change the difficulty of the plan. Two missed in a month is normal and gets no message.',
    cause: {
      mostCompletedDay: (weekday: string, done: number, weeks: number) =>
        `Placed on ${weekday}: you finished a session on this day in ${done} of the last ${weeks} weeks.`,
      spacedFromPrevious: (hours: number, when: string) =>
        `Placed ${hours} hours after ${when}, which loads the same muscles.`,
      lowSteps: (lowDays: number, ofDays: number, floor: string) =>
        `Added because you were under ${floor} steps on ${lowDays} of the last ${ofDays} days that have data.`,
      noHistoryYet: (sessions: number) =>
        `There is no history to read yet, so the week starts at ${sessions} sessions, which is where the guideline starts.`,
      weeklyCardio: (minutes: number) =>
        `One cardio session, because the weekly target is ${minutes} minutes of moderate work.`,
      painDeload: (site: string) =>
        `Volume is cut this week: you reported ${site} in two sessions running.`,
      ownEdit: (when: string) => `You moved this to ${when}.`,
    },
    longerFact: (percent: number, longest: number) =>
      `This session is ${percent}% longer than your longest in the last 30 days, which was ${longest} minutes.`,
    longerNote:
      'That is a fact about the length, not a risk. No trial has shown a progression rule that prevents injuries, so this app does not print a number that claims one.',
    editTitle: 'Edit this session',
    editStart: 'Start time',
    editDuration: 'Duration',
    editSave: 'Save this session',
    editReject: 'Reject this session',
    editNote:
      'Your edit is remembered as a correction rather than a one-off. Three of the same correction changes what gets proposed.',
    editSlotsNote:
      'Times are the slots this kind of session is placed in. Reading your calendar for busy hours arrives with the calendar connection, so nothing here is marked busy yet.',
    movements: (count: number) => `${count} movements`,
    equipment: 'Equipment',
    equipmentNone: 'Nothing but the floor',
    startSession: 'Start this session',
    back: 'Back',
  },

  /** Heart-rate guidance, and everything the app refuses to claim about it. */
  intensity: {
    label: 'Target range',
    bands: {
      light: 'Light',
      moderate: 'Moderate',
      vigorous: 'Vigorous',
      nearMaximal: 'Near maximal',
    },
    range: (band: string, low: number, high: number) => `${band}, ${low} to ${high} bpm`,
    openRange: (band: string, low: number) => `${band}, ${low} bpm and above`,
    methodReserve: (resting: number, maximum: number) =>
      `Worked out from your stored resting rate of ${resting} bpm and an estimated maximum of ${maximum}.`,
    methodMaximum: (age: number, maximum: number) =>
      `Worked out from an estimated maximum of ${maximum} at age ${age}. Store a resting heart rate and this switches to the method that fits you better.`,
    error: (low: number, high: number) =>
      `An estimate is wide: agreement limits are plus or minus ${low} to ${high} beats, which is enough to move a person across two bands. Read the range and never a single number.`,
    drift: (minutes: number) =>
      `Past ${minutes} minutes, heart rate drifts up on its own with no change in effort. Do not slow down to hold a number: use the talk test instead.`,
    noTracking:
      'This app does not read your heart rate, live or otherwise. These are numbers to aim at with a strap or a watch you already trust.',
    talkTestLabel: 'The one check during the session',
    talkTest: 'If you cannot get out a few words, ease off.',
    talkTestModerate: 'Moderate means you can still talk, but not sing.',
    talkTestVigorous: 'Vigorous means you cannot say more than a few words without pausing for breath.',
  },

  /** The 2-for-2 proposal, which is proposed and confirmed and never applied. */
  progression: {
    label: 'Ready to go up',
    trigger: (over: number, first: string, second: string) =>
      `You were ${over} or more reps over target on the last set on ${first}, and again on ${second}.`,
    load: (from: string, to: string) => `Load ${to} kg, up from ${from} kg`,
    reps: (from: number, to: number) => `Target ${to} reps, up from ${from}`,
    hold: (from: number, to: number) => `Hold ${to} s, up from ${from} s`,
    variation: (to: string) => `Move up to ${to}`,
    convention:
      'The trigger is a rule with evidence behind it. The size of the step is convention rather than a measurement: no trial establishes how much to add, so this is the smallest step the textbooks use, and you can change it.',
    confirm: 'Apply this from the next session',
    decline: 'Leave it where it is',
    confirmed: (when: string) => `Applied on ${when}.`,
    declined: 'Left where it is.',
    emptyTitle: 'Nothing is ready to go up',
    emptyBody:
      'A movement advances when you go 2 or more reps past the target on the last set, in two sessions running. Progression is not required to get results, so a week with none of this in it is a normal week.',
    blocked: (site: string) =>
      `Nothing advances while ${site} has been reported in two sessions running. That movement cuts volume instead.`,
  },

  /** The session player, screen 07. */
  player: {
    title: 'Session',
    start: 'Start the session',
    startNote:
      'The screen is kept awake and every time on this screen is read from the clock, so a call in the middle costs nothing.',
    leave: 'Pause and leave',
    block: (index: number, total: number) => `Block ${index} of ${total}`,
    elapsed: (clock: string) => `${clock} elapsed`,
    set: (index: number, total: number) => `Set ${index} of ${total}`,
    setDone: 'Set done',
    setState: {
      done: (index: number, achieved: string) => `Set ${index} · ${achieved} done`,
      now: (index: number) => `Set ${index} now`,
      todo: (index: number) => `Set ${index}`,
    },
    reps: (count: number) => `${count} reps`,
    seconds: (count: number) => `${count} s`,
    minutes: (count: number) => `${count} min`,
    load: 'Load',
    bodyweight: 'Bodyweight',
    lastWeek: 'Last week',
    lastWeekLine: (sets: number, achieved: string, load: string) => `${load}, ${sets} x ${achieved}`,
    lastWeekWithEffort: (sets: number, achieved: string, load: string, rir: number) =>
      `${load}, ${sets} x ${achieved}, ${rir} on the effort question`,
    lastWeekNone: 'No record of this movement yet, so this is the first one.',
    easier: 'Easier',
    harder: 'Harder',
    replace: 'Replace',
    rest: 'Rest',
    restOf: (seconds: number) => `of ${seconds} seconds`,
    addRest: (seconds: number) => `+${seconds} s`,
    skipRest: 'Skip rest',
    startSet: (index: number) => `Start set ${index}`,
    next: 'Next',
    nextMovement: (name: string, sets: number) => `Then ${name}, ${sets} sets`,
    nextNone: 'That is the last block.',
    spokenOn: 'Spoken cues on, tap to mute',
    spokenOff: 'Spoken cues muted, tap to turn on',
    spokenMutedNote: 'Muted, so nothing is spoken. Every cue is still on the screen.',
    cueRestEnding: (seconds: number) => `${seconds} seconds left`,
    cueSetStart: (name: string, target: string) => `${name}, ${target}`,
    cueSessionDone: 'Session done',
    cueLabel: 'Cue',
    awake: 'The screen is being kept awake.',
    notAwake:
      'This browser will not keep the screen awake, so it may lock between sets. Tap the screen to bring it back: nothing is lost when it does.',
    offlineNote:
      'This session runs with no signal. What you log stays on the phone and uploads when the Mac mini is reachable.',
    ringLabel: (done: number, total: number) => `${done} of ${total} sets done`,
    restRingLabel: (remaining: number, total: number) =>
      `Rest countdown, ${remaining} seconds left of ${total}`,
    finishedTitle: 'Session done',
    finishedSummary: (clock: string, blocks: number, sets: number) =>
      `${clock} · ${blocks} blocks · ${sets} sets`,
    finishedRing: 'Session complete, the ring is closed',
    effortResistance: 'How many more reps could you have done on the last set',
    effortResistanceNote:
      'One question, answered 1 to 10. Ten is nothing left in the tank, nine is one more, eight is two more. It is logged for now and nothing is prescribed from it for the first four weeks.',
    effortCardio: 'How hard was that, 0 to 10',
    effortCardioNote:
      'Zero is the effort of sitting and 10 is maximal effort. Moderate work is a 5 or a 6, and vigorous starts at a 7 or an 8.',
    cdcSource:
      'The 0 to 10 effort scale is from the CDC page "How to Measure Physical Activity Intensity", which is in the public domain and free on the agency website. The CDC does not endorse this app.',
    painLabel: 'Any pain',
    painSites: {
      none: 'None',
      knee: 'Knee',
      shoulder: 'Shoulder',
      back: 'Back',
      hip: 'Hip',
      ankle: 'Ankle',
      elbow: 'Elbow',
      other: 'Somewhere else',
    },
    painScore: 'How bad was it, 0 to 10',
    painRule:
      'Up to 5 out of 10 while you work is allowed, as long as it has gone by the next morning and is no worse than last week.',
    painMorning: 'Had it gone by the next morning',
    painMorningLater: 'Ask me in the morning',
    painAboveCeiling: (ceiling: number) =>
      `That is above the ${ceiling} out of 10 ceiling, so the next session cuts the volume on this movement rather than advancing it.`,
    painNotSubsided:
      'Pain still there the next morning means the last session was too much. The next one backs off.',
    painRose: 'That is worse than last week at the same site, so nothing on it advances.',
    painRepeated: (site: string) =>
      `The same site two sessions running, so ${site} work is cut back and nothing on it advances.`,
    painNote: 'Pain logged here changes next week, and the change says it was because of this.',
    note: 'Anything else',
    notePlaceholder: 'Optional.',
    save: 'Save and finish',
    saving: 'Saving',
    savedNote:
      'Saved on this phone. It uploads when the Mac mini is reachable. There is no prompt to rate anything, ever.',
    replaceTitle: 'Replace this movement',
    replaceBody: (load: string) => `Same muscles, same block length. Your ${load} carries over.`,
    replaceBodyBodyweight: 'Same muscles, same block length.',
    replaceEasier: 'Easier',
    replaceHarder: 'Harder',
    replaceSame: 'Same difficulty',
    use: 'Use this',
    remember: 'Remember this swap',
    rememberNote: 'Applies to every future session, not only tonight.',
    close: 'Close',
    mediaMissing: 'No demonstration is bundled for this movement yet.',
    emptyTitle: 'This session has no movements',
    emptyBody:
      'Nothing was written into it, which is a fault rather than a plan. Open the week and propose it again.',
    errorTitle: 'This session did not load',
    errorBody: 'Nothing was started and nothing was logged.',
    loadingLabel: 'Loading the session',
    notFoundTitle: 'That session is not here',
    notFoundBody: 'It may have been rejected, or it belongs to a week that has passed.',
  },

  /** The screening gate. ACSM 2015, three inputs, and never PAR-Q+. */
  readiness: {
    title: 'Before the first session',
    sub: 'Three questions from the screening algorithm in the 2015 update to the ACSM guidelines.',
    activityLabel: 'Have you been doing planned exercise at least three days a week for the last three months',
    activityActive: 'Yes, regularly',
    activityInactive: 'No, not regularly',
    diseaseLabel: 'Do you have known cardiovascular, metabolic or renal disease',
    diseaseYes: 'Yes',
    diseaseNo: 'No',
    symptomsLabel: 'Do you have any of these, at rest or during activity',
    symptoms: {
      chestDiscomfort:
        'Pain or discomfort in the chest, neck, jaw, arms or other areas that may result from ischaemia',
      shortnessOfBreath: 'Shortness of breath at rest or with mild exertion',
      dizziness: 'Dizziness or fainting',
      orthopnea: 'Breathlessness lying flat, or waking at night short of breath',
      ankleEdema: 'Ankle swelling',
      palpitations: 'Palpitations or a racing heart',
      claudication: 'Leg pain on walking that eases with rest',
      murmur: 'A known heart murmur',
      unusualFatigue: 'Unusual tiredness or breathlessness during your usual activities',
    },
    symptomsNone: 'None of these',
    intensityLabel: 'How hard do you want to work',
    intensityLightModerate: 'Light to moderate',
    intensityVigorous: 'Vigorous',
    save: 'Save this answer',
    saving: 'Saving',
    answeredOn: (when: string) => `Answered on ${when}.`,
    retake: 'Answer these again',
    outcomes: {
      proceed:
        'No clearance needed. Start where the plan starts and build from there.',
      proceedGradually:
        'Start at light to moderate work without clearance and build up gradually. Vigorous work is worth a word with a doctor first if you have been inactive.',
      clearanceFirst:
        'Speak to a doctor before starting. The plan stays here and nothing about it changes while you do.',
    },
    outcomeLabel: 'What that means',
    notParq:
      'These are the ACSM screening questions, not the PAR-Q+. That questionnaire may not be re-implemented as screens or built into an electronic form without written consent, so its wording is not in this app anywhere.',
    stopRule:
      'Stop any session if one of those appears while you are working. Pain with swelling, weakness and dark urine together is a same-day matter for a doctor.',
    notAnswered: 'The screening questions have not been answered yet.',
    notAnsweredBody:
      'Three questions, once a year. The week is proposed either way, and the answer changes what the app is willing to suggest.',
    answer: 'Answer them now',
  },

  /** The media provenance screen, and the editorial check on a pasted link. */
  media: {
    title: 'Movement media',
    sub: 'Where every demonstration came from, and the list a link may be added from.',
    bundledLabel: 'Bundled on this machine',
    bundledNote: (count: number, size: string) =>
      `${count} files, ${size} MB, served from this Mac mini and rendering with no signal at all.`,
    author: 'Author or source',
    licence: 'Licence',
    verified: 'Verified',
    mode: 'How it is shown',
    modes: {
      bundled: 'Bundled here',
      youtube_nocookie: 'Privacy-enhanced embed',
    },
    kinds: {
      still: 'Still',
      animation: 'Animation',
      video: 'Video',
    },
    addTitle: 'Add a video for a movement',
    addBody:
      'Paste a link. It is checked against the allowlist below, then checked with the host from this machine, and nothing is ever downloaded.',
    urlLabel: 'Link',
    urlPlaceholder: 'https://',
    movementLabel: 'Which movement',
    check: 'Check this link',
    checking: 'Checking with the host',
    accepted: (author: string) => `Accepted. The host names the author as ${author}.`,
    savedTitle: 'Added',
    refusedTitle: 'Refused',
    refusals: {
      notAUrl: 'That is not a link.',
      hostNotAllowed:
        'That host is not on the allowlist. Only the hosts listed below may be embedded, and the list is data you can change rather than something built into the app.',
      noVideoId: 'That link carries no video in it.',
      notEmbeddable:
        'The owner of that video does not allow it to be embedded, or it is age restricted. The host does not say which.',
      unavailable: 'That video is unavailable, removed, or blocked from here.',
      notAVideoLink: 'The host did not recognise that as a video.',
      noAuthor:
        'The host named no author, so nothing was stored. A record with no author cannot be attributed, and the database refuses one.',
    },
    allowlistLabel: 'Hosts a link may come from',
    allowlist: {
      nocookie:
        'The privacy-enhanced player. Measured on this machine: it sets no cookies on first load, where the ordinary host sets six.',
      share: 'The ordinary watch link, accepted here and turned into a privacy-enhanced embed.',
      short: 'The share shortener, accepted here and turned into a privacy-enhanced embed.',
    },
    embedNote:
      'Video is never downloaded, never copied to this machine, never served through it and never covered over. The frame is fetched by this phone, from the host, with nothing drawn on top of it.',
    offlineNote:
      'An embed needs the internet and cannot be cached, which is why every movement carries a bundled still or animation first. Video is the optional third layer.',
    attributionsLabel: 'Attributions',
    attributionLine: (author: string, licence: string) => `${author}, ${licence}`,
    licenceAndDate: (licence: string, when: string) => `${licence}, checked ${when}`,
    everkinetic:
      'Illustrations by Everkinetic, licensed CC BY-SA 4.0. Used unmodified, so they are a collection beside this app rather than an adaptation of it.',
    cdc:
      'Animations from the CDC "Growing Stronger" set, which are in the public domain and free on the agency website. The CDC does not endorse this app.',
    commons: 'Individual files from Wikimedia Commons, each one attributed to its own author above.',
    original: 'Three movements have no freely licensed demonstration anywhere, so this app drew its own.',
    emptyTitle: 'No media yet',
    emptyBody:
      'The catalogue seeds itself on the first boot. If this is empty, the seed did not run and the boot log says why.',
    errorTitle: 'The media list did not load',
    errorBody: 'The bundled files are still on this machine and the catalogue still renders them.',
    loadingLabel: 'Loading the media records',
    open: 'Open the source',
    count: (count: number) => `${count} records`,
    staleTitle: (days: number) => `Last checked ${days} days ago`,
    staleBody:
      'A bundled file cannot rot, so this is a note rather than a fault. An embed can: the host is asked again on a schedule so a dead one shows up here rather than as a black rectangle mid-session.',
  },

  /** The movement catalogue screen. */
  catalogue: {
    title: 'Movements',
    sub: 'Every movement the plan can ask for, with its cue and where its demonstration came from.',
    count: (count: number) => `${count} movements`,
    filterAll: 'All',
    modalities: {
      resistance: 'Strength',
      cardio: 'Cardio',
      mobility: 'Mobility',
    },
    target: (sets: number, target: string) => `${sets} sets of ${target}`,
    rest: (seconds: number) => `${seconds} s rest`,
    muscles: 'Loads',
    equipment: 'Equipment',
    equipmentNone: 'Nothing but the floor',
    ladder: 'On the ladder',
    ladderStep: (step: number) => `Step ${step}`,
    easier: (name: string) => `Easier: ${name}`,
    harder: (name: string) => `Harder: ${name}`,
    emptyTitle: 'The catalogue is empty',
    emptyBody:
      'It is seeded on boot from the movement list in this build. An empty catalogue means the seed did not run, and the boot log says why.',
    errorTitle: 'The catalogue did not load',
    errorBody: 'The bundled demonstrations are still on this machine. Only this list failed.',
    loadingLabel: 'Loading the catalogue',
    offlineNote: 'Every demonstration here is bundled on this machine and renders with no signal.',
    mediaFrom: (author: string) => `Demonstration by ${author}`,
    mediaAlt: (name: string) => `Demonstration of the ${name}`,
  },

  /** Muscle names, so a column value never reaches a screen as a column value. */
  muscles: {
    chest: 'Chest',
    triceps: 'Triceps',
    shoulders: 'Shoulders',
    back: 'Back',
    lats: 'Lats',
    quadriceps: 'Quadriceps',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Calves',
    core: 'Core',
    obliques: 'Obliques',
    'hip-abductors': 'Hip abductors',
    'whole-body': 'Whole body',
  },

  /** Equipment names, same rule. */
  equipment: {
    mat: 'Mat',
    chair: 'Chair',
    step: 'Step',
    'parallel bars': 'Parallel bars',
    treadmill: 'Treadmill',
    bike: 'Exercise bike',
  },
} as const;
