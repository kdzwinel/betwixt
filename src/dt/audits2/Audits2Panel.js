// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Audits2.Audits2Panel = class extends UI.Panel {
  constructor() {
    super('audits2');
    this.registerRequiredCSS('audits2/lighthouse/report-styles.css');
    this.registerRequiredCSS('audits2/audits2Panel.css');

    this._protocolService = new Audits2.ProtocolService();
    this._controller = new Audits2.AuditController(this._protocolService);
    this._startView = new Audits2.StartView(this._controller);
    this._statusView = new Audits2.StatusView(this._controller);

    this._unauditableExplanation = null;
    this._cachedRenderedReports = new Map();

    this._dropTarget = new UI.DropTarget(
        this.contentElement, [UI.DropTarget.Type.File], Common.UIString('Drop audit file here'),
        this._handleDrop.bind(this));

    this._controller.addEventListener(Audits2.Events.PageAuditabilityChanged, this._refreshStartAuditUI.bind(this));
    this._controller.addEventListener(Audits2.Events.AuditProgressChanged, this._refreshStatusUI.bind(this));
    this._controller.addEventListener(Audits2.Events.RequestAuditStart, this._startAudit.bind(this));
    this._controller.addEventListener(Audits2.Events.RequestAuditCancel, this._cancelAudit.bind(this));

    this._renderToolbar();
    this._auditResultsElement = this.contentElement.createChild('div', 'audits2-results-container');
    this._renderStartView();

    this._controller.recomputePageAuditability();
  }

  /**
   * @param {!Common.Event} evt
   */
  _refreshStartAuditUI(evt) {
    this._unauditableExplanation = evt.data.helpText;
    this._startView.setUnauditableExplanation(evt.data.helpText);
    this._startView.setStartButtonEnabled(!evt.data.helpText);
  }

  /**
   * @param {!Common.Event} evt
   */
  _refreshStatusUI(evt) {
    this._statusView.updateStatus(evt.data.message);
  }

  _refreshToolbarUI() {
    this._downloadButton.setEnabled(this._reportSelector.hasCurrentSelection());
    this._clearButton.setEnabled(this._reportSelector.hasItems());
  }

  _clearAll() {
    this._reportSelector.clearAll();
    this._renderStartView();
    this._refreshToolbarUI();
  }

  _downloadSelected() {
    this._reportSelector.downloadSelected();
  }

  _renderToolbar() {
    const toolbar = new UI.Toolbar('', this.element);

    this._newButton = new UI.ToolbarButton(Common.UIString('Perform an audit\u2026'), 'largeicon-add');
    toolbar.appendToolbarItem(this._newButton);
    this._newButton.addEventListener(UI.ToolbarButton.Events.Click, this._renderStartView.bind(this));

    this._downloadButton = new UI.ToolbarButton(Common.UIString('Download report'), 'largeicon-download');
    toolbar.appendToolbarItem(this._downloadButton);
    this._downloadButton.addEventListener(UI.ToolbarButton.Events.Click, this._downloadSelected.bind(this));

    toolbar.appendSeparator();

    this._reportSelector = new Audits2.ReportSelector(() => this._renderStartView());
    toolbar.appendToolbarItem(this._reportSelector.comboBox());

    this._clearButton = new UI.ToolbarButton(Common.UIString('Clear all'), 'largeicon-clear');
    toolbar.appendToolbarItem(this._clearButton);
    this._clearButton.addEventListener(UI.ToolbarButton.Events.Click, this._clearAll.bind(this));

    this._refreshToolbarUI();
  }

  _renderStartView() {
    this._auditResultsElement.removeChildren();
    this._statusView.hide();

    this._reportSelector.selectNewAudit();
    this.contentElement.classList.toggle('in-progress', false);

    this._startView.show(this.contentElement);
    this._startView.setUnauditableExplanation(this._unauditableExplanation);
    this._startView.setStartButtonEnabled(!this._unauditableExplanation);
    if (!this._unauditableExplanation)
      this._startView.focusStartButton();

    this._newButton.setEnabled(false);
    this._refreshToolbarUI();
    this.setDefaultFocusedChild(this._startView);
  }

  /**
   * @param {string} inspectedURL
   */
  _renderStatusView(inspectedURL) {
    this.contentElement.classList.toggle('in-progress', true);
    this._statusView.setInspectedURL(inspectedURL);
    this._statusView.show(this.contentElement);
  }

  /**
   * @param {!ReportRenderer.ReportJSON} lighthouseResult
   * @param {!ReportRenderer.RunnerResultArtifacts=} artifacts
   */
  _renderReport(lighthouseResult, artifacts) {
    this.contentElement.classList.toggle('in-progress', false);
    this._startView.hideWidget();
    this._statusView.hide();
    this._auditResultsElement.removeChildren();
    this._newButton.setEnabled(true);
    this._refreshToolbarUI();

    const cachedRenderedReport = this._cachedRenderedReports.get(lighthouseResult);
    if (cachedRenderedReport) {
      this._auditResultsElement.appendChild(cachedRenderedReport);
      return;
    }

    const reportContainer = this._auditResultsElement.createChild('div', 'lh-vars lh-root lh-devtools');

    const dom = new DOM(/** @type {!Document} */ (this._auditResultsElement.ownerDocument));
    const renderer = new Audits2.ReportRenderer(dom);

    const templatesHTML = Runtime.cachedResources['audits2/lighthouse/templates.html'];
    const templatesDOM = new DOMParser().parseFromString(templatesHTML, 'text/html');
    if (!templatesDOM)
      return;

    renderer.setTemplateContext(templatesDOM);
    const el = renderer.renderReport(lighthouseResult, reportContainer);
    Audits2.ReportRenderer.addViewTraceButton(el, artifacts);
    Audits2.ReportRenderer.linkifyNodeDetails(el);

    this._cachedRenderedReports.set(lighthouseResult, reportContainer);
  }

  /**
   * @param {!ReportRenderer.ReportJSON} lighthouseResult
   * @param {!ReportRenderer.RunnerResultArtifacts=} artifacts
   */
  _buildReportUI(lighthouseResult, artifacts) {
    if (lighthouseResult === null)
      return;

    const optionElement = new Audits2.ReportSelector.Item(
        lighthouseResult, () => this._renderReport(lighthouseResult, artifacts), this._renderStartView.bind(this));
    this._reportSelector.prepend(optionElement);
    this._refreshToolbarUI();
    this._renderReport(lighthouseResult);
  }

  /**
   * @param {!DataTransfer} dataTransfer
   */
  _handleDrop(dataTransfer) {
    const items = dataTransfer.items;
    if (!items.length)
      return;
    const item = items[0];
    if (item.kind === 'file') {
      const entry = items[0].webkitGetAsEntry();
      if (!entry.isFile)
        return;
      entry.file(file => {
        const reader = new FileReader();
        reader.onload = () => this._loadedFromFile(/** @type {string} */ (reader.result));
        reader.readAsText(file);
      });
    }
  }

  /**
   * @param {string} report
   */
  _loadedFromFile(report) {
    const data = JSON.parse(report);
    if (!data['lighthouseVersion'])
      return;
    this._buildReportUI(/** @type {!ReportRenderer.ReportJSON} */ (data));
  }

  async _startAudit() {
    Host.userMetrics.actionTaken(Host.UserMetrics.Action.Audits2Started);

    try {
      const inspectedURL = await this._controller.getInspectedURL({force: true});
      const categoryIDs = this._controller.getCategoryIDs();
      const flags = this._controller.getFlags();

      await this._setupEmulationAndProtocolConnection();

      this._renderStatusView(inspectedURL);

      const lighthouseResponse = await this._protocolService.startLighthouse(inspectedURL, categoryIDs, flags);

      if (lighthouseResponse && lighthouseResponse.fatal) {
        const error = new Error(lighthouseResponse.message);
        error.stack = lighthouseResponse.stack;
        throw error;
      }

      if (!lighthouseResponse)
        throw new Error('Auditing failed to produce a result');

      Host.userMetrics.actionTaken(Host.UserMetrics.Action.Audits2Finished);

      await this._resetEmulationAndProtocolConnection();
      this._buildReportUI(lighthouseResponse.lhr, lighthouseResponse.artifacts);
    } catch (err) {
      if (err instanceof Error)
        this._statusView.renderBugReport(err);
    }
  }

  async _cancelAudit() {
    this._statusView.updateStatus(ls`Cancelling`);
    await this._resetEmulationAndProtocolConnection();
    this._renderStartView();
  }

  async _setupEmulationAndProtocolConnection() {
    const flags = this._controller.getFlags();

    const emulationModel = self.singleton(Emulation.DeviceModeModel);
    this._emulationEnabledBefore = emulationModel.enabledSetting().get();
    this._emulationOutlineEnabledBefore = emulationModel.deviceOutlineSetting().get();
    emulationModel.toolbarControlsEnabledSetting().set(false);

    if (flags.disableDeviceEmulation) {
      emulationModel.enabledSetting().set(false);
      emulationModel.deviceOutlineSetting().set(false);
      emulationModel.emulate(Emulation.DeviceModeModel.Type.None, null, null);
    } else {
      emulationModel.enabledSetting().set(true);
      emulationModel.deviceOutlineSetting().set(true);

      for (const device of Emulation.EmulatedDevicesList.instance().standard()) {
        if (device.title === 'Nexus 5X')
          emulationModel.emulate(Emulation.DeviceModeModel.Type.Device, device, device.modes[0], 1);
      }
    }

    await this._protocolService.attach();
    this._isLHAttached = true;
  }

  async _resetEmulationAndProtocolConnection() {
    if (!this._isLHAttached)
      return;

    this._isLHAttached = false;
    await this._protocolService.detach();

    const emulationModel = self.singleton(Emulation.DeviceModeModel);
    emulationModel.enabledSetting().set(this._emulationEnabledBefore);
    emulationModel.deviceOutlineSetting().set(this._emulationOutlineEnabledBefore);
    emulationModel.toolbarControlsEnabledSetting().set(true);
    Emulation.InspectedPagePlaceholder.instance().update(true);

    const resourceTreeModel = SDK.targetManager.mainTarget().model(SDK.ResourceTreeModel);
    // reload to reset the page state
    const inspectedURL = await this._controller.getInspectedURL();
    await resourceTreeModel.navigate(inspectedURL);
  }
};
