// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Protocol.OverlayDispatcher}
 */
SDK.OverlayModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._domModel = /** @type {!SDK.DOMModel} */ (target.model(SDK.DOMModel));

    target.registerOverlayDispatcher(this);
    this._overlayAgent = target.overlayAgent();
    this._overlayAgent.enable();
    this._overlayAgent.setShowViewportSizeOnResize(true);

    this._debuggerModel = target.model(SDK.DebuggerModel);
    if (this._debuggerModel) {
      Common.moduleSetting('disablePausedStateOverlay').addChangeListener(this._updatePausedInDebuggerMessage, this);
      this._debuggerModel.addEventListener(
          SDK.DebuggerModel.Events.DebuggerPaused, this._updatePausedInDebuggerMessage, this);
      this._debuggerModel.addEventListener(
          SDK.DebuggerModel.Events.DebuggerResumed, this._updatePausedInDebuggerMessage, this);
      // TODO(dgozman): we should get DebuggerResumed on navigations instead of listening to GlobalObjectCleared.
      this._debuggerModel.addEventListener(
          SDK.DebuggerModel.Events.GlobalObjectCleared, this._updatePausedInDebuggerMessage, this);
    }

    this._inspectModeEnabled = false;
    this._hideHighlightTimeout = null;
    this._defaultHighlighter = new SDK.OverlayModel.DefaultHighlighter(this);
    this._highlighter = this._defaultHighlighter;

    this._showPaintRectsSetting = Common.moduleSetting('showPaintRects');
    this._showPaintRectsSetting.addChangeListener(
        () => this._overlayAgent.setShowPaintRects(this._showPaintRectsSetting.get()));
    if (this._showPaintRectsSetting.get())
      this._overlayAgent.setShowPaintRects(true);

    this._showDebugBordersSetting = Common.moduleSetting('showDebugBorders');
    this._showDebugBordersSetting.addChangeListener(
        () => this._overlayAgent.setShowDebugBorders(this._showDebugBordersSetting.get()));
    if (this._showDebugBordersSetting.get())
      this._overlayAgent.setShowDebugBorders(true);

    this._showFPSCounterSetting = Common.moduleSetting('showFPSCounter');
    this._showFPSCounterSetting.addChangeListener(
        () => this._overlayAgent.setShowFPSCounter(this._showFPSCounterSetting.get()));
    if (this._showFPSCounterSetting.get())
      this._overlayAgent.setShowFPSCounter(true);

    this._showScrollBottleneckRectsSetting = Common.moduleSetting('showScrollBottleneckRects');
    this._showScrollBottleneckRectsSetting.addChangeListener(
        () => this._overlayAgent.setShowScrollBottleneckRects(this._showScrollBottleneckRectsSetting.get()));
    if (this._showScrollBottleneckRectsSetting.get())
      this._overlayAgent.setShowScrollBottleneckRects(true);

    this._showHitTestBordersSetting = Common.moduleSetting('showHitTestBorders');
    this._showHitTestBordersSetting.addChangeListener(
        () => this._overlayAgent.setShowHitTestBorders(this._showHitTestBordersSetting.get()));
    if (this._showHitTestBordersSetting.get())
      this._overlayAgent.setShowHitTestBorders(true);

    if (target.suspended())
      this._overlayAgent.setSuspended(true);
  }

  /**
   * @param {!SDK.RemoteObject} object
   */
  static highlightObjectAsDOMNode(object) {
    const domModel = object.runtimeModel().target().model(SDK.DOMModel);
    if (domModel)
      domModel.overlayModel().highlightDOMNode(undefined, undefined, undefined, object.objectId);
  }

  static hideDOMNodeHighlight() {
    for (const overlayModel of SDK.targetManager.models(SDK.OverlayModel))
      overlayModel._delayedHideHighlight(0);
  }

  static muteHighlight() {
    SDK.OverlayModel.hideDOMNodeHighlight();
    SDK.OverlayModel._highlightDisabled = true;
  }

  static unmuteHighlight() {
    SDK.OverlayModel._highlightDisabled = false;
  }

  /**
   * @override
   * @return {!Promise}
   */
  suspendModel() {
    return this._overlayAgent.setSuspended(true);
  }

  /**
   * @override
   * @return {!Promise}
   */
  resumeModel() {
    return this._overlayAgent.setSuspended(false);
  }

  setShowViewportSizeOnResize(show) {
    this._overlayAgent.setShowViewportSizeOnResize(show);
  }

  _updatePausedInDebuggerMessage() {
    const message = this._debuggerModel.isPaused() && !Common.moduleSetting('disablePausedStateOverlay').get() ?
        Common.UIString('Paused in debugger') :
        undefined;
    this._overlayAgent.setPausedInDebuggerMessage(message);
  }

  /**
   * @param {?SDK.OverlayModel.Highlighter} highlighter
   */
  setHighlighter(highlighter) {
    this._highlighter = highlighter || this._defaultHighlighter;
  }

  /**
   * @param {!Protocol.Overlay.InspectMode} mode
   * @return {!Promise}
   */
  async setInspectMode(mode) {
    await this._domModel.requestDocument();
    this._inspectModeEnabled = mode !== Protocol.Overlay.InspectMode.None;
    this.dispatchEventToListeners(SDK.OverlayModel.Events.InspectModeWillBeToggled, this);
    this._highlighter.setInspectMode(mode, this._buildHighlightConfig());
  }

  /**
   * @return {boolean}
   */
  inspectModeEnabled() {
    return this._inspectModeEnabled;
  }

  /**
   * @param {!Protocol.DOM.NodeId=} nodeId
   * @param {string=} mode
   * @param {!Protocol.DOM.BackendNodeId=} backendNodeId
   * @param {!Protocol.Runtime.RemoteObjectId=} objectId
   */
  highlightDOMNode(nodeId, mode, backendNodeId, objectId) {
    this.highlightDOMNodeWithConfig(nodeId, {mode: mode}, backendNodeId, objectId);
  }

  /**
   * @param {!Protocol.DOM.NodeId=} nodeId
   * @param {!{mode: (string|undefined), showInfo: (boolean|undefined), selectors: (string|undefined)}=} config
   * @param {!Protocol.DOM.BackendNodeId=} backendNodeId
   * @param {!Protocol.Runtime.RemoteObjectId=} objectId
   */
  highlightDOMNodeWithConfig(nodeId, config, backendNodeId, objectId) {
    if (SDK.OverlayModel._highlightDisabled)
      return;
    config = config || {mode: 'all', showInfo: undefined, selectors: undefined};
    if (this._hideHighlightTimeout) {
      clearTimeout(this._hideHighlightTimeout);
      this._hideHighlightTimeout = null;
    }
    const highlightConfig = this._buildHighlightConfig(config.mode);
    if (typeof config.showInfo !== 'undefined')
      highlightConfig.showInfo = config.showInfo;
    if (typeof config.selectors !== 'undefined')
      highlightConfig.selectorList = config.selectors;
    this._highlighter.highlightDOMNode(this._domModel.nodeForId(nodeId || 0), highlightConfig, backendNodeId, objectId);
  }

  /**
   * @param {!Protocol.DOM.NodeId} nodeId
   */
  highlightDOMNodeForTwoSeconds(nodeId) {
    this.highlightDOMNode(nodeId);
    this._delayedHideHighlight(2000);
  }

  /**
   * @param {number} delay
   */
  _delayedHideHighlight(delay) {
    if (this._hideHighlightTimeout === null)
      this._hideHighlightTimeout = setTimeout(() => this.highlightDOMNode(0), delay);
  }

  /**
   * @param {!Protocol.Page.FrameId} frameId
   */
  highlightFrame(frameId) {
    if (SDK.OverlayModel._highlightDisabled)
      return;
    this._highlighter.highlightFrame(frameId);
  }

  /**
   * @param {string=} mode
   * @return {!Protocol.Overlay.HighlightConfig}
   */
  _buildHighlightConfig(mode) {
    mode = mode || 'all';
    const showRulers = Common.moduleSetting('showMetricsRulers').get();
    const highlightConfig = {showInfo: mode === 'all', showRulers: showRulers, showExtensionLines: showRulers};
    if (mode === 'all' || mode === 'content')
      highlightConfig.contentColor = Common.Color.PageHighlight.Content.toProtocolRGBA();

    if (mode === 'all' || mode === 'padding')
      highlightConfig.paddingColor = Common.Color.PageHighlight.Padding.toProtocolRGBA();

    if (mode === 'all' || mode === 'border')
      highlightConfig.borderColor = Common.Color.PageHighlight.Border.toProtocolRGBA();

    if (mode === 'all' || mode === 'margin')
      highlightConfig.marginColor = Common.Color.PageHighlight.Margin.toProtocolRGBA();

    if (mode === 'all') {
      highlightConfig.eventTargetColor = Common.Color.PageHighlight.EventTarget.toProtocolRGBA();
      highlightConfig.shapeColor = Common.Color.PageHighlight.Shape.toProtocolRGBA();
      highlightConfig.shapeMarginColor = Common.Color.PageHighlight.ShapeMargin.toProtocolRGBA();
      highlightConfig.displayAsMaterial = true;
    }

    if (mode === 'all')
      highlightConfig.cssGridColor = Common.Color.PageHighlight.CssGrid.toProtocolRGBA();

    return highlightConfig;
  }

  /**
   * @override
   * @param {!Protocol.DOM.NodeId} nodeId
   */
  nodeHighlightRequested(nodeId) {
    const node = this._domModel.nodeForId(nodeId);
    if (node)
      this.dispatchEventToListeners(SDK.OverlayModel.Events.HighlightNodeRequested, node);
  }

  /**
   * @override
   * @param {!Protocol.DOM.BackendNodeId} backendNodeId
   */
  inspectNodeRequested(backendNodeId) {
    const deferredNode = new SDK.DeferredDOMNode(this.target(), backendNodeId);
    this.dispatchEventToListeners(SDK.OverlayModel.Events.InspectNodeRequested, deferredNode);
  }

  /**
   * @override
   * @param {!Protocol.Page.Viewport} viewport
   */
  screenshotRequested(viewport) {
    this.dispatchEventToListeners(SDK.OverlayModel.Events.ScreenshotRequested, viewport);
  }
};

