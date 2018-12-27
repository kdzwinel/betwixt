/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 * Copyright (C) 2012 Intel Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @implements {Timeline.TimelineController.Client}
 * @implements {Timeline.TimelineModeViewDelegate}
 * @unrestricted
 */
Timeline.TimelinePanel = class extends UI.Panel {
  constructor() {
    super('timeline');
    this.registerRequiredCSS('timeline/timelinePanel.css');
    this.element.addEventListener('contextmenu', this._contextMenu.bind(this), false);
    this._dropTarget = new UI.DropTarget(
        this.element, [UI.DropTarget.Type.File, UI.DropTarget.Type.URI],
        Common.UIString('Drop timeline file or URL here'), this._handleDrop.bind(this));

    /** @type {!Array<!UI.ToolbarItem>} */
    this._recordingOptionUIControls = [];
    this._state = Timeline.TimelinePanel.State.Idle;
    this._recordingPageReload = false;
    this._millisecondsToRecordAfterLoadEvent = 3000;
    this._toggleRecordAction =
        /** @type {!UI.Action }*/ (UI.actionRegistry.action('timeline.toggle-recording'));
    this._recordReloadAction =
        /** @type {!UI.Action }*/ (UI.actionRegistry.action('timeline.record-reload'));

    this._historyManager = new Timeline.TimelineHistoryManager();

    /** @type {?Timeline.PerformanceModel} */
    this._performanceModel = null;

    this._viewModeSetting =
        Common.settings.createSetting('timelineViewMode', Timeline.TimelinePanel.ViewMode.FlameChart);

    this._disableCaptureJSProfileSetting = Common.settings.createSetting('timelineDisableJSSampling', false);
    this._disableCaptureJSProfileSetting.setTitle(Common.UIString('Disable JavaScript samples'));
    this._captureLayersAndPicturesSetting = Common.settings.createSetting('timelineCaptureLayersAndPictures', false);
    this._captureLayersAndPicturesSetting.setTitle(Common.UIString('Enable advanced paint instrumentation (slow)'));

    this._showScreenshotsSetting = Common.settings.createSetting('timelineShowScreenshots', true);
    this._showScreenshotsSetting.setTitle(Common.UIString('Screenshots'));
    this._showScreenshotsSetting.addChangeListener(this._updateOverviewControls, this);

    this._showMemorySetting = Common.settings.createSetting('timelineShowMemory', false);
    this._showMemorySetting.setTitle(Common.UIString('Memory'));
    this._showMemorySetting.addChangeListener(this._onModeChanged, this);

    const timelineToolbarContainer = this.element.createChild('div', 'timeline-toolbar-container');
    this._panelToolbar = new UI.Toolbar('timeline-main-toolbar', timelineToolbarContainer);
    this._panelRightToolbar = new UI.Toolbar('', timelineToolbarContainer);
    this._createSettingsPane();
    this._updateShowSettingsToolbarButton();

    this._timelinePane = new UI.VBox();
    this._timelinePane.show(this.element);
    const topPaneElement = this._timelinePane.element.createChild('div', 'hbox');
    topPaneElement.id = 'timeline-overview-panel';

    // Create top overview component.
    this._overviewPane = new PerfUI.TimelineOverviewPane('timeline');
    this._overviewPane.addEventListener(
        PerfUI.TimelineOverviewPane.Events.WindowChanged, this._onOverviewWindowChanged.bind(this));
    this._overviewPane.show(topPaneElement);
    /** @type {!Array<!Timeline.TimelineEventOverview>} */
    this._overviewControls = [];

    this._statusPaneContainer = this._timelinePane.element.createChild('div', 'status-pane-container fill');

    this._createFileSelector();

    SDK.targetManager.addModelListener(
        SDK.ResourceTreeModel, SDK.ResourceTreeModel.Events.Load, this._loadEventFired, this);

    this._flameChart = new Timeline.TimelineFlameChartView(this);
    this._searchableView = new UI.SearchableView(this._flameChart);
    this._searchableView.setMinimumSize(0, 100);
    this._searchableView.element.classList.add('searchable-view');
    this._searchableView.show(this._timelinePane.element);
    this._flameChart.show(this._searchableView.element);
    this._flameChart.setSearchableView(this._searchableView);

    this._onModeChanged();
    this._populateToolbar();
    this._showLandingPage();
    this._updateTimelineControls();

    Extensions.extensionServer.addEventListener(
        Extensions.ExtensionServer.Events.TraceProviderAdded, this._appendExtensionsToToolbar, this);
    SDK.targetManager.addEventListener(SDK.TargetManager.Events.SuspendStateChanged, this._onSuspendStateChanged, this);
  }

  /**
   * @return {!Timeline.TimelinePanel}
   */
  static instance() {
    return /** @type {!Timeline.TimelinePanel} */ (self.runtime.sharedInstance(Timeline.TimelinePanel));
  }

  /**
   * @override
   * @return {?UI.SearchableView}
   */
  searchableView() {
    return this._searchableView;
  }

  /**
   * @override
   */
  wasShown() {
    UI.context.setFlavor(Timeline.TimelinePanel, this);
  }

  /**
   * @override
   */
  willHide() {
    UI.context.setFlavor(Timeline.TimelinePanel, null);
    this._historyManager.cancelIfShowing();
  }

  /**
   * @param {!Array.<!SDK.TracingManager.EventPayload>} events
   */
  loadFromEvents(events) {
    if (this._state !== Timeline.TimelinePanel.State.Idle)
      return;
    this._prepareToLoadTimeline();
    this._loader = Timeline.TimelineLoader.loadFromEvents(events, this);
  }

  /**
   * @param {!Common.Event} event
   */
  _onOverviewWindowChanged(event) {
    const left = event.data.startTime;
    const right = event.data.endTime;
    this._performanceModel.setWindow({left, right}, /* animate */ true);
  }

  /**
   * @param {!Common.Event} event
   */
  _onModelWindowChanged(event) {
    const window = /** @type {!Timeline.PerformanceModel.Window} */ (event.data.window);
    this._overviewPane.setWindowTimes(window.left, window.right);
  }

  /**
   * @param {!Timeline.TimelinePanel.State} state
   */
  _setState(state) {
    this._state = state;
    this._updateTimelineControls();
  }

  /**
   * @param {!Common.Setting} setting
   * @param {string} tooltip
   * @return {!UI.ToolbarItem}
   */
  _createSettingCheckbox(setting, tooltip) {
    const checkboxItem = new UI.ToolbarSettingCheckbox(setting, tooltip);
    this._recordingOptionUIControls.push(checkboxItem);
    return checkboxItem;
  }

  _populateToolbar() {
    // Record
    this._panelToolbar.appendToolbarItem(UI.Toolbar.createActionButton(this._toggleRecordAction));
    this._panelToolbar.appendToolbarItem(UI.Toolbar.createActionButton(this._recordReloadAction));
    this._clearButton = new UI.ToolbarButton(Common.UIString('Clear'), 'largeicon-clear');
    this._clearButton.addEventListener(UI.ToolbarButton.Events.Click, () => this._onClearButton());
    this._panelToolbar.appendToolbarItem(this._clearButton);

    // Load / Save
    this._loadButton = new UI.ToolbarButton(Common.UIString('Load profile...'), 'largeicon-load');
    this._loadButton.addEventListener(UI.ToolbarButton.Events.Click, () => this._selectFileToLoad());
    this._saveButton = new UI.ToolbarButton(Common.UIString('Save profile...'), 'largeicon-download');
    this._saveButton.addEventListener(UI.ToolbarButton.Events.Click, () => this._saveToFile());
    this._panelToolbar.appendSeparator();
    this._panelToolbar.appendToolbarItem(this._loadButton);
    this._panelToolbar.appendToolbarItem(this._saveButton);

    // History
    this._panelToolbar.appendSeparator();
    this._panelToolbar.appendToolbarItem(this._historyManager.button());
    this._panelToolbar.appendSeparator();

    // View
    this._panelToolbar.appendSeparator();
    this._showScreenshotsToolbarCheckbox =
        this._createSettingCheckbox(this._showScreenshotsSetting, Common.UIString('Capture screenshots'));
    this._panelToolbar.appendToolbarItem(this._showScreenshotsToolbarCheckbox);

    this._showMemoryToolbarCheckbox =
        this._createSettingCheckbox(this._showMemorySetting, Common.UIString('Show memory timeline'));
    this._panelToolbar.appendToolbarItem(this._showMemoryToolbarCheckbox);

    // GC
    this._panelToolbar.appendToolbarItem(UI.Toolbar.createActionButtonForId('components.collect-garbage'));

    // Settings
    this._panelRightToolbar.appendSeparator();
    this._panelRightToolbar.appendToolbarItem(this._showSettingsPaneButton);
  }

  _createSettingsPane() {
    this._showSettingsPaneSetting = Common.settings.createSetting('timelineShowSettingsToolbar', false);
    this._showSettingsPaneButton = new UI.ToolbarSettingToggle(
        this._showSettingsPaneSetting, 'largeicon-settings-gear', Common.UIString('Capture settings'));
    SDK.multitargetNetworkManager.addEventListener(
        SDK.MultitargetNetworkManager.Events.ConditionsChanged, this._updateShowSettingsToolbarButton, this);
    MobileThrottling.throttlingManager().addEventListener(
        MobileThrottling.ThrottlingManager.Events.RateChanged, this._updateShowSettingsToolbarButton, this);
    this._disableCaptureJSProfileSetting.addChangeListener(this._updateShowSettingsToolbarButton, this);
    this._captureLayersAndPicturesSetting.addChangeListener(this._updateShowSettingsToolbarButton, this);

    this._settingsPane = new UI.HBox();
    this._settingsPane.element.classList.add('timeline-settings-pane');
    this._settingsPane.show(this.element);

    const captureToolbar = new UI.Toolbar('', this._settingsPane.element);
    captureToolbar.element.classList.add('flex-auto');
    captureToolbar.makeVertical();
    captureToolbar.appendToolbarItem(this._createSettingCheckbox(
        this._disableCaptureJSProfileSetting,
        Common.UIString('Disables JavaScript sampling, reduces overhead when running against mobile devices')));
    captureToolbar.appendToolbarItem(this._createSettingCheckbox(
        this._captureLayersAndPicturesSetting,
        Common.UIString('Captures advanced paint instrumentation, introduces significant performance overhead')));

    const throttlingPane = new UI.VBox();
    throttlingPane.element.classList.add('flex-auto');
    throttlingPane.show(this._settingsPane.element);

    const networkThrottlingToolbar = new UI.Toolbar('', throttlingPane.element);
    networkThrottlingToolbar.appendText(Common.UIString('Network:'));
    this._networkThrottlingSelect = this._createNetworkConditionsSelect();
    networkThrottlingToolbar.appendToolbarItem(this._networkThrottlingSelect);

    const cpuThrottlingToolbar = new UI.Toolbar('', throttlingPane.element);
    cpuThrottlingToolbar.appendText(Common.UIString('CPU:'));
    this._cpuThrottlingSelect = MobileThrottling.throttlingManager().createCPUThrottlingSelector();
    cpuThrottlingToolbar.appendToolbarItem(this._cpuThrottlingSelect);

    this._showSettingsPaneSetting.addChangeListener(this._updateSettingsPaneVisibility.bind(this));
    this._updateSettingsPaneVisibility();
  }

  /**
    * @param {!Common.Event} event
    */
  _appendExtensionsToToolbar(event) {
    const provider = /** @type {!Extensions.ExtensionTraceProvider} */ (event.data);
    const setting = Timeline.TimelinePanel._settingForTraceProvider(provider);
    const checkbox = this._createSettingCheckbox(setting, provider.longDisplayName());
    this._panelToolbar.appendToolbarItem(checkbox);
  }

  /**
   * @param {!Extensions.ExtensionTraceProvider} traceProvider
   * @return {!Common.Setting<boolean>}
   */
  static _settingForTraceProvider(traceProvider) {
    let setting = traceProvider[Timeline.TimelinePanel._traceProviderSettingSymbol];
    if (!setting) {
      const providerId = traceProvider.persistentIdentifier();
      setting = Common.settings.createSetting(providerId, false);
      setting.setTitle(traceProvider.shortDisplayName());
      traceProvider[Timeline.TimelinePanel._traceProviderSettingSymbol] = setting;
    }
    return setting;
  }

  /**
   * @return {!UI.ToolbarComboBox}
   */
  _createNetworkConditionsSelect() {
    const toolbarItem = new UI.ToolbarComboBox(null);
    toolbarItem.setMaxWidth(140);
    MobileThrottling.throttlingManager().decorateSelectWithNetworkThrottling(toolbarItem.selectElement());
    return toolbarItem;
  }

  _prepareToLoadTimeline() {
    console.assert(this._state === Timeline.TimelinePanel.State.Idle);
    this._setState(Timeline.TimelinePanel.State.Loading);
    if (this._performanceModel) {
      this._performanceModel.dispose();
      this._performanceModel = null;
    }
  }

  _createFileSelector() {
    if (this._fileSelectorElement)
      this._fileSelectorElement.remove();
    this._fileSelectorElement = UI.createFileSelectorElement(this._loadFromFile.bind(this));
    this._timelinePane.element.appendChild(this._fileSelectorElement);
  }

  /**
   * @param {!Event} event
   */
  _contextMenu(event) {
    const contextMenu = new UI.ContextMenu(event);
    contextMenu.appendItemsAtLocation('timelineMenu');
    contextMenu.show();
  }

  async _saveToFile() {
    if (this._state !== Timeline.TimelinePanel.State.Idle)
      return;
    const performanceModel = this._performanceModel;
    if (!performanceModel)
      return;

    const now = new Date();
    const fileName = 'Profile-' + now.toISO8601Compact() + '.json';
    const stream = new Bindings.FileOutputStream();

    const accepted = await stream.open(fileName);
    if (!accepted)
      return;

    const error = await performanceModel.save(stream);
    if (!error)
      return;
    Common.console.error(
        Common.UIString('Failed to save timeline: %s (%s, %s)', error.message, error.name, error.code));
  }

  async _showHistory() {
    const model = await this._historyManager.showHistoryDropDown();
    if (model && model !== this._performanceModel)
      this._setModel(model);
  }

  /**
   * @param {number} direction
   * @return {boolean}
   */
  _navigateHistory(direction) {
    const model = this._historyManager.navigate(direction);
    if (model && model !== this._performanceModel)
      this._setModel(model);
    return true;
  }

  _selectFileToLoad() {
    this._fileSelectorElement.click();
  }

  /**
   * @param {!File} file
   */
  _loadFromFile(file) {
    if (this._state !== Timeline.TimelinePanel.State.Idle)
      return;
    this._prepareToLoadTimeline();
    this._loader = Timeline.TimelineLoader.loadFromFile(file, this);
    this._createFileSelector();
  }

  /**
   * @param {string} url
   */
  _loadFromURL(url) {
    if (this._state !== Timeline.TimelinePanel.State.Idle)
      return;
    this._prepareToLoadTimeline();
    this._loader = Timeline.TimelineLoader.loadFromURL(url, this);
  }

  _updateOverviewControls() {
    this._overviewControls = [];
    this._overviewControls.push(new Timeline.TimelineEventOverviewResponsiveness());
    if (Runtime.experiments.isEnabled('inputEventsOnTimelineOverview'))
      this._overviewControls.push(new Timeline.TimelineEventOverviewInput());
    this._overviewControls.push(new Timeline.TimelineEventOverviewFrames());
    this._overviewControls.push(new Timeline.TimelineEventOverviewCPUActivity());
    this._overviewControls.push(new Timeline.TimelineEventOverviewNetwork());
    if (this._showScreenshotsSetting.get() && this._performanceModel &&
        this._performanceModel.filmStripModel().frames().length)
      this._overviewControls.push(new Timeline.TimelineFilmStripOverview());
    if (this._showMemorySetting.get())
      this._overviewControls.push(new Timeline.TimelineEventOverviewMemory());
    for (const control of this._overviewControls)
      control.setModel(this._performanceModel);
    this._overviewPane.setOverviewControls(this._overviewControls);
  }

  _onModeChanged() {
    this._updateOverviewControls();
    this.doResize();
    this.select(null);
  }

  _updateSettingsPaneVisibility() {
    if (this._showSettingsPaneSetting.get())
      this._settingsPane.showWidget();
    else
      this._settingsPane.hideWidget();
  }

  _updateShowSettingsToolbarButton() {
    const messages = [];
    if (MobileThrottling.throttlingManager().cpuThrottlingRate() !== 1)
      messages.push(Common.UIString('- CPU throttling is enabled'));
    if (SDK.multitargetNetworkManager.isThrottling())
      messages.push(Common.UIString('- Network throttling is enabled'));
    if (this._captureLayersAndPicturesSetting.get())
      messages.push(Common.UIString('- Significant overhead due to paint instrumentation'));
    if (this._disableCaptureJSProfileSetting.get())
      messages.push(Common.UIString('- JavaScript sampling is disabled'));

    this._showSettingsPaneButton.setDefaultWithRedColor(messages.length);
    this._showSettingsPaneButton.setToggleWithRedColor(messages.length);

    if (messages.length) {
      const tooltipElement = createElement('div');
      messages.forEach(message => {
        tooltipElement.createChild('div').textContent = message;
      });
      this._showSettingsPaneButton.setTitle(tooltipElement);
    } else {
      this._showSettingsPaneButton.setTitle(Common.UIString('Capture settings'));
    }
  }

  /**
   * @param {boolean} enabled
   */
  _setUIControlsEnabled(enabled) {
    this._recordingOptionUIControls.forEach(control => control.setEnabled(enabled));
  }

  /**
   * @return {!Promise}
   */
  async _startRecording() {
    console.assert(!this._statusPane, 'Status pane is already opened.');
    this._setState(Timeline.TimelinePanel.State.StartPending);
    this._showRecordingStarted();

    const enabledTraceProviders = Extensions.extensionServer.traceProviders().filter(
        provider => Timeline.TimelinePanel._settingForTraceProvider(provider).get());

    const recordingOptions = {
      enableJSSampling: !this._disableCaptureJSProfileSetting.get(),
      capturePictures: this._captureLayersAndPicturesSetting.get(),
      captureFilmStrip: this._showScreenshotsSetting.get()
    };

    const mainTarget = /** @type {!SDK.Target} */ (SDK.targetManager.mainTarget());
    this._controller = new Timeline.TimelineController(mainTarget, this);
    this._setUIControlsEnabled(false);
    this._hideLandingPage();
    await this._controller.startRecording(recordingOptions, enabledTraceProviders);
    this._recordingStarted();
  }

  async _stopRecording() {
    if (this._statusPane) {
      this._statusPane.finish();
      this._statusPane.updateStatus(Common.UIString('Stopping timeline\u2026'));
      this._statusPane.updateProgressBar(Common.UIString('Received'), 0);
    }
    this._setState(Timeline.TimelinePanel.State.StopPending);
    this._performanceModel = await this._controller.stopRecording();
    this._setUIControlsEnabled(true);
    this._controller.dispose();
    this._controller = null;
  }

  _onSuspendStateChanged() {
    this._updateTimelineControls();
  }

  _updateTimelineControls() {
    const state = Timeline.TimelinePanel.State;
    this._toggleRecordAction.setToggled(this._state === state.Recording);
    this._toggleRecordAction.setEnabled(this._state === state.Recording || this._state === state.Idle);
    this._recordReloadAction.setEnabled(this._state === state.Idle);
    this._historyManager.setEnabled(this._state === state.Idle);
    this._clearButton.setEnabled(this._state === state.Idle);
    this._panelToolbar.setEnabled(this._state !== state.Loading);
    this._panelRightToolbar.setEnabled(this._state !== state.Loading);
    this._dropTarget.setEnabled(this._state === state.Idle);
    this._loadButton.setEnabled(this._state === state.Idle);
    this._saveButton.setEnabled(this._state === state.Idle && !!this._performanceModel);
  }

  _toggleRecording() {
    if (this._state === Timeline.TimelinePanel.State.Idle) {
      this._recordingPageReload = false;
      this._startRecording();
      Host.userMetrics.actionTaken(Host.UserMetrics.Action.TimelineStarted);
    } else if (this._state === Timeline.TimelinePanel.State.Recording) {
      this._stopRecording();
    }
  }

  _recordReload() {
    if (this._state !== Timeline.TimelinePanel.State.Idle)
      return;
    this._recordingPageReload = true;
    this._startRecording();
    Host.userMetrics.actionTaken(Host.UserMetrics.Action.TimelinePageReloadStarted);
  }

  _onClearButton() {
    this._historyManager.clear();
    this._clear();
  }

  _clear() {
    this._showLandingPage();
    this._reset();
  }

  _reset() {
    PerfUI.LineLevelProfile.instance().reset();
    this._setModel(null);
  }

  /**
   * @param {!Timeline.PerformanceModel} model
   */
  _applyFilters(model) {
    if (model.timelineModel().isGenericTrace() || Runtime.experiments.isEnabled('timelineShowAllEvents'))
      return;
    model.setFilters([Timeline.TimelineUIUtils.visibleEventsFilter(), new TimelineModel.ExcludeTopLevelFilter()]);
  }

  /**
   * @param {?Timeline.PerformanceModel} model
   */
  _setModel(model) {
    if (this._performanceModel) {
      this._performanceModel.removeEventListener(
          Timeline.PerformanceModel.Events.WindowChanged, this._onModelWindowChanged, this);
    }
    this._performanceModel = model;
    if (model)
      this._applyFilters(model);
    this._flameChart.setModel(model);

    this._updateOverviewControls();
    this._overviewPane.reset();
    if (model) {
      this._performanceModel.addEventListener(
          Timeline.PerformanceModel.Events.WindowChanged, this._onModelWindowChanged, this);
      this._overviewPane.setBounds(
          model.timelineModel().minimumRecordTime(), model.timelineModel().maximumRecordTime());
      for (const profile of model.timelineModel().cpuProfiles())
        PerfUI.LineLevelProfile.instance().appendCPUProfile(profile);
      this._setMarkers(model.timelineModel());
      this._flameChart.setSelection(null);
      this._overviewPane.setWindowTimes(model.window().left, model.window().right);
    }
    for (const control of this._overviewControls)
      control.setModel(model);
    if (this._flameChart)
      this._flameChart.resizeToPreferredHeights();
    this._updateTimelineControls();
  }

  _recordingStarted() {
    if (this._recordingPageReload) {
      const target = this._controller.mainTarget();
      const resourceModel = target.model(SDK.ResourceTreeModel);
      if (resourceModel)
        resourceModel.reloadPage();
    }
    this._reset();
    this._setState(Timeline.TimelinePanel.State.Recording);
    this._showRecordingStarted();
    this._statusPane.updateStatus(Common.UIString('Profiling\u2026'));
    this._statusPane.updateProgressBar(Common.UIString('Buffer usage'), 0);
    this._statusPane.startTimer();
    this._hideLandingPage();
  }

  /**
   * @override
   * @param {number} usage
   */
  recordingProgress(usage) {
    this._statusPane.updateProgressBar(Common.UIString('Buffer usage'), usage * 100);
  }

  _showLandingPage() {
    if (this._landingPage) {
      this._landingPage.show(this._statusPaneContainer);
      return;
    }

    /**
     * @param {string} tagName
     * @param {string} contents
     */
    function encloseWithTag(tagName, contents) {
      const e = createElement(tagName);
      e.textContent = contents;
      return e;
    }

    const learnMoreNode = UI.XLink.create(
        'https://developers.google.com/web/tools/chrome-devtools/evaluate-performance/',
        Common.UIString('Learn\xa0more'));

    const recordKey =
        encloseWithTag('b', UI.shortcutRegistry.shortcutDescriptorsForAction('timeline.toggle-recording')[0].name);
    const reloadKey =
        encloseWithTag('b', UI.shortcutRegistry.shortcutDescriptorsForAction('timeline.record-reload')[0].name);
    const navigateNode = encloseWithTag('b', Common.UIString('WASD'));

    this._landingPage = new UI.VBox();
    this._landingPage.contentElement.classList.add('timeline-landing-page', 'fill');
    const centered = this._landingPage.contentElement.createChild('div');

    const recordButton = UI.createInlineButton(UI.Toolbar.createActionButton(this._toggleRecordAction));
    const reloadButton = UI.createInlineButton(UI.Toolbar.createActionButtonForId('timeline.record-reload'));

    centered.createChild('p').appendChild(UI.formatLocalized(
        'Click the record button %s or hit %s to start a new recording.\n' +
            'Click the reload button %s or hit %s to record the page load.',
        [recordButton, recordKey, reloadButton, reloadKey]));

    centered.createChild('p').appendChild(UI.formatLocalized(
        'After recording, select an area of interest in the overview by dragging.\n' +
        'Then, zoom and pan the timeline with the mousewheel or %s keys.\n%s',
        [navigateNode, learnMoreNode]));

    this._landingPage.show(this._statusPaneContainer);
  }

  _hideLandingPage() {
    this._landingPage.detach();
  }

  /**
   * @override
   */
  loadingStarted() {
    this._hideLandingPage();

    if (this._statusPane)
      this._statusPane.hide();
    this._statusPane = new Timeline.TimelinePanel.StatusPane(false, this._cancelLoading.bind(this));
    this._statusPane.showPane(this._statusPaneContainer);
    this._statusPane.updateStatus(Common.UIString('Loading profile\u2026'));
    // FIXME: make loading from backend cancelable as well.
    if (!this._loader)
      this._statusPane.finish();
    this.loadingProgress(0);
  }

  /**
   * @override
   * @param {number=} progress
   */
  loadingProgress(progress) {
    if (typeof progress === 'number')
      this._statusPane.updateProgressBar(Common.UIString('Received'), progress * 100);
  }

  /**
   * @override
   */
  processingStarted() {
    this._statusPane.updateStatus(Common.UIString('Processing profile\u2026'));
  }

  /**
   * @override
   * @param {?SDK.TracingModel} tracingModel
   */
  loadingComplete(tracingModel) {
    delete this._loader;
    this._setState(Timeline.TimelinePanel.State.Idle);

    if (this._statusPane)
      this._statusPane.hide();
    delete this._statusPane;

    if (!tracingModel) {
      this._clear();
      return;
    }

    if (!this._performanceModel)
      this._performanceModel = new Timeline.PerformanceModel();
    this._performanceModel.setTracingModel(tracingModel);
    this._setModel(this._performanceModel);
    this._historyManager.addRecording(this._performanceModel);
  }

  _showRecordingStarted() {
    if (this._statusPane)
      return;
    this._statusPane = new Timeline.TimelinePanel.StatusPane(true, this._stopRecording.bind(this));
    this._statusPane.showPane(this._statusPaneContainer);
    this._statusPane.updateStatus(Common.UIString('Initializing profiler\u2026'));
  }

  _cancelLoading() {
    if (this._loader)
      this._loader.cancel();
  }

  /**
   * @param {!TimelineModel.TimelineModel} timelineModel
   */
  _setMarkers(timelineModel) {
    const markers = new Map();
    const recordTypes = TimelineModel.TimelineModel.RecordType;
    const zeroTime = timelineModel.minimumRecordTime();
    for (const event of timelineModel.timeMarkerEvents()) {
      if (event.name === recordTypes.TimeStamp || event.name === recordTypes.ConsoleTime)
        continue;
      markers.set(event.startTime, Timeline.TimelineUIUtils.createEventDivider(event, zeroTime));
    }
    this._overviewPane.setMarkers(markers);
  }

  /**
   * @param {!Common.Event} event
   */
  async _loadEventFired(event) {
    if (this._state !== Timeline.TimelinePanel.State.Recording || !this._recordingPageReload ||
        this._controller.mainTarget() !== event.data.resourceTreeModel.target())
      return;
    const controller = this._controller;
    await new Promise(r => setTimeout(r, this._millisecondsToRecordAfterLoadEvent));

    // Check if we're still in the same recording session.
    if (controller !== this._controller || this._state !== Timeline.TimelinePanel.State.Recording)
      return;
    this._stopRecording();
  }

  /**
   * @param {!Timeline.TimelineSelection} selection
   * @return {?TimelineModel.TimelineFrame}
   */
  _frameForSelection(selection) {
    switch (selection.type()) {
      case Timeline.TimelineSelection.Type.Frame:
        return /** @type {!TimelineModel.TimelineFrame} */ (selection.object());
      case Timeline.TimelineSelection.Type.Range:
        return null;
      case Timeline.TimelineSelection.Type.TraceEvent:
        return this._performanceModel.frameModel().frames(selection._endTime, selection._endTime)[0];
      default:
        console.assert(false, 'Should never be reached');
        return null;
    }
  }

  /**
   * @param {number} offset
   */
  _jumpToFrame(offset) {
    const currentFrame = this._selection && this._frameForSelection(this._selection);
    if (!currentFrame)
      return;
    const frames = this._performanceModel.frames();
    let index = frames.indexOf(currentFrame);
    console.assert(index >= 0, 'Can\'t find current frame in the frame list');
    index = Number.constrain(index + offset, 0, frames.length - 1);
    const frame = frames[index];
    this._revealTimeRange(frame.startTime, frame.endTime);
    this.select(Timeline.TimelineSelection.fromFrame(frame));
    return true;
  }

  /**
   * @override
   * @param {?Timeline.TimelineSelection} selection
   */
  select(selection) {
    this._selection = selection;
    this._flameChart.setSelection(selection);
  }

  /**
   * @override
   * @param {?Array<!SDK.TracingModel.Event>} events
   * @param {number} time
   */
  selectEntryAtTime(events, time) {
    if (!events)
      return;
    // Find best match, then backtrack to the first visible entry.
    for (let index = events.upperBound(time, (time, event) => time - event.startTime) - 1; index >= 0; --index) {
      const event = events[index];
      const endTime = event.endTime || event.startTime;
      if (SDK.TracingModel.isTopLevelEvent(event) && endTime < time)
        break;
      if (this._performanceModel.isVisible(event) && endTime >= time) {
        this.select(Timeline.TimelineSelection.fromTraceEvent(event));
        return;
      }
    }
    this.select(null);
  }

  /**
   * @override
   * @param {?SDK.TracingModel.Event} event
   */
  highlightEvent(event) {
    this._flameChart.highlightEvent(event);
  }

  /**
   * @param {number} startTime
   * @param {number} endTime
   */
  _revealTimeRange(startTime, endTime) {
    const window = this._performanceModel.window();
    let offset = 0;
    if (window.right < endTime)
      offset = endTime - window.right;
    else if (window.left > startTime)
      offset = startTime - window.left;
    this._performanceModel.setWindow({left: window.left + offset, right: window.right + offset}, /* animate */ true);
  }

  /**
   * @param {!DataTransfer} dataTransfer
   */
  _handleDrop(dataTransfer) {
    const items = dataTransfer.items;
    if (!items.length)
      return;
    const item = items[0];
    if (item.kind === 'string') {
      const url = dataTransfer.getData('text/uri-list');
      if (new Common.ParsedURL(url).isValid)
        this._loadFromURL(url);
    } else if (item.kind === 'file') {
      const entry = items[0].webkitGetAsEntry();
      if (!entry.isFile)
        return;
      entry.file(this._loadFromFile.bind(this));
    }
  }
};

