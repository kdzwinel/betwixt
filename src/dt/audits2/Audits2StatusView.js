// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Audits2.StatusView = class {
  /**
   * @param {!Audits2.AuditController} controller
   */
  constructor(controller) {
    this._controller = controller;

    this._statusView = null;
    this._statusHeader = null;
    this._progressWrapper = null;
    this._progressBar = null;
    this._statusText = null;

    this._inspectedURL = '';
    this._textChangedAt = 0;
    this._fastFactsQueued = Audits2.StatusView.FastFacts.slice();
    this._currentPhase = null;
    this._scheduledTextChangeTimeout = null;
    this._scheduledFastFactTimeout = null;

    this._dialog = new UI.Dialog();
    this._dialog.setDimmed(true);
    this._dialog.setCloseOnEscape(false);
    this._dialog.setOutsideClickCallback(event => event.consume(true));
    this._render();
  }

  _render() {
    const dialogRoot = UI.createShadowRootWithCoreStyles(this._dialog.contentElement, 'audits2/audits2Dialog.css');
    const auditsViewElement = dialogRoot.createChild('div', 'audits2-view vbox');

    const cancelButton = UI.createTextButton(ls`Cancel`, this._cancel.bind(this));
    const fragment = UI.Fragment.build`
      <div class="audits2-view vbox">
        <h2 $="status-header">Auditing your web page\u2026</h2>
        <div class="audits2-status vbox" $="status-view">
          <div class="audits2-progress-wrapper" $="progress-wrapper">
            <div class="audits2-progress-bar" $="progress-bar"></div>
          </div>
          <div class="audits2-status-text" $="status-text"></div>
        </div>
        ${cancelButton}
      </div>
    `;

    auditsViewElement.appendChild(fragment.element());
    auditsViewElement.tabIndex = 0;

    this._statusView = fragment.$('status-view');
    this._statusHeader = fragment.$('status-header');
    this._progressWrapper = fragment.$('progress-wrapper');
    this._progressBar = fragment.$('progress-bar');
    this._statusText = fragment.$('status-text');

    this._dialog.setDefaultFocusedElement(cancelButton);
    this._dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.SetExactWidthMaxHeight);
    this._dialog.setMaxContentSize(new UI.Size(500, 400));
  }

  _reset() {
    this._resetProgressBarClasses();
    clearTimeout(this._scheduledFastFactTimeout);

    this._textChangedAt = 0;
    this._fastFactsQueued = Audits2.StatusView.FastFacts.slice();
    this._currentPhase = null;
    this._scheduledTextChangeTimeout = null;
    this._scheduledFastFactTimeout = null;
  }

  /**
   * @param {!Element} dialogRenderElement
   */
  show(dialogRenderElement) {
    this._reset();
    this.updateStatus(ls`Loading\u2026`);

    const parsedURL = this._inspectedURL.asParsedURL();
    const pageHost = parsedURL && parsedURL.host;
    const statusHeader = pageHost ? ls`Auditing ${pageHost}` : ls`Auditing your web page`;
    this._statusHeader.textContent = `${statusHeader}\u2026`;
    this._dialog.show(dialogRenderElement);
  }

  hide() {
    if (this._dialog.isShowing())
      this._dialog.hide();
  }

  /**
   * @param {string=} url
   */
  setInspectedURL(url = '') {
    this._inspectedURL = url;
  }

  /**
   * @param {?string} message
   */
  updateStatus(message) {
    if (!message || !this._statusText)
      return;

    if (message.startsWith('Cancel')) {
      this._commitTextChange(Common.UIString('Cancelling\u2026'));
      clearTimeout(this._scheduledFastFactTimeout);
      return;
    }

    const nextPhase = this._getPhaseForMessage(message);
    if (!nextPhase && !this._currentPhase) {
      this._commitTextChange(Common.UIString('Lighthouse is warming up\u2026'));
      clearTimeout(this._scheduledFastFactTimeout);
    } else if (nextPhase && (!this._currentPhase || this._currentPhase.order < nextPhase.order)) {
      this._currentPhase = nextPhase;
      this._scheduleTextChange(this._getMessageForPhase(nextPhase));
      this._scheduleFastFactCheck();
      this._resetProgressBarClasses();
      this._progressBar.classList.add(nextPhase.progressBarClass);
    }
  }

  _cancel() {
    this._controller.dispatchEventToListeners(Audits2.Events.RequestAuditCancel);
  }

  /**
   * @param {!Audits2.StatusView.StatusPhases} phase
   * @return {string}
   */
  _getMessageForPhase(phase) {
    if (phase.message)
      return Common.UIString(phase.message);

    const deviceType = Audits2.RuntimeSettings.find(item => item.setting.name === 'audits2.device_type').setting.get();
    const throttling = Audits2.RuntimeSettings.find(item => item.setting.name === 'audits2.throttling').setting.get();
    const match = Audits2.StatusView.LoadingMessages.find(item => {
      return item.deviceType === deviceType && item.throttling === throttling;
    });

    return match ? ls`${match.message}` : ls`Lighthouse is loading your page`;
  }

  /**
   * @param {string} message
   * @return {?Audits2.StatusView.StatusPhases}
   */
  _getPhaseForMessage(message) {
    return Audits2.StatusView.StatusPhases.find(phase => message.startsWith(phase.statusMessagePrefix));
  }

  _resetProgressBarClasses() {
    if (!this._progressBar)
      return;

    this._progressBar.className = 'audits2-progress-bar';
  }

  _scheduleFastFactCheck() {
    if (!this._currentPhase || this._scheduledFastFactTimeout)
      return;

    this._scheduledFastFactTimeout = setTimeout(() => {
      this._updateFastFactIfNecessary();
      this._scheduledFastFactTimeout = null;

      this._scheduleFastFactCheck();
    }, 100);
  }

  _updateFastFactIfNecessary() {
    const now = performance.now();
    if (now - this._textChangedAt < Audits2.StatusView.fastFactRotationInterval)
      return;
    if (!this._fastFactsQueued.length)
      return;

    const fastFactIndex = Math.floor(Math.random() * this._fastFactsQueued.length);
    this._scheduleTextChange(ls`\ud83d\udca1 ${this._fastFactsQueued[fastFactIndex]}`);
    this._fastFactsQueued.splice(fastFactIndex, 1);
  }

  /**
   * @param {string} text
   */
  _commitTextChange(text) {
    if (!this._statusText)
      return;
    this._textChangedAt = performance.now();
    this._statusText.textContent = text;
  }

  /**
   * @param {string} text
   */
  _scheduleTextChange(text) {
    if (this._scheduledTextChangeTimeout)
      clearTimeout(this._scheduledTextChangeTimeout);

    const msSinceLastChange = performance.now() - this._textChangedAt;
    const msToTextChange = Audits2.StatusView.minimumTextVisibilityDuration - msSinceLastChange;

    this._scheduledTextChangeTimeout = setTimeout(() => {
      this._commitTextChange(text);
    }, Math.max(msToTextChange, 0));
  }

  /**
   * @param {!Error} err
   */
  renderBugReport(err) {
    console.error(err);
    clearTimeout(this._scheduledFastFactTimeout);
    clearTimeout(this._scheduledTextChangeTimeout);
    this._resetProgressBarClasses();
    this._progressBar.classList.add('errored');

    this._commitTextChange('');
    this._statusText.createTextChild(Common.UIString('Ah, sorry! We ran into an error: '));
    this._statusText.createChild('em').createTextChild(err.message);
    if (Audits2.StatusView.KnownBugPatterns.some(pattern => pattern.test(err.message))) {
      const message = Common.UIString(
          'Try to navigate to the URL in a fresh Chrome profile without any other tabs or ' +
          'extensions open and try again.');
      this._statusText.createChild('p').createTextChild(message);
    } else {
      this._renderBugReportLink(err, this._inspectedURL);
    }
  }

  /**
   * @param {!Error} err
   * @param {string} auditURL
   */
  _renderBugReportLink(err, auditURL) {
    const baseURI = 'https://github.com/GoogleChrome/lighthouse/issues/new?';
    const title = encodeURI('title=DevTools Error: ' + err.message.substring(0, 60));

    const issueBody = `
**Initial URL**: ${auditURL}
**Chrome Version**: ${navigator.userAgent.match(/Chrome\/(\S+)/)[1]}
**Error Message**: ${err.message}
**Stack Trace**:
\`\`\`
${err.stack}
\`\`\`
    `;
    const body = '&body=' + encodeURIComponent(issueBody.trim());
    const reportErrorEl = UI.XLink.create(
        baseURI + title + body, Common.UIString('Report this bug'), 'audits2-link audits2-report-error');
    this._statusText.appendChild(reportErrorEl);
  }
};