SDK.SDKModel.register(SDK.OverlayModel, SDK.Target.Capability.DOM, true);

/** @enum {symbol} */
SDK.OverlayModel.Events = {
  InspectModeWillBeToggled: Symbol('InspectModeWillBeToggled'),
  HighlightNodeRequested: Symbol('HighlightNodeRequested'),
  InspectNodeRequested: Symbol('InspectNodeRequested'),
  ScreenshotRequested: Symbol('ScreenshotRequested'),
};

/**
 * @interface
 */
SDK.OverlayModel.Highlighter = function() {};

SDK.OverlayModel.Highlighter.prototype = {
  /**
   * @param {?SDK.DOMNode} node
   * @param {!Protocol.Overlay.HighlightConfig} config
   * @param {!Protocol.DOM.BackendNodeId=} backendNodeId
   * @param {!Protocol.Runtime.RemoteObjectId=} objectId
   */
  highlightDOMNode(node, config, backendNodeId, objectId) {},

  /**
   * @param {!Protocol.Overlay.InspectMode} mode
   * @param {!Protocol.Overlay.HighlightConfig} config
   * @return {!Promise}
   */
  setInspectMode(mode, config) {},

  /**
   * @param {!Protocol.Page.FrameId} frameId
   */
  highlightFrame(frameId) {}
};