/**
 * @enum {symbol}
 */
Timeline.TimelinePanel.State = {
  Idle: Symbol('Idle'),
  StartPending: Symbol('StartPending'),
  Recording: Symbol('Recording'),
  StopPending: Symbol('StopPending'),
  Loading: Symbol('Loading')
};

/**
 * @enum {string}
 */
Timeline.TimelinePanel.ViewMode = {
  FlameChart: 'FlameChart',
  BottomUp: 'BottomUp',
  CallTree: 'CallTree',
  EventLog: 'EventLog'
};

// Define row and header height, should be in sync with styles for timeline graphs.
Timeline.TimelinePanel.rowHeight = 18;
Timeline.TimelinePanel.headerHeight = 20;

/** @typedef {{selection: ?Timeline.TimelineSelection, windowLeftTime: number, windowRightTime: number}} */
Timeline.TimelinePanel.ModelSelectionData;

Timeline.TimelineSelection = class {
  /**
   * @param {!Timeline.TimelineSelection.Type} type
   * @param {number} startTime
   * @param {number} endTime
   * @param {!Object=} object
   */
  constructor(type, startTime, endTime, object) {
    this._type = type;
    this._startTime = startTime;
    this._endTime = endTime;
    this._object = object || null;
  }

  /**
   * @param {!TimelineModel.TimelineFrame} frame
   * @return {!Timeline.TimelineSelection}
   */
  static fromFrame(frame) {
    return new Timeline.TimelineSelection(Timeline.TimelineSelection.Type.Frame, frame.startTime, frame.endTime, frame);
  }

  /**
   * @param {!TimelineModel.TimelineModel.NetworkRequest} request
   * @return {!Timeline.TimelineSelection}
   */
  static fromNetworkRequest(request) {
    return new Timeline.TimelineSelection(
        Timeline.TimelineSelection.Type.NetworkRequest, request.startTime, request.endTime || request.startTime,
        request);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {!Timeline.TimelineSelection}
   */
  static fromTraceEvent(event) {
    return new Timeline.TimelineSelection(
        Timeline.TimelineSelection.Type.TraceEvent, event.startTime, event.endTime || (event.startTime + 1), event);
  }

  /**
   * @param {number} startTime
   * @param {number} endTime
   * @return {!Timeline.TimelineSelection}
   */
  static fromRange(startTime, endTime) {
    return new Timeline.TimelineSelection(Timeline.TimelineSelection.Type.Range, startTime, endTime);
  }

  /**
   * @return {!Timeline.TimelineSelection.Type}
   */
  type() {
    return this._type;
  }

  /**
   * @return {?Object}
   */
  object() {
    return this._object;
  }

  /**
   * @return {number}
   */
  startTime() {
    return this._startTime;
  }

  /**
   * @return {number}
   */
  endTime() {
    return this._endTime;
  }
};

/**
 * @enum {string}
 */
Timeline.TimelineSelection.Type = {
  Frame: 'Frame',
  NetworkRequest: 'NetworkRequest',
  TraceEvent: 'TraceEvent',
  Range: 'Range'
};

/**
 * @interface
 */
Timeline.TimelineModeViewDelegate = function() {};

Timeline.TimelineModeViewDelegate.prototype = {
  /**
   * @param {?Timeline.TimelineSelection} selection
   */
  select(selection) {},

  /**
   * @param {?Array<!SDK.TracingModel.Event>} events
   * @param {number} time
   */
  selectEntryAtTime(events, time) {},

  /**
   * @param {?SDK.TracingModel.Event} event
   */
  highlightEvent(event) {},
};

/**
 * @unrestricted
 */
Timeline.TimelinePanel.StatusPane = class extends UI.VBox {
  /**
   * @param {boolean} showTimer
   * @param {function()} stopCallback
   */
  constructor(showTimer, stopCallback) {
    super(true);
    this.registerRequiredCSS('timeline/timelineStatusDialog.css');
    this.contentElement.classList.add('timeline-status-dialog');

    const statusLine = this.contentElement.createChild('div', 'status-dialog-line status');
    statusLine.createChild('div', 'label').textContent = Common.UIString('Status');
    this._status = statusLine.createChild('div', 'content');

    if (showTimer) {
      const timeLine = this.contentElement.createChild('div', 'status-dialog-line time');
      timeLine.createChild('div', 'label').textContent = Common.UIString('Time');
      this._time = timeLine.createChild('div', 'content');
    }
    const progressLine = this.contentElement.createChild('div', 'status-dialog-line progress');
    this._progressLabel = progressLine.createChild('div', 'label');
    this._progressBar = progressLine.createChild('div', 'indicator-container').createChild('div', 'indicator');

    this._stopButton = UI.createTextButton(Common.UIString('Stop'), stopCallback, '', true);
    this.contentElement.createChild('div', 'stop-button').appendChild(this._stopButton);
  }

  finish() {
    this._stopTimer();
    this._stopButton.disabled = true;
  }

  hide() {
    this.element.parentNode.classList.remove('tinted');
    this.element.remove();
  }

  /**
   * @param {!Element} parent
   */
  showPane(parent) {
    this.show(parent);
    parent.classList.add('tinted');
    this._stopButton.focus();
  }

  /**
   * @param {string} text
   */
  updateStatus(text) {
    this._status.textContent = text;
  }

  /**
   * @param {string} activity
   * @param {number} percent
   */
  updateProgressBar(activity, percent) {
    this._progressLabel.textContent = activity;
    this._progressBar.style.width = percent.toFixed(1) + '%';
    this._updateTimer();
  }

  startTimer() {
    this._startTime = Date.now();
    this._timeUpdateTimer = setInterval(this._updateTimer.bind(this, false), 1000);
    this._updateTimer();
  }

  _stopTimer() {
    if (!this._timeUpdateTimer)
      return;
    clearInterval(this._timeUpdateTimer);
    this._updateTimer(true);
    delete this._timeUpdateTimer;
  }

  /**
   * @param {boolean=} precise
   */
  _updateTimer(precise) {
    if (!this._timeUpdateTimer)
      return;
    const elapsed = (Date.now() - this._startTime) / 1000;
    this._time.textContent = Common.UIString('%s\xa0sec', elapsed.toFixed(precise ? 1 : 0));
  }
};


/**
 * @implements {Common.QueryParamHandler}
 * @unrestricted
 */
Timeline.LoadTimelineHandler = class {
  /**
   * @override
   * @param {string} value
   */
  handleQueryParam(value) {
    UI.viewManager.showView('timeline').then(() => {
      Timeline.TimelinePanel.instance()._loadFromURL(window.decodeURIComponent(value));
    });
  }
};

/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
Timeline.TimelinePanel.ActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    const panel = UI.context.flavor(Timeline.TimelinePanel);
    console.assert(panel && panel instanceof Timeline.TimelinePanel);
    switch (actionId) {
      case 'timeline.toggle-recording':
        panel._toggleRecording();
        return true;
      case 'timeline.record-reload':
        panel._recordReload();
        return true;
      case 'timeline.save-to-file':
        panel._saveToFile();
        return true;
      case 'timeline.load-from-file':
        panel._selectFileToLoad();
        return true;
      case 'timeline.jump-to-previous-frame':
        panel._jumpToFrame(-1);
        return true;
      case 'timeline.jump-to-next-frame':
        panel._jumpToFrame(1);
        return true;
      case 'timeline.show-history':
        panel._showHistory();
        return true;
      case 'timeline.previous-recording':
        panel._navigateHistory(1);
        return true;
      case 'timeline.next-recording':
        panel._navigateHistory(-1);
        return true;
    }
    return false;
  }
};

Timeline.TimelinePanel._traceProviderSettingSymbol = Symbol('traceProviderSetting');