/** @type {!Array.<!RegExp>} */
Audits2.StatusView.KnownBugPatterns = [
  /PARSING_PROBLEM/,
  /DOCUMENT_REQUEST/,
  /READ_FAILED/,
  /TRACING_ALREADY_STARTED/,
  /^You must provide a url to the runner/,
  /^You probably have multiple tabs open/,
];

/** @typedef {{message: string, progressBarClass: string, order: number}} */
Audits2.StatusView.StatusPhases = [
  {
    id: 'loading',
    progressBarClass: 'loading',
    statusMessagePrefix: 'Loading page',
    order: 10,
  },
  {
    id: 'gathering',
    progressBarClass: 'gathering',
    message: 'Lighthouse is gathering information about the page to compute your score.',
    statusMessagePrefix: 'Retrieving',
    order: 20,
  },
  {
    id: 'auditing',
    progressBarClass: 'auditing',
    message: 'Almost there! Lighthouse is now generating your report.',
    statusMessagePrefix: 'Evaluating',
    order: 30,
  }
];

/** @typedef {{message: string, deviceType: string, throttling: string}} */
Audits2.StatusView.LoadingMessages = [
  {
    deviceType: 'mobile',
    throttling: 'on',
    message: 'Lighthouse is loading your page with throttling to measure performance on a mobile device on 3G.',
  },
  {
    deviceType: 'desktop',
    throttling: 'on',
    message: 'Lighthouse is loading your page with throttling to measure performance on a slow desktop on 3G.',
  },
  {
    deviceType: 'mobile',
    throttling: 'off',
    message: 'Lighthouse is loading your page with mobile emulation.',
  },
  {
    deviceType: 'desktop',
    throttling: 'off',
    message: 'Lighthouse is loading your page.',
  },
];

