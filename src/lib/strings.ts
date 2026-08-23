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
        /**
         * It said "steps, workouts, sleep and resting heart rate" until slice 6
         * read the platform note. `Find Health Samples` asks HealthKit for
         * quantity and category types and a workout session is neither, so no
         * shortcut can read one and no version of this app will show one. The
         * research is explicit that this belongs in the product copy, so the
         * owner is not left waiting for something that cannot arrive.
         */
        purpose:
          'Steps, sleep, heart rate and VO2 max from the iPhone shortcut. Workouts never arrive: Apple does not let a shortcut read one.',
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

    /**
     * The Apple Health card on Settings, which is where the ingest credential
     * is created and revoked and where the two screens it owns are reached.
     *
     * The credential is shown once and this copy says so before the button is
     * pressed rather than after, because "cannot be shown again" read after the
     * fact is a trap and read before it is a warning.
     */
    ingestTitle: 'Apple Health shortcut',
    ingestNone: 'No ingest token yet',
    ingestNoneBody:
      'The iPhone shortcut needs a token and a signing secret before it can send anything. Both are shown once, here, and neither can be read back afterwards.',
    ingestLive: (keyId: string) => `Ingest token ${keyId} is live`,
    ingestCreatedOn: (when: string) => `Created ${when}`,
    ingestCreate: 'Create the ingest token',
    ingestRotate: 'Replace the ingest token',
    ingestRevoke: 'Revoke it',
    ingestFailed:
      'The Mac mini did not answer, so nothing changed. The token you had is still the token you have. Check the tailnet and try again.',
    ingestCreateWarning:
      'Creating a token revokes the one before it. The shortcut on the iPhone stops working until you paste the new pair into it.',
    ingestShownOnce: 'Copy both of these now',
    ingestShownOnceBody:
      'This is the only time either value is shown. They are not stored in a form this screen can read back, and closing this card loses them for good.',
    ingestTokenLabel: 'Ingest token, for the Authorization header',
    ingestSecretLabel: 'Signing secret, for the two Text actions',
    ingestKeyIdLabel: 'Key identifier',
    ingestDone: 'I have copied both',
    ingestOpenGuide: 'Open the shortcut guide',
    ingestOpenDiagnostics: 'Open ingest diagnostics',
    ingestScopeNote:
      'This token opens the ingest endpoint and nothing else. It cannot sign you in, it cannot read a measurement, and your sign-in cannot post a batch.',
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
      /** A2's answer path, which is a correction with a question named on it. */
      answerNeedsQuestion: 'That answer names no question.',
      answerNeedsQuestionDetail:
        'Open the value from Today and answer it there. Nothing was written.',
      answerQuestionGone: (id: string) => `There is no open question ${id} to answer.`,
      answerQuestionGoneDetail:
        'It was answered already, or this screen is older than the database. Open Today again.',
      answerRefused: 'That answer was not stored.',
      /** Frozen on the correction row at write time, the way every dedup reason is. */
      answerReason: (id: string) => `Answers import question ${id}.`,
    },

    correction: {
      /** Screen 00's error card, on the value sheet. One cause, one action. */
      title: 'The correction was not saved',
      lead: 'The value on file has not moved and nothing was written.',
      chip: 'Failed',
      retry: 'Try again',
    },

    withings: {
      bodyDetail: 'Open Settings and press the button again. Nothing was written.',
      unknownAction: 'That is not something the Withings connection does.',
      unknownActionDetail:
        'Connect, import, sync, test and disconnect are the five. Nothing was written.',
      notConfigured: 'This machine has no Withings credentials.',
      notConfiguredDetail:
        'Set WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET in the environment file and restart, or run the demonstration account, which needs neither.',
      notConnected: 'The scale is not connected.',
      notConnectedDetail: 'Connect it first. Nothing was read and nothing was written.',
      noCode: 'Withings came back with no authorisation code.',
      noCodeDetail: 'Start the connection again from Settings. Nothing was stored.',
      stateMismatch: 'That callback was refused.',
      stateMismatchDetail:
        'The value returned does not match the one this app sent, so the round trip was not this app asking. Nothing was stored.',
      exchangeFailed: 'The authorisation code did not exchange for a token.',
      exchangeFailedDetail:
        'The code lives 30 seconds. Start the connection again and accept the consent page without waiting.',
      failed: 'That Withings run did not finish.',
      failedDetail:
        'Nothing was written and the cursor did not move, so the next sync asks the same question. Every reading already stored is unchanged.',
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

    /**
     * The ingest endpoint's own words, and they carry more weight than any
     * other copy in this app.
     *
     * `Get Contents of URL` has no status output. The Shortcut cannot tell 200
     * from 401: all it can do is read one field out of the body and show it. So
     * every answer this endpoint gives, success and failure alike, carries a
     * `message` written for a person standing in a kitchen holding a phone, and
     * that message names the cause and the next action. A response with no
     * message is a run the owner cannot tell apart from silence.
     */
    ingest: {
      samplesStored: (accepted: number) =>
        accepted === 1 ? '1 new sample stored.' : `${accepted} new samples stored.`,
      alreadyHere: (duplicates: number) =>
        duplicates === 1 ? '1 was already here.' : `${duplicates} were already here.`,
      readingsStored: (readings: number) =>
        readings === 1
          ? 'One complete day became a reading.'
          : `${readings} complete days became readings.`,
      nothingNew: 'Nothing new arrived. Everything in that window was already stored.',
      noSamples:
        'That batch reached the Mac mini and carried no samples at all. Check the filters in the shortcut, and that Health is allowed to read each type.',
      /** A day the roll-up refused, named per metric so the owner can see which. */
      readingRefused: (metric: string, detail: string) => `${metric}: ${detail}`,

      badSchema: (field: string) =>
        `That batch is not in the form this app accepts. The field ${field} is missing, is not a string, or is not part of this contract. Nothing was stored.`,
      badVersion: (found: string) =>
        `This app accepts health.ingest.v1 batches, and that one said ${found}. Nothing was stored.`,
      badToken:
        'That request carried no ingest token this app knows. Open Settings on the Mac mini, create a new ingest token, and paste it into the shortcut.',
      badTokenRevoked:
        'That ingest token has been revoked. Create a new one in Settings on the Mac mini and paste it into the shortcut.',
      noCredential:
        'No ingest token exists on this machine yet. Open Settings on the Mac mini and create one, then paste it into the shortcut.',
      badDigest: (keyId: string) =>
        `The digest did not match the one this app computed for key ${keyId}. Either the secret in the shortcut is not the secret this app holds, or the canonical text has a line out of place. Open the ingest diagnostics screen and compare the two.`,
      staleTimestamp: (minutes: number) =>
        `That request was ${minutes} minutes old, and this app accepts five. Check that the iPhone clock is set automatically, then run the shortcut again.`,
      staleTimestampFuture: (minutes: number) =>
        `That request was timed ${minutes} minutes in the future, and this app accepts five. Check that the iPhone clock is set automatically, then run the shortcut again.`,
      replayedNonce:
        'That request repeated a nonce this app has already seen, so it was refused rather than stored a second time. Check that the shortcut builds a fresh nonce on every run.',
      forbiddenType: (series: string) =>
        `Blood pressure is never accepted by this app. Remove the ${series} block from the shortcut. Nothing in that batch was stored.`,
      lengthMismatch: (series: string, column: string, expected: string, found: string) =>
        `The ${series} block sent ${expected} readings but ${found} values for ${column}. Its six lists have to be the same length. Nothing was stored.`,
      tooLarge: (found: string, limit: string) =>
        `That batch carried ${found} where this app accepts ${limit}. Shorten the window in the shortcut, or group the busy metrics by hour, and run it again.`,
      badTimestampFormat: (series: string, field: string, found: string) =>
        `The ${series} block sent ${found} as its ${field} time. Every time has to carry a numeric offset, which is what the date format in the guide produces. Nothing was stored.`,
      /**
       * The same fault one field earlier, on the envelope rather than inside a
       * metric block. It reads differently because "the health.ingest.v1 block"
       * is not a thing the owner can go and look at, and a message that names
       * nothing findable is a message that helps nobody.
       */
      badEnvelopeTimestamp: (field: string, found: string) =>
        `The shortcut sent ${found} as ${field}. Every time has to carry a numeric offset, which is what the date format in the guide produces. Check the Format Date actions in Part B. Nothing was stored.`,
      failed:
        'The Mac mini could not finish storing that batch. Nothing was half stored. Run the shortcut again, and if it keeps failing the Mac mini is the place to look.',
      /** What a batch's outcome is called where the diagnostics screen lists it. */
      outcomes: {
        accepted: 'Stored',
        bad_schema: 'Wrong shape',
        bad_token: 'Token refused',
        bad_digest: 'Digest did not match',
        stale_timestamp: 'Clock too far out',
        replayed_nonce: 'Nonce already used',
        forbidden_type: 'Blood pressure refused',
        length_mismatch: 'Lists of different lengths',
        too_large: 'Too big',
        bad_timestamp_format: 'Time with no offset',
      },
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

    /**
     * The laboratory routes, and the refusals screen 05 renders in screen 00's
     * error card. Every one of them names a cause and a next step, and none of
     * them prints a value it refused.
     */
    labs: {
      noFile: 'No file arrived with that upload.',
      noFileDetail: 'Choose a PDF and try again. Nothing was stored.',
      notAPdf: 'That file is not a PDF.',
      notAPdfDetail:
        'Vernier reads laboratory PDFs on this machine. A photograph or a screenshot has to be saved as a PDF first.',
      tooLarge: (megabytes: number) => `That file is larger than ${megabytes} MB.`,
      tooLargeDetail:
        'A laboratory panel is a few hundred kilobytes. Nothing was written to the volume.',
      unreadable: 'That PDF could not be read.',
      unreadableDetail:
        'The file arrived whole but its structure could not be parsed. Nothing was stored and the file was not kept.',
      nothingFound: 'No result rows were found in that document.',
      nothingFoundDetail:
        'Every line was read and none of them held an analyte, a number and a unit together. The file was not kept and nothing was stored.',
      recogniserAbsent: 'This page has no text layer and optical recognition is not installed.',
      recogniserAbsentDetail:
        'The page was detected as an image rather than as text. Rather than store rows it cannot read, Vernier stopped. Install the recogniser on the Mac mini and open the file again; every other page of this document was left alone and nothing was stored.',
      languageDataAbsent: 'This page has no text layer and the French language data is missing.',
      languageDataAbsentDetail:
        'Optical recognition reads French from a data file on the storage volume and will not download one. Put fra.traineddata in the tessdata folder of the volume and open the file again. Nothing was stored.',
      recognitionFailed: 'Optical recognition could not read that page.',
      recognitionFailedDetail:
        'The page was rendered and the recogniser stopped on it. Nothing was stored, and the other pages of this document were left as they were.',
      noSuchDocument: 'No such review.',
      noSuchDocumentDetail:
        'That review is not in this database. It was either abandoned or already validated, and nothing was left behind.',
      noSuchRow: (ordinal: number) => `Row ${ordinal} is not in this review.`,
      noSuchRowDetail: 'The review may have been reloaded since. Open it again. Nothing was stored.',
      alreadyDecided: 'That row has already been decided.',
      alreadyDecidedDetail:
        'A row is saved or rejected once. Nothing was written a second time and the stored value has not moved.',
      /**
       * The refusal that makes the whole screen honest. It is raised when a
       * request carries anything that would apply more than one row, and it
       * names the number it counted rather than the rows, because naming the
       * rows would be the batch this refusal exists to prevent.
       */
      oneRowPerWrite: (counted: number) =>
        `That request would have stored ${counted} rows and this route stores one.`,
      oneRowPerWriteDetail:
        'Every laboratory row is accepted, edited or rejected on its own, behind its own control. There is no request shape that commits a panel, and nothing was written.',
      blocked: 'That row is waiting on a decision.',
      blockedDetail:
        'It is flagged, so it cannot be saved as it stands. Open it, correct what is flagged, and save it from there. Nothing was stored.',
      valueRefused: 'That value was not stored.',
      unknownAnalyte: 'No analyte was named for that row.',
      unknownUnit: (unit: string) => `${unit} is not a unit this analyte accepts.`,
      blank: 'The result field is empty.',
      censored: 'The sheet printed a limit rather than a number.',
      censoredDetail:
        'A limit is not a measurement. Type the number you want stored, or reject the row. Nothing is stored on a guess.',
      notANumber: (text: string) => `${text} is not a number.`,
      outOfBand: (name: string, low: string, high: string, unit: string) =>
        `${name} is stored between ${low} and ${high} ${unit}. That value is outside the band, so nothing was written.`,
      analyteNeedsName: 'A new analyte needs a name before it can be saved.',
      analyteNeedsNameDetail:
        'Type the name the sheet prints. It joins your catalogue with the unit and the interval you give it here.',
      retentionNeeded: 'That review has not been told what to do with the file.',
      retentionNeededDetail:
        'Keep it or delete it. Both consequences are on the screen and neither is a default.',
      cannotAbandon: (saved: number) =>
        saved === 1
          ? 'One row from this review is already stored, so the review cannot be abandoned.'
          : `${saved} rows from this review are already stored, so the review cannot be abandoned.`,
      cannotAbandonDetail:
        'A stored value keeps a link to the page it was printed on. Finish the review instead and choose whether to keep the file.',
      failed: 'That laboratory request failed.',
      failedDetail:
        'Nothing was stored. The rest of the app is unaffected and the review is still open.',
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
      importedFirst: (params: { source: string; key: string }) =>
        `The first time ${params.source} sent measure ${params.key}.`,
      importRevised: (params: { source: string; from: string; to: string }) =>
        `${params.source} revised this measure from ${params.from} to ${params.to}. The value before it is still readable.`,
    },
    /**
     * The whole id, never a slice of one. Eight characters of a UUID reads as
     * a mangled word rather than an identifier, and this sentence is frozen on
     * the row at write time: it is the line somebody follows back to the
     * original months later, so it names something they can search for.
     */
    correctionOf: (id: string) => `Corrects the reading ${id}, which stays readable.`,
    /**
     * A correction the owner did not type. It is frozen on the row at write
     * time exactly as a hand-written reason is, and it names who revised it,
     * because "corrected by you" on a row nobody touched is the app lying about
     * its own history.
     */
    revisedByImport: (source: string) => `${source} sent a revised value for this measure.`,
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
      /**
       * What one Withings batch carried, on the source screen. Every one of
       * these is a line the owner can read after the fact to answer "did that
       * import drop something", which is the question a source screen exists
       * for and the question no per-integration screen ever gets asked twice.
       */
      'source.field.mode': 'Ran against',
      'source.field.typeFilter': 'Types requested',
      'source.field.category': 'Category',
      'source.field.pages': 'Pages fetched',
      'source.field.groupsReceived': 'Measure groups',
      'source.field.groupsDropped': 'Groups dropped whole',
      'source.field.bloodPressureDropped': 'Dropped as blood pressure',
      'source.field.cursorFrom': 'Read from',
      'source.field.cursorTo': 'Cursor now',
      'source.field.duplicates': 'Already stored',
      'source.field.revised': 'Revised in place',
      'source.field.questions': 'Questions raised',
      'source.field.refusedByStorage': 'Refused by the store',
      'source.field.envelopeStatus': 'Envelope status',
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
    /**
     * The scale's silence, named by what caused it rather than by its age.
     *
     * F43 asks that a Withings adapter nobody can reach be named BY CAUSE on
     * Today and on Health, and "the scale last synced on Friday" is an age
     * wearing a cause's clothes. The connection records why the last attempt
     * failed as a token, and this turns that token into the sentence, with the
     * age still beside it in the chip.
     */
    scaleCauseWith: (cause: string, when: string) => `${cause} The last reading arrived on ${when}.`,
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
    /**
     * F55's line on Today: when the last batch actually landed, in words,
     * whether or not anything is wrong.
     *
     * It is shown when the shortcut is healthy as well as when it is not, and
     * that is the point. The panel's first finding is that silence is the
     * failure mode and that the owner should not have to notice an absence; a
     * timestamp he can read every morning is what turns "I think it is working"
     * into a fact. Past 36 hours it takes the warn treatment and says how long
     * it has been, which is the app noticing for him.
     */
    lastIngestLabel: 'Last batch from the iPhone',
    lastIngestNever: 'None yet',
    /**
     * Two keys rather than one with a branch on 48, and that is a checker fact
     * rather than a taste. The closed-world check renders every key with a
     * probe and tiles the screen out of what comes back; a branch it cannot
     * reach contributes no anchor, and the sentence behind it reads as copy
     * with no key. Both branches of each of these is reachable with a numeral.
     */
    lastIngestAgeHours: (hours: number) => (hours === 1 ? '1 hour ago' : `${hours} hours ago`),
    lastIngestAgeDays: (days: number) => (days === 1 ? '1 day ago' : `${days} days ago`),
    lastIngestNeverBody:
      'No batch has arrived from the iPhone yet. Build the shortcut from the guide in Settings and run it once by hand.',
    vo2Note:
      'VO2 max arrives from the watch every few weeks. Between two readings the app shows the last one with its date, never a fresh-looking number.',
    sleepNote:
      'Phases arrive when the watch records them. Nights without phases are stored as a duration only, never padded out.',
  },

  /**
   * The ingest diagnostics screen, which turns a silent mismatch into a number.
   *
   * It exists because the failure it grades is invisible from both ends. The
   * Shortcut cannot read a status code, so a refused batch looks to the owner
   * exactly like a batch that was never sent, and a digest that does not match
   * looks exactly like a token that is wrong. This screen prints one fixed
   * canonical string and the digest this machine computes for it with the live
   * secret, so the owner can run four lines on his Mac and see whether the two
   * secrets are the same secret. One comparison, one answer.
   */
  ingest: {
    title: 'Ingest diagnostics',
    sub: 'What the iPhone sent, and what this machine made of it',
    emptyTitle: 'No ingest token yet',
    emptyBody:
      'Create the token on Settings first. Until one exists there is no secret to compute a digest with, and every batch is refused before it is read.',
    emptyAction: 'Open Settings',

    credentialLabel: 'Credential',
    keyIdLabel: 'Key',
    createdLabel: 'Created',
    lastUsedLabel: 'Last request',
    stateLive: 'Live',
    neverUsed: 'No request yet',

    canonicalLabel: 'The canonical string',
    canonicalNote:
      'Six lines, newline joined, with no trailing newline. This one is fixed and is here to be compared, not sent. The shortcut builds the same six lines from its own values on every run.',
    /**
     * The fixed probe, one array entry per line, so each line is its own text
     * node and reads back as itself. Fixed on purpose: what varies between a
     * working shortcut and a broken one is the secret, so everything else is
     * held still and the digest below is the only thing that can differ.
     */
    canonicalLines: [
      'v1',
      'k1',
      '2026-08-21T18:04:11+02:00',
      '2026-08-21T18:04:11+02:00-482913756-119043882',
      '2026-08-19T00:00:00+02:00',
      '2026-08-21T18:00:00+02:00',
    ],
    digestLabel: 'The digest this machine computes for it',
    digestNote:
      'Two SHA-256 passes, lower-case hex. Run the four lines below on the Mac with the secret you pasted into the shortcut. Matching digests mean the shortcut and this app hold the same secret; different digests mean they do not, and that is the whole of what a refused batch is usually telling you.',
    digestMissing: 'No secret is stored, so there is no digest to compute.',
    commandLabel: 'How to compute it yourself',
    commandLines: [
      "CANONICAL=$'v1\\nk1\\n2026-08-21T18:04:11+02:00\\n2026-08-21T18:04:11+02:00-482913756-119043882\\n2026-08-19T00:00:00+02:00\\n2026-08-21T18:00:00+02:00'",
      "SECRET='paste the signing secret here'",
      'INNER=$(printf %s "$SECRET|$CANONICAL" | shasum -a 256 | cut -d" " -f1)',
      'printf %s "$SECRET|$INNER" | shasum -a 256 | cut -d" " -f1',
    ],
    fixtureLabel: 'Send a batch with no iPhone in the room',
    fixtureNote:
      'The repository carries a 48-hour fixture batch and the command that signs and posts it. It takes the same route, the same authentication and the same deduplication a phone does.',
    fixtureCommand: 'INGEST_TOKEN=... INGEST_SECRET=... bash scripts/ingest-fixture.sh',

    /** The one path this whole slice answers on, named once and read everywhere. */
    endpointPath: '/api/ingest/health',
    endpointLabel: 'Endpoint',
    batchesLabel: 'Recent arrivals',
    batchesNote:
      'Every arrival that carried a token is logged, refused ones included, because a batch that was turned away and a batch that was never sent look identical from the phone and need different fixes. A request carrying no credential at all writes nothing here, so nothing else on the tailnet can fill this list.',
    batchesEmpty: 'Nothing has arrived yet.',
    batchRow: (accepted: number, duplicates: number) =>
      `${accepted} stored, ${duplicates} already here`,
    batchDevice: (device: string) => `from ${device}`,
    staleTitle: 'The shortcut has gone quiet',
    staleBody: (hours: number) =>
      `The last batch this machine accepted arrived ${hours} hours ago, and the shortcut is meant to run three times a day. The endpoint is up, so this is the phone: open the shortcut and run it by hand.`,
    healthyBody:
      'The endpoint is up and the last batch was accepted. Nothing here needs you.',
    windowLabel: 'Window',
    windowRange: (from: string, to: string) => `${from} to ${to}`,
    guideLink: 'Open the shortcut guide',
    settingsLink: 'Open Settings',
    rowsLabel: 'Samples stored',
    censusLabel: 'What is in the table, by metric',
    censusTotal: (rows: number) =>
      rows === 1 ? '1 sample in total' : `${rows} samples in total`,
    censusNote:
      'A metric with rows here and no reading on Health is a slug the shortcut spelled differently from the guide. The rows are kept either way; nothing arriving is ever thrown out for being unrecognised.',
    tokenScopeBody:
      'The ingest endpoint, and nothing else. It cannot open a screen, read a measurement or sign anybody in, and your browser session cannot post a batch with it.',
  },

  /**
   * The Shortcut guide: the document the owner follows on the iPhone.
   *
   * EVERY ACTION NAME HERE IS THE NAME THE ACTION ACTUALLY HAS, taken from
   * `.forge/research/apple-health-shortcut.md`, which read them out of Apple's
   * own shipped action definitions rather than out of a blog. A guide naming an
   * action that does not exist is worse than no guide: it sends a person
   * hunting through a picker for forty minutes for something Apple never
   * shipped, and it is the failure this feature is measured against.
   *
   * The tone is a person talking to a person who is holding a phone. It says
   * how long it takes, it says out loud that the repetition is expected, and it
   * says which of the two things that can go wrong is which.
   */
  shortcutGuide: {
    title: 'The iPhone shortcut',
    sub: 'Build it once, then it runs on its own',
    lead: 'A web app cannot read Apple Health. Nothing can, except a shortcut running on the phone itself, so that is what this is: one shortcut you build once, which reads the last 48 hours of samples and posts them to this machine. It takes about forty minutes the first time. After that it is done.',

    arrivesLabel: 'What arrives',
    arrivesBody:
      'Steps, walking and running distance, flights climbed, active calories, exercise minutes, heart rate, resting heart rate, heart rate variability, VO2 max, and sleep with its phases.',
    notArrivingLabel: 'What does not, and why',
    notArrivingBody:
      'Workout sessions. Find Health Samples asks HealthKit for quantity and category types, and a workout is neither, so no shortcut can read one. The training log in this app is fed by its own guided sessions. Apple Health fills in everything around them.',

    /** F55's sentence. The absence has to read as a decision, not an oversight. */
    bloodPressureLabel: 'There is no blood pressure row here, on purpose',
    bloodPressureBody:
      'Vernier has no column for blood pressure, the endpoint refuses any batch that mentions it, and a block for it in this shortcut would make every run fail. Leave it out.',

    beforeLabel: 'Three settings, before you start',
    before: [
      'On the iPhone, open Settings, then Shortcuts, then Advanced, and turn on Allow Sharing Large Amounts of Data. It is on the basic privacy page, not the advanced one.',
      'Open Health, then the profile, then Privacy, then Apps and Services, then Shortcuts, and turn on the read permission for every type in the table below.',
      'Keep the ingest diagnostics screen open on the Mac. Part C needs the signing secret and Part D needs the token, and both are shown exactly once.',
    ],

    metricsLabel: 'The ten blocks, and how to group each one',
    metricsNote:
      'The slug goes in the metric field of the block. The label is what to search for in the type picker, which has been searchable since iOS 16.3. Grouping by hour turns a day of steps into 24 rows instead of hundreds; the sparse metrics are left alone.',
    metricsHeaderSlug: 'Slug',
    metricsHeaderLabel: 'Search the picker for',
    metricsHeaderGroup: 'Group by',
    metrics: [
      { slug: 'steps', label: 'Steps', group: 'Hour' },
      { slug: 'distance_walk_run', label: 'Walking + Running Distance', group: 'Hour' },
      { slug: 'flights_climbed', label: 'Flights Climbed', group: 'Hour' },
      { slug: 'active_calories', label: 'Active Calories', group: 'Hour' },
      { slug: 'exercise_minutes', label: 'Exercise Minutes', group: 'Hour' },
      { slug: 'heart_rate', label: 'Heart Rate', group: 'Minute' },
      { slug: 'resting_heart_rate', label: 'Resting Heart Rate', group: 'Not grouped' },
      { slug: 'hrv', label: 'Heart Rate Variability', group: 'Not grouped' },
      { slug: 'vo2_max', label: 'VO2 Max, or Cardio Fitness', group: 'Not grouped' },
      { slug: 'sleep', label: 'Sleep', group: 'Not grouped' },
    ],
    metricsUncertain:
      "Four of those labels were read off Apple's SDK rather than seen in the picker: Resting Heart Rate, Heart Rate Variability, VO2 Max and Cycling Distance. Search the picker for them rather than scrolling a category tree, and if VO2 Max is not there, look for Cardio Fitness, which is what the Health app renamed it to.",

    partALabel: 'Part A. One block per metric, nine actions, ten times',
    partANote:
      'Build the block once for steps, then duplicate it and change two fields. Ten metrics is ninety actions and it is meant to be that many. Nothing has gone wrong.',
    partA: [
      {
        action: 'Find Health Samples',
        detail:
          'First filter row: Type is the picker label from the table. Second row: Start Date is in the last 2 days. Set Sort by to Start Date and Order to Oldest First. Set Group by from the table. Leave the fill-empty toggle off. Leave Limit off, except on heart rate, where you turn it on and set 2000.',
      },
      {
        action: 'Check the action reads Find All Health Samples where',
        detail:
          'If it names a variable instead, a Health-sample variable above it has quietly turned it into a filter over that variable rather than a query over your library. Clear the variable and set it back to All Health Samples.',
      },
      {
        action: 'Get Details of Health Sample',
        detail: 'Set Detail to Start Date, and give it the Health Samples variable as input.',
      },
      {
        action: 'Format Date',
        detail:
          "Set Date Format to Custom, and type the format string exactly: yyyy-MM-dd'T'HH:mm:ssZ. The final Z is the numeric offset symbol, not the letter. A quoted 'Z' would label Paris time as UTC and shift every reading by two hours, and this app refuses a batch that does it.",
      },
      { action: 'Set Variable', detail: 'Name it startDates.' },
      {
        action: 'Get Details of Health Sample',
        detail: 'Detail is End Date this time, with the same Health Samples variable as input.',
      },
      { action: 'Format Date', detail: 'The same custom format string as before.' },
      { action: 'Set Variable', detail: 'Name it endDates.' },
      {
        action: 'Dictionary',
        detail:
          'Eight keys. metric is Text and holds the slug. grouping is Text and holds hour, minute or none. type, value, unit and source are Arrays: insert the Health Samples variable into each value field, tap it, and pick the matching property. start is an Array holding startDates and end is an Array holding endDates.',
      },
      { action: 'Add to Variable', detail: 'Name it series. Every block appends to the same one.' },
    ],

    partBLabel: 'Part B. The envelope, once',
    partB: [
      {
        action: 'Date, then Format Date, then Set Variable',
        detail: 'Current Date, the same custom format string, and name the variable now.',
      },
      {
        action: 'Date, then Adjust Date, then Format Date, then Set Variable',
        detail: 'Current Date, subtract 2 Days, the same format string, and name it windowStart.',
      },
      {
        action: 'Random Number, twice',
        detail:
          'Minimum 100000000, maximum 999999999, into variables r1 and r2. It does not need to be unpredictable. It needs to be different every run, and the server keeps every one it has seen for a day.',
      },
      { action: 'Text, then Set Variable', detail: 'The text is now, a hyphen, r1, a hyphen, r2. Name it nonce.' },
    ],

    partCLabel: 'Part C. The digest, five actions',
    partCNote:
      'Six lines, in this order, with no blank line at the end. The square brackets are variables you insert, not text you type. Note that the last line is now again, not windowStart.',
    canonicalLines: ['v1', 'k1', '[now]', '[nonce]', '[windowStart]', '[now]'],
    partC: [
      { action: 'Text, then Set Variable', detail: 'The six lines above. Name the variable canonical.' },
      {
        action: 'Text',
        detail:
          'The signing secret from the diagnostics screen, then a vertical bar, then the canonical variable. Nothing else, and no spaces around the bar.',
      },
      { action: 'Generate Hash', detail: 'Type SHA256. Then Set Variable, named inner.' },
      { action: 'Text', detail: 'The same signing secret, a vertical bar, then the inner variable.' },
      { action: 'Generate Hash', detail: 'Type SHA256 again. Then Set Variable, named digest.' },
    ],
    partCWhyTwo:
      'Two passes rather than one, because a single hash of a secret followed by a message can be extended by somebody who never knew the secret. The second pass runs over a fixed-length input, which closes that. It is not an HMAC and this app does not call it one: Shortcuts has no way to build a real one without a trick Apple never documented.',

    partDLabel: 'Part D. The request, five actions',
    partD: [
      {
        action: 'Dictionary',
        detail:
          'schema is health.ingest.v1. source is ios-shortcut. key_id is k1. device is the name of this phone. window_start is windowStart, window_end is now, generated_at is now, nonce is nonce. Add a key called series as an Array and leave it empty.',
      },
      {
        action: 'Set Dictionary Value',
        detail: 'Key series, value the series variable, dictionary the one from the step above.',
      },
      {
        action: 'Get Contents of URL',
        detail:
          'The URL is this machine plus /api/ingest/health. Tap Show More and set Method to POST. Under Headers add Authorization with the word Bearer, a space, then the ingest token; Content-Type as application/json; X-Ingest-Key-Id as k1; X-Ingest-Timestamp as now; X-Ingest-Nonce as nonce; X-Ingest-Digest as digest; and Idempotency-Key as nonce. Set Request Body to File and put the dictionary from the step above in the File slot.',
      },
      { action: 'Get Dictionary Value', detail: 'Key message, input Contents of URL.' },
      {
        action: 'Show Notification',
        detail:
          'Show the Dictionary Value. This is the whole feedback loop. Get Contents of URL gives the shortcut no status code, so this app answers every request with a sentence and the notification is the only place you will ever read it.',
      },
    ],

    partELabel: 'Part E. Running it without you',
    partE: [
      'Run the shortcut once by hand. Grant Health access with Always Allow when it asks. The notification should say how many samples were stored.',
      'Open Shortcuts, then Automation, then the plus, then Create Personal Automation. Choose Time of Day, set 08:30, Daily, then Next.',
      'Add exactly one action: Run Shortcut, pointing at this shortcut. Do not paste the ninety actions into the automation. An automation running its own actions is cut off after about four minutes; one that calls a saved shortcut is not.',
      "Open the automation, turn Ask Before Running off, tap Don't Ask, and tap Done.",
      'Repeat for 13:30 and 21:30. Three automations, one shortcut.',
      'Add the shortcut to the Home Screen, so a run by hand is always one tap away.',
      'Do not add it to Siri. A Siri-invoked shortcut gets about fifteen seconds and this one needs longer.',
    ],

    lockedLabel: 'Why it will sometimes not run, and what actually helps',
    lockedBody:
      "The iPhone encrypts the Health store while it is locked. That is Apple's own documented behaviour and there is no setting that changes it: an automation that fires at 03:00 on a locked phone reads nothing. Allowing the shortcut to run while locked removes a different gate and does not touch this one. Shortcuts also slow down badly when the screen has been off for ten seconds and the phone is not on a cable.",
    lockedRemedy:
      'So the three times are chosen for when the phone is usually in your hand, every run re-reads the last 48 hours so a run that lands heals the two before it, and the app tells you on Today when the last batch arrived. If you want a dependable overnight run, put the phone on a cable rather than a wireless pad.',

    troubleLabel: 'If something is wrong',
    trouble: [
      'The notification says the digest did not match. The secret in Part C is not the secret this app holds. Open ingest diagnostics and compare the digests.',
      'The notification says the token was refused. Create a new ingest token in Settings and paste it into the header in Part D.',
      'The notification says a time had no offset. The format string in Part A has a quoted Z in it. It must end in a bare Z.',
      'There is no notification at all. The request never reached the machine. Check that the iPhone is on the tailnet and that the URL in Part D matches the address in Settings.',
      'An action is not where this says it is. Use the search field at the top of the action list rather than the categories. Apple moves them between versions.',
    ],
    closing:
      'Nothing in this shortcut is a secret to anybody holding the unlocked phone, and the token inside it is deliberately narrow: it opens the ingest endpoint and nothing else. If you ever want it gone, revoke it in Settings and the next run is refused.',
  },

  /** The stored blood panel, read here and validated on screen 05. */
  panel: {
    label: (when: string) => `Blood panel, ${when}`,
    note: 'Reference intervals come from the laboratory sheet. This app explains what an analyte measures and never reads the number for you. Take questions to your doctor.',
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

    /**
     * The answer, which had nowhere to be written until now.
     *
     * `.forge/AMENDMENTS.md` A2: a question could be raised and never closed,
     * so a disagreeing re-import left a warning on Today that the owner could
     * do nothing about. That is the same failure the panel named from the other
     * side, the app telling him something is wrong and giving him no move.
     * Picking or typing here writes a correction that names the question, and
     * the question closes with what he chose recorded on it.
     */
    answerTitle: 'Answer it',
    answerBody:
      'Pick the number that is right, or type a different one. What you choose is written as a correction naming this question, and every value before it stays readable.',
    choiceLabel: 'Which number stands',
    keepStored: 'Keep your correction',
    takeIncoming: 'Take the import',
    typeAnother: 'Type a different number',
    provenanceLine: (source: string, when: string) => `${source}, ${when}`,
    answerValueLabel: (unit: string) =>
      unit === '' ? 'The number that stands' : `The number that stands, in ${unit}`,
    answerReasonLabel: 'Why, in your own words',
    answerReasonDefault: 'Answered an import question.',
    save: 'Answer and close this question',
    saving: 'Answering',
    answered: (value: string) => `Answered. ${value} stands and this question is closed.`,
    answerFailedTitle: 'That answer was not written',
    answerFailedLead: 'Nothing changed. Try again, or open the value and correct it directly.',
    answerRetry: 'Try again',
    closedTitle: 'This question is closed',
    closedBody: (value: string, when: string) =>
      `You answered on ${when} and ${value} stands. The correction it wrote is in the history below.`,
  },

  /**
   * Withings, on the status screen and in the words a failed sync gets.
   *
   * Everything here is a state or a cause. No token, no secret and no account
   * identifier has a key in this section, because nothing on that screen may
   * render one and the surest way to keep a value off a screen is to give it no
   * way to become a sentence.
   */
  withings: {
    title: 'Withings Body Smart',
    purpose:
      'Weight, fat ratio, fat mass, fat-free mass, muscle, bone, body water and standing heart rate, from the scale.',
    /** The state chip. The column holds a token; these are the words for it. */
    states: {
      disconnected: 'Not connected',
      connecting: 'Waiting for consent',
      connected: 'Connected',
      expiring: 'Expiring',
      revoked: 'Revoked',
      demo: 'Demonstration',
    },
    /**
     * Why it is not working, chosen from a token stored on the connection row.
     * A cause names what stopped and what to do about it, never a status code
     * on its own.
     */
    causes: {
      never_connected:
        'The scale has never been connected here, so nothing has arrived and nothing is being estimated in its place.',
      awaiting_consent:
        'The consent page was opened and has not come back yet. The authorisation code Withings issues lives 30 seconds, so if this has been sitting a while, start again.',
      unreachable:
        'This Mac could not reach Withings. Nothing was written, and every reading already stored is exactly where it was.',
      timeout:
        'Withings took longer than 10 seconds to answer. Nothing was written. A timeout is retried once and then reported rather than looped on.',
      not_json: 'Something answered that was not the Withings API. Nothing was written.',
      reconnect:
        'Withings refused the stored token, and refused it again after one refresh. Reconnecting is the only fix: the public API has no way to revive a dead refresh token.',
      rate_limited:
        'Withings asked for a pause. The next attempt waits and tries again, and nothing was lost.',
      api_error: 'Withings answered with an error it does not explain. Nothing was written.',
      not_configured:
        'No client id and no secret are set on this machine, so a live connection cannot be attempted. The demonstration account needs neither.',
      state_mismatch:
        'The value that came back from Withings is not the one this app sent. The round trip was refused and nothing was stored.',
      no_code: 'Withings came back with no authorisation code, so there was nothing to exchange.',
      exchange_failed:
        'The authorisation code did not exchange for a token. It lives 30 seconds, so the usual cause is a slow consent page.',
      page_cap:
        'The history is longer than one run walks. The rest arrives on the next sync, from the cursor this one left.',
    },
    /** What this installation is talking to, printed on the batch record. */
    modeDemo: 'the demonstration account, no network',
    modeLive: 'your Withings account',

    lastSync: 'Last successful sync',
    neverSynced: 'No successful sync yet',
    readingsStored: 'Readings stored',
    readingsSeen: 'Measures received',
    groupsDropped: 'Groups dropped whole',
    cursorLabel: 'Read up to',
    cursorNever: 'Nothing read yet',
    sinceLabel: (count: number) => (count === 1 ? '1 reading stored' : `${count} readings stored`),
    lastSyncLine: (when: string, count: number) =>
      count === 1 ? `Last sync ${when}, 1 reading stored` : `Last sync ${when}, ${count} readings stored`,

    connect: 'Connect the scale',
    connectDemo: 'Connect the demonstration account',
    reconnect: 'Reconnect',
    importHistory: 'Import the history',
    syncNow: 'Sync now',
    test: 'Test',
    disconnect: 'Disconnect',
    working: 'Working',

    connected: 'Connected. Import the history next.',
    connectOpen: 'Opening the Withings consent page. Accept it there and this screen picks it up.',
    imported: (stored: number, seen: number) =>
      `Imported. ${stored} readings stored out of ${seen} measures received.`,
    synced: (stored: number) =>
      stored === 1 ? 'Synced. 1 new reading stored.' : `Synced. ${stored} new readings stored.`,
    nothingNew: 'Synced. Withings has nothing new since the last read.',
    revisedNote: (count: number) =>
      count === 1
        ? '1 reading was revised, and the value before it is still readable.'
        : `${count} readings were revised, and the values before them are still readable.`,
    questionsNote: (count: number) =>
      count === 1
        ? '1 import disagrees with a correction you made. It is waiting on Today.'
        : `${count} imports disagree with corrections you made. They are waiting on Today.`,
    droppedNote: (count: number) =>
      count === 1
        ? '1 measure group was dropped whole because it carried blood pressure.'
        : `${count} measure groups were dropped whole because they carried blood pressure.`,
    testPassed: 'The connection answered and the token opened. Nothing was written.',
    testWrote: 'The connection answered. Nothing was written; this only asks.',
    disconnectedNote:
      'Disconnected. The stored token was deleted. Every reading it ever imported stays exactly where it is.',

    openBatch: 'Open the last sync',
    emptyTitle: 'The scale is not connected',
    emptyBody:
      'Connect it once and every weigh-in after that arrives on its own. Nothing is estimated in the meantime and no number is invented to fill the gap.',
    errorTitle: 'The last Withings run did not finish',
    errorStillWorks:
      'Everything else on this machine is unaffected. Today and Health still render every other source, and the readings already stored are unchanged.',
    errorRetry: 'Try it again',
    loading: 'Reading the connection',
    offline: 'This browser is offline, so the button could not reach the Mac mini. Nothing was sent.',
    bloodPressureNote:
      'Blood pressure is refused twice on the way in. A measure group carrying it is dropped whole, so the heart rate beside it is never harvested, and the store refuses any type outside the eight this app asks for even when the fetch is bypassed.',
    neverShown:
      'No token, no client secret and no account identifier appears on this screen, in any state.',
    scopeNote: 'One scope is requested and it is the one body composition rides on.',
  },

  /**
   * Screen 05, the curator's screen, and the most careful copy in this product.
   *
   * Two rules run through all of it. Nothing is stored until a row is accepted,
   * so every sentence on the review says what has and has not happened rather
   * than implying it. And R2: an explanation gives general reference-range
   * context, cites a public source and invites a professional, and never says
   * anything about what the owner's own number means. MDCG 2025-4 and the June
   * 2025 revision of MDCG 2019-11 Rule 11 make the stated intended purpose the
   * classification test, so that purpose is stated in docs/product.md and
   * enforced here by `npm run compliance`, which renders every template below
   * and fails on one banned phrase.
   */
  labs: {
    title: 'Blood tests',
    sub: 'Your panels, the analytes on them, and a review that stores nothing until you say so',

    archiveLabel: 'Panels on file',
    archiveEmptyTitle: 'No blood panel stored yet',
    archiveEmptyBody:
      'Drop a laboratory PDF here and it is read on this machine, row by row, with nothing stored until you accept a row. Or type a panel in by hand.',
    inReviewLabel: 'Waiting in review',
    inReviewCount: (rows: number, when: string) => `${rows} rows read, ${when}`,
    openReview: 'Open the review',
    panelOn: (when: string) => `Panel of ${when}`,
    panelStored: (count: number) => (count === 1 ? '1 value stored' : `${count} values stored`),
    fileKept: 'File kept on the Mac mini',
    fileDeleted: 'File deleted at your request',
    fileNever: 'Typed by hand, no file',

    uploadLabel: 'A laboratory PDF',
    uploadNote:
      'Read on this Mac mini with no network call. Nothing is sent to Claude and nothing leaves the machine.',
    uploadAction: 'Choose a PDF',
    uploading: 'Reading the file',
    uploadingNote: 'Extraction runs locally. A three-page panel takes a few seconds.',
    manualAction: 'Type a panel in by hand',
    manualLabel: 'No PDF',
    manualNote:
      'The same review screen, filled in by you. Each row still saves on its own, and nothing is stored until you save it.',

    reviewTitle: 'Review the panel',
    reviewFile: (name: string, pages: number) =>
      pages === 1 ? `${name}, 1 page` : `${name}, ${pages} pages`,
    reviewManualFile: 'Typed in by hand',
    cancelImport: 'Cancel the import',
    backToReview: 'Back to the review',
    nothingStoredTitle: 'Nothing is stored yet.',
    nothingStoredBody: (rows: number) =>
      `${rows} rows read from the file, held in this review only. Cancelling leaves nothing behind.`,
    panelHeader: (when: string, laboratory: string) =>
      laboratory === ''
        ? `Panel date read as ${when}.`
        : `Panel date read as ${when}, laboratory ${laboratory}.`,
    panelHeaderNoDate: 'No panel date was printed where this app looks for one.',

    refusedTitle: (count: number) =>
      count === 1 ? 'One row was refused.' : `${count} rows were refused.`,
    /**
     * THE PAGES THE REFUSALS WERE ACTUALLY ON, AND THE VERB AGREES WITH THE
     * LIST.
     *
     * One sentence took a string of every page in the document and read "Page
     * 1, 2, 3 holds a blood-pressure reading" on a three-page panel whose
     * blood-pressure line was on page 2. Two things wrong at once: the wrong
     * pages, and a singular verb over a list.
     *
     * THREE KEYS RATHER THAN ONE FUNCTION WITH THREE BRANCHES, and the reason
     * is the rendered check. scripts/rendered-strings.mjs probes a key that
     * takes data by calling it with a sentinel, 0, 1, 2, 5 and a proxy, and
     * none of those is an array of two, so two of the three branches would
     * never be rendered into an anchor and the plural sentence would read as
     * uncatalogued copy the first time a panel refused two pages. Each branch
     * takes a scalar here and `refusalSentence` in src/lib/display.ts picks
     * between them, which is where this product chooses words anyway.
     */
    refusedNoPage:
      'The page it was printed on was not recorded for this import. It was not extracted, it is not displayed here and it is not stored. This app has no field for it and never will.',
    refusedOnePage: (page: number) =>
      `Page ${page} holds a blood-pressure reading. It was not extracted, it is not displayed here and it is not stored. This app has no field for it and never will.`,
    refusedManyPages: (pages: string) =>
      `Pages ${pages} each hold a blood-pressure reading. They were not extracted, they are not displayed here and they are not stored. This app has no field for one and never will.`,
    /** "2, 4 and 7". The conjunction is a word a person reads, so it has a key. */
    refusedPageJoin: (pages: string, last: string) => `${pages} and ${last}`,

    needsEyes: (count: number) => `Needs your eyes, ${count}`,
    readCleanly: (count: number) => `Read cleanly, ${count}`,
    decidedLabel: (count: number) => `Decided, ${count}`,
    moreCleanly: (count: number) =>
      `${count} more read cleanly. Each one still saves on its own control.`,

    chipReady: 'Ready',
    chipLowConfidence: 'Low confidence',
    chipNewAnalyte: 'New analyte',
    chipSaved: 'Saved',
    chipRejected: 'Rejected',
    confidenceOf: (percent: number) => `Confidence ${percent}%`,
    referenceRange: (low: string, high: string) => `ref ${low} to ${high}`,
    referenceBelow: (high: string) => `ref below ${high}`,
    referenceAbove: (low: string) => `ref above ${low}`,
    referenceNone: 'no interval printed',

    acceptRow: (name: string) => `Save ${name} to your panel`,
    editRow: (name: string) => `Edit ${name} before saving`,
    rejectRow: (name: string) => `Reject ${name}`,
    savedAt: (when: string) => `Saved at ${when}`,
    rejectedAt: (when: string) => `Rejected at ${when}. It is not offered again for this file.`,
    correctedAt: (when: string) => `Corrected by you and saved at ${when}`,
    seePage: (page: number) => `See page ${page}`,
    decideFirst: 'Decide this row before it can be saved',
    readCleanlyButNew: 'Read cleanly, but new to your catalogue',

    /** Why a row is waiting, one sentence per flag, in the owner's language. */
    flags: {
      low_confidence:
        'The parse of this line was not clean enough to store without you looking at it.',
      unit_missing:
        'No unit was printed on this line. The app will not guess which one the sheet meant.',
      unit_unknown:
        'The unit printed on this line is not one this analyte accepts, so nothing has been converted.',
      value_censored:
        'The sheet printed a limit rather than a number. A limit is not a measurement and is never stored as one.',
      value_ambiguous:
        'The characters read here are not a number. Optical recognition returns 13.Q for 13.0 often enough that this is never assumed.',
      reference_missing: 'No reference interval was printed beside this result.',
      date_missing: 'No sample date was found for this row.',
      new_analyte:
        'Not in your catalogue. Saving it adds the analyte and starts its trend from this panel.',
      optical_recognition:
        'This page carried no text layer and was read by optical recognition, so every row from it waits for you.',
    },
    unitColumnBlank: 'The unit column exists on this page and this line left it empty.',
    conversionLine: (printed: string, factor: string, stored: string) =>
      `Printed ${printed}, x ${factor}, stored ${stored}. All three are kept.`,
    noConversion: (printed: string) => `Printed ${printed} and stored as printed.`,
    sameNumber:
      'These two symbols are the same number here. Choosing one records the choice, it does not convert anything.',

    rowTitle: (ordinal: number, total: number) => `row ${ordinal} of ${total}`,
    asPrinted: (page: number) => `As printed, page ${page}`,
    resultLabel: 'Result',
    unitLabel: 'Unit',
    referenceLabel: 'Reference interval',
    referenceLowLabel: 'Reference low',
    referenceHighLabel: 'Reference high',
    sampleDateLabel: 'Sample date',
    sampleDateNote: (zone: string) => `Read in ${zone}, as the laboratory printed it.`,
    analyteNameLabel: 'What the sheet calls it',
    analyteNameNote:
      'Saving under a name your catalogue does not hold adds that analyte and starts its trend here.',
    saveThisRow: 'Save this row',
    rejectThisRow: 'Reject this row',
    saving: 'Saving',
    storedTitle: 'What gets stored',
    storedBody:
      'The value you approve, the unit you picked, the printed original, the confidence at extraction, the file and page it came from, and the time you decided.',
    storedNote:
      'A later import that disagrees with this row becomes a question. It does not overwrite what you decided.',

    footerCounts: (saved: number, waiting: number, rejected: number) =>
      `${saved} saved, ${waiting} waiting on you, ${rejected} rejected`,
    footerNote:
      'Each row saves on its own control. There is no control here that stores more than one.',
    finishReview: 'Finish and decide about the file',

    finishTitle: (count: number) => (count === 1 ? '1 row saved' : `${count} rows saved`),
    finishBody: (when: string, names: string) =>
      `Panel of ${when}. Your trends now include ${names}.`,
    finishBodyNone: (when: string) =>
      `Panel of ${when}. Nothing from this file was stored, and the rows go with the review.`,
    andOthers: (count: number) => `and ${count} others`,
    summaryAccepted: 'Accepted',
    summaryCorrected: 'Corrected by you',
    summaryRejected: 'Rejected',
    summaryRefused: 'Refused at extraction',
    summaryRefusedValue: 'blood pressure',
    summaryWaiting: 'Left waiting',

    fileLabel: 'The file itself',
    fileSize: (megabytes: string, pages: number) =>
      pages === 1
        ? `${megabytes} MB, 1 page, on the Mac mini`
        : `${megabytes} MB, ${pages} pages, on the Mac mini`,
    keepIt: 'Keep it',
    keepNote:
      'Stays in the storage volume, included in the nightly backup, and every value above keeps a two-tap link to its page.',
    deleteIt: 'Delete it now',
    deleteNote:
      'The saved values stay. The printed originals stay. The link to the page goes, and that cannot be undone.',
    retentionAsk: 'Keep this file, or delete it?',
    retentionAskNote: 'Retention is a decision, not a default. This is the moment it is asked.',
    kept: 'Kept on the Mac mini.',
    deleted: 'Deleted from the volume.',
    whatLeftLabel: 'What left this machine',
    whatLeftBody:
      'Nothing. Extraction ran on the Mac mini and Claude was not called for this import.',
    backToHealth: 'Back to Health',

    censusLabel: 'Characters read per page',
    censusRow: (page: number, characters: number) => `Page ${page}: ${characters}`,
    censusImageOnly: (page: number, characters: number) =>
      `Page ${page}: ${characters}, under the threshold, so it went to optical recognition.`,
    censusThreshold: (threshold: number) =>
      `A page carrying fewer than ${threshold} non-whitespace characters holds no text layer and is read as an image.`,

    manualTitle: 'Type a panel in',
    manualSub: 'Result, unit, reference interval and date, per analyte. Nothing is stored here.',
    manualDateLabel: 'Sample date',
    manualBuild: 'Build the review',
    manualNothing: 'Fill at least one analyte before building the review.',
    manualRowNote: 'Leave an analyte blank to leave it off the panel.',
    manualAddAnalyte: 'An analyte not on this list',
    manualAddAnalyteNote:
      'Type its name, its unit and the interval the sheet printed. It joins your catalogue when the row is saved.',

    trendsLabel: 'Blood panel trends',
    /*
     * "One trend per analyte you have stored" was the first draft, and
     * `npm run compliance` refused it: "you have" is on the banned list because
     * it is how a sentence starts telling somebody what is wrong with them. The
     * phrase is innocent here and the list is right to be blunt about it, so the
     * copy moved rather than the rule. That is the check earning its place on
     * the day it was written.
     */
    trendsNote:
      'One trend per analyte with a stored panel. A panel is a point, not a line, so two panels a year apart are two points and nothing is drawn between them.',
    trendTitle: (name: string) => `${name}, every stored panel`,
    trendDesc:
      'One point per stored panel, in the order they were sampled. Nothing is interpolated between two panels and no value is carried forward.',
    trendCaption: (name: string) => `Stored ${name} values by sample date`,
    trendEmpty: (name: string) => `No ${name} stored yet.`,
    analyteCount: (count: number) => `${count} analytes in your catalogue`,
    openLabs: 'Open blood tests',
    seeAllOnHealth: (count: number) => `and ${count} more on Health`,

    /**
     * R2's templates, and the only thing this product ever says about an
     * analyte. Five parts, none of which takes a result as an argument, so
     * there is nowhere for a verdict about the owner to be written even by
     * accident. `npm run compliance` renders all five for every analyte in the
     * catalogue and fails on one banned phrase.
     */
    explanation: {
      between: (label: string, low: string, high: string, unit: string) =>
        `General adult reference ranges published for ${label} run from ${low} to ${high} ${unit}.`,
      below: (label: string, high: string, unit: string) =>
        `General adult reference ranges published for ${label} sit under ${high} ${unit}.`,
      above: (label: string, low: string, unit: string) =>
        `General adult reference ranges published for ${label} start at ${low} ${unit}.`,
      unstated: (label: string) =>
        `No general adult reference range is published on this screen for ${label}, so the interval on the sheet is the only one here.`,
      laboratoryWins:
        'Reference intervals differ between laboratories and between methods, so the interval printed on the sheet belongs with the number beside it.',
      storesNotReads:
        'Vernier stores the number, keeps the printed original beside it and draws the trend. It does not read the number and it does not say what the number means.',
      professional:
        'Take the question to the doctor who ordered the panel, or to the laboratory that issued the sheet.',
      source: (url: string) =>
        `Reference ranges here follow MedlinePlus Medical Tests, published by the U.S. National Library of Medicine: ${url}`,
      heading: 'What this analyte measures',
    },
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
    /**
     * DESIGN.md fixes kg, cm, km, kcal and g and then adds "the printed
     * laboratory unit", and slice 4 already extended the same rule to the units
     * a watch reports: bpm, ms, mL/kg/min. A fat ratio is a percentage and this
     * follows that precedent rather than inventing a kilogram for it.
     */
    '%': 'per cent',
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
    /* The laboratory units, kept as the sheet prints them. C6 allows the
       printed laboratory unit and nothing else, so each symbol has a key here
       rather than being concatenated onto a number in a component.
       Per cent is not repeated here: this map is the SPOKEN form and it
       already keys '%' as "per cent" above. */
    'U/L': 'U/L',
    'IU/L': 'IU/L',
    'UI/L': 'UI/L',
    'µkat/L': 'µkat/L',
    'µmol/L': 'µmol/L',
    'mg/L': 'mg/L',
    'mg/dL': 'mg/dL',
    'ng/mL': 'ng/mL',
    'µg/dL': 'µg/dL',
    text: '',
  },

  /** Units, so a number and its unit are never concatenated inside a component. */
  units: {
    kg: 'kg',
    cm: 'cm',
    '%': '%',
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
    'U/L': 'U/L',
    'IU/L': 'IU/L',
    'UI/L': 'UI/L',
    'µkat/L': 'µkat/L',
    'µmol/L': 'µmol/L',
    'mg/L': 'mg/L',
    'mg/dL': 'mg/dL',
    'ng/mL': 'ng/mL',
    'µg/dL': 'µg/dL',
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
    /**
     * THREE CHIPS, BECAUSE THERE ARE THREE ANSWERS AND F79 IS ABOUT TELLING
     * THEM APART.
     *
     * The screen printed the computed chip on every food, so a published 274
     * kcal wore the same words, the same colour and the same border as a
     * computed one and the marker marked nothing. `energy_source` holds
     * `published`, `computed_atwater` or null, and each one gets its own line
     * here. The dashed edge on the computed chip is DESIGN.md's mark for a
     * number this app produced rather than received; origin never spends a
     * semantic colour.
     */
    computedEnergyChip: 'Computed energy',
    publishedEnergyChip: 'Published energy',
    noEnergyChip: 'No energy value',
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
    /**
     * The same fact about ONE food rather than about a recipe's ingredients.
     * The recipe sentence above shipped on the food screen, where it told the
     * owner about ingredients on a page that has none.
     */
    publishedEnergyFoodBody:
      'Anses publishes this energy value in the Ciqual table. Vernier stores it as printed and computes nothing from the nutrients below.',
    noEnergyFoodBody:
      'Anses publishes no energy value for this food, and its protein, carbohydrate or fat is missing too, so there was nothing to compute one from. The energy reads unknown here and never 0.',
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
    /**
     * The censored columns, named the way a person names them.
     *
     * `food.censored_fields` holds the seed's own column names, and joining
     * them straight into the sentence below put `fibre_g` on the screen. C6
     * caught it the first time the nutrition surfaces were walked, which was
     * the merge, because slice 9's five screens were outside the walk until
     * then. A column name is not copy this product may render; it is the shape
     * of the store leaking through the words.
     */
    censoredFieldLabels: {
      kcal_100g: 'energy',
      protein_g: 'protein',
      carb_g: 'carbohydrate',
      fat_g: 'fat',
      fibre_g: 'fibre',
    } as Record<string, string>,
    censoredField: (column: string) => strings.nutrition.censoredFieldLabels[column] ?? column,
    foodCensoredBody: (fields: string) =>
      `Anses printed "traces" or a "less than" value for ${fields}, so Vernier stored 0 and marked it. A censored zero is a limit somebody measured against, not a measurement of nothing.`,
    foodNotFound: 'No such food',
    foodNotFoundBody: 'That food is not in this database. Nothing was deleted; the id does not exist.',
    foodNoFibreExample: 'A food with no fibre value',
    foodComputedExample: 'A food whose energy Vernier computed',
    /**
     * The other half of the pair. F79 is a comparison, so both sides of it are
     * one tap from the screen that states the counts: a published energy and a
     * computed one, side by side, each carrying its own chip.
     */
    foodPublishedExample: 'A food whose energy Anses published',
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
    /** The seven the scale sends beside the weight. */
    fat_mass: 'Fat mass',
    fat_free_mass: 'Fat-free mass',
    fat_ratio: 'Fat ratio',
    muscle_mass: 'Muscle mass',
    bone_mass: 'Bone mass',
    body_water: 'Body water',
    standing_heart_rate: 'Standing heart rate',
    /* The thirteen analytes slice 7 seeds into `lab_analyte`. Their labels are
       words a person reads, so they are keys here; a fourteenth analyte the
       owner adds carries the name HE typed and comes out of the database, which
       is data rather than copy and is excused by provenance. */
    fasting_glucose: 'Fasting glucose',
    hba1c: 'HbA1c',
    total_cholesterol: 'Total cholesterol',
    hdl_cholesterol: 'HDL cholesterol',
    ldl_cholesterol: 'LDL cholesterol',
    non_hdl_cholesterol: 'Non-HDL cholesterol',
    triglycerides: 'Triglycerides',
    alt: 'ALT',
    ast: 'AST',
    ggt: 'GGT',
    creatinine: 'Creatinine',
    crp: 'C-reactive protein',
    ferritin: 'Ferritin',
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
    /*
     * The sheet's own caption reads "Applies to every future session, not just
     * tonight", and this build can only make half of that true: it rewrites
     * every session already in the plan and ahead of now. A week proposed next
     * month picks its movements again from the catalogue, so the wider promise
     * would be an overclaim, and the copy says what the code does instead.
     */
    rememberNote: 'Applies to every session already in your plan, not only tonight.',
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
