// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {Common.App}
 * @unrestricted
 */
Emulation.AdvancedApp = class {
  constructor() {
    Components.dockController.addEventListener(
        Components.DockController.Events.BeforeDockSideChanged, this._openToolboxWindow, this);
  }

  /**
   * @return {!Emulation.AdvancedApp}
   */
  static _instance() {
    if (!Emulation.AdvancedApp._appInstance)
      Emulation.AdvancedApp._appInstance = new Emulation.AdvancedApp();
    return Emulation.AdvancedApp._appInstance;
  }

  /**
   * @override
   * @param {!Document} document
   */
  presentUI(document) {
    const rootView = new UI.RootView();

    this._rootSplitWidget = new UI.SplitWidget(false, true, 'InspectorView.splitViewState', 555, 300, true);
    this._rootSplitWidget.show(rootView.element);
    this._rootSplitWidget.setSidebarWidget(UI.inspectorView);
    this._rootSplitWidget.setDefaultFocusedChild(UI.inspectorView);
    UI.inspectorView.setOwnerSplit(this._rootSplitWidget);

    this._inspectedPagePlaceholder = Emulation.InspectedPagePlaceholder.instance();
    this._inspectedPagePlaceholder.addEventListener(
        Emulation.InspectedPagePlaceholder.Events.Update, this._onSetInspectedPageBounds.bind(this), this);
    this._deviceModeView = new Emulation.DeviceModeWrapper(this._inspectedPagePlaceholder);

    Components.dockController.addEventListener(
        Components.DockController.Events.BeforeDockSideChanged, this._onBeforeDockSideChange, this);
    Components.dockController.addEventListener(
        Components.DockController.Events.DockSideChanged, this._onDockSideChange, this);
    Components.dockController.addEventListener(
        Components.DockController.Events.AfterDockSideChanged, this._onAfterDockSideChange, this);
    this._onDockSideChange();

    console.timeStamp('AdvancedApp.attachToBody');
    rootView.attachToDocument(document);
    rootView.focus();
    this._inspectedPagePlaceholder.update();
  }

  /**
   * @param {!Common.Event} event
   */
  _openToolboxWindow(event) {
    if (/** @type {string} */ (event.data.to) !== Components.DockController.State.Undocked)
      return;

    if (this._toolboxWindow)
      return;

    const url = window.location.href.replace('devtools_app.html', 'toolbox.html');
    this._toolboxWindow = window.open(url, undefined);
  }

  /**
   * @param {!Document} toolboxDocument
   */
  toolboxLoaded(toolboxDocument) {
    UI.initializeUIUtils(toolboxDocument, Common.settings.createSetting('uiTheme', 'default'));
    UI.installComponentRootStyles(/** @type {!Element} */ (toolboxDocument.body));
    UI.ContextMenu.installHandler(toolboxDocument);
    UI.Tooltip.installHandler(toolboxDocument);

    this._toolboxRootView = new UI.RootView();
    this._toolboxRootView.attachToDocument(toolboxDocument);

    this._updateDeviceModeView();
  }

  _updateDeviceModeView() {
    if (this._isDocked())
      this._rootSplitWidget.setMainWidget(this._deviceModeView);
    else if (this._toolboxRootView)
      this._deviceModeView.show(this._toolboxRootView.element);
  }

  /**
   * @param {!Common.Event} event
   */
  _onBeforeDockSideChange(event) {
    if (/** @type {string} */ (event.data.to) === Components.DockController.State.Undocked && this._toolboxRootView) {
      // Hide inspectorView and force layout to mimic the undocked state.
      this._rootSplitWidget.hideSidebar();
      this._inspectedPagePlaceholder.update();
    }

    this._changingDockSide = true;
  }

  /**
   * @param {!Common.Event=} event
   */
  _onDockSideChange(event) {
    this._updateDeviceModeView();

    const toDockSide = event ? /** @type {string} */ (event.data.to) : Components.dockController.dockSide();
    if (toDockSide === Components.DockController.State.Undocked) {
      this._updateForUndocked();
    } else if (
        this._toolboxRootView && event &&
        /** @type {string} */ (event.data.from) === Components.DockController.State.Undocked) {
      // Don't update yet for smooth transition.
      this._rootSplitWidget.hideSidebar();
    } else {
      this._updateForDocked(toDockSide);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _onAfterDockSideChange(event) {
    // We may get here on the first dock side change while loading without BeforeDockSideChange.
    if (!this._changingDockSide)
      return;
    if (/** @type {string} */ (event.data.from) === Components.DockController.State.Undocked) {
      // Restore docked layout in case of smooth transition.
      this._updateForDocked(/** @type {string} */ (event.data.to));
    }
    this._changingDockSide = false;
    this._inspectedPagePlaceholder.update();
  }

  /**
   * @param {string} dockSide
   */
  _updateForDocked(dockSide) {
    this._rootSplitWidget.resizerElement().style.transform =
        dockSide === Components.DockController.State.DockedToRight ?
        'translateX(2px)' :
        dockSide === Components.DockController.State.DockedToLeft ? 'translateX(-2px)' : '';
    this._rootSplitWidget.setVertical(
        dockSide === Components.DockController.State.DockedToRight ||
        dockSide === Components.DockController.State.DockedToLeft);
    this._rootSplitWidget.setSecondIsSidebar(
        dockSide === Components.DockController.State.DockedToRight ||
        dockSide === Components.DockController.State.DockedToBottom);
    this._rootSplitWidget.toggleResizer(this._rootSplitWidget.resizerElement(), true);
    this._rootSplitWidget.toggleResizer(
        UI.inspectorView.topResizerElement(), dockSide === Components.DockController.State.DockedToBottom);
    this._rootSplitWidget.showBoth();
  }

  _updateForUndocked() {
    this._rootSplitWidget.toggleResizer(this._rootSplitWidget.resizerElement(), false);
    this._rootSplitWidget.toggleResizer(UI.inspectorView.topResizerElement(), false);
    this._rootSplitWidget.hideMain();
  }

  _isDocked() {
    return Components.dockController.dockSide() !== Components.DockController.State.Undocked;
  }

  /**
   * @param {!Common.Event} event
   */
  _onSetInspectedPageBounds(event) {
    if (this._changingDockSide)
      return;
    const window = this._inspectedPagePlaceholder.element.window();
    if (!window.innerWidth || !window.innerHeight)
      return;
    if (!this._inspectedPagePlaceholder.isShowing())
      return;
    const bounds = /** @type {{x: number, y: number, width: number, height: number}} */ (event.data);
    console.timeStamp('AdvancedApp.setInspectedPageBounds');
    InspectorFrontendHost.setInspectedPageBounds(bounds);
  }
};

/** @type {!Emulation.AdvancedApp} */
Emulation.AdvancedApp._appInstance;


/**
 * @implements {Common.AppProvider}
 * @unrestricted
 */
Emulation.AdvancedAppProvider = class {
  /**
   * @override
   * @return {!Common.App}
   */
  createApp() {
    return Emulation.AdvancedApp._instance();
  }
};