Audits2.StatusView.FastFacts = [
  '1MB takes a minimum of 5 seconds to download on a typical 3G connection [Source: WebPageTest and DevTools 3G definition].',
  'Rebuilding Pinterest pages for performance increased conversion rates by 15% [Source: WPO Stats]',
  'BBC has seen a loss of 10% of their users for every extra second of page load [Source: WPO Stats]',
  'By reducing the response size of JSON needed for displaying comments, Instagram saw increased impressions [Source: WPO Stats]',
  'Walmart saw a 1% increase in revenue for every 100ms improvement in page load [Source: WPO Stats]',
  'If a site takes >1 second to become interactive, users lose attention, and their perception of completing the page task is broken [Source: Google Developers Blog]',
  '75% of global mobile users in 2016 were on 2G or 3G [Source: GSMA Mobile]',
  'The average user device costs less than 200 USD. [Source: International Data Corporation]',
  '53% of all site visits are abandoned if page load takes more than 3 seconds [Source: Google DoubleClick blog]',
  '19 seconds is the average time a mobile web page takes to load on a 3G connection [Source: Google DoubleClick blog]',
  '14 seconds is the average time a mobile web page takes to load on a 4G connection [Source: Google DoubleClick blog]',
  '70% of mobile pages take nearly 7 seconds for the visual content above the fold to display on the screen. [Source: Think with Google]',
  'As page load time increases from one second to seven seconds, the probability of a mobile site visitor bouncing increases 113%. [Source: Think with Google]',
  'As the number of elements on a page increases from 400 to 6,000, the probability of conversion drops 95%. [Source: Think with Google]',
  '70% of mobile pages weigh over 1MB, 36% over 2MB, and 12% over 4MB. [Source: Think with Google]',
  'Lighthouse only simulates mobile performance; to measure performance on a real device, try WebPageTest.org [Source: Lighthouse team]',
];

/** @const */
Audits2.StatusView.fastFactRotationInterval = 6000;
/** @const */
Audits2.StatusView.minimumTextVisibilityDuration = 3000;