/**
 * @implements {SDK.OverlayModel.Highlighter}
 */
SDK.OverlayModel.DefaultHighlighter = class {
  /**
   * @param {!SDK.OverlayModel} model
   */
  constructor(model) {
    this._model = model;
  }

  /**
   * @override
   * @param {?SDK.DOMNode} node
   * @param {!Protocol.Overlay.HighlightConfig} config
   * @param {!Protocol.DOM.BackendNodeId=} backendNodeId
   * @param {!Protocol.Runtime.RemoteObjectId=} objectId
   */
  highlightDOMNode(node, config, backendNodeId, objectId) {
    if (objectId || node || backendNodeId) {
      this._model._overlayAgent.highlightNode(
          config, (objectId || backendNodeId) ? undefined : node.id, backendNodeId, objectId);
    } else {
      this._model._overlayAgent.hideHighlight();
    }
  }

  /**
   * @override
   * @param {!Protocol.Overlay.InspectMode} mode
   * @param {!Protocol.Overlay.HighlightConfig} config
   * @return {!Promise}
   */
  setInspectMode(mode, config) {
    return this._model._overlayAgent.setInspectMode(mode, config);
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   */
  highlightFrame(frameId) {
    this._model._overlayAgent.highlightFrame(
        frameId, Common.Color.PageHighlight.Content.toProtocolRGBA(),
        Common.Color.PageHighlight.ContentOutline.toProtocolRGBA());
  }
};
