// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Protocol.PageDispatcher}
 */
SDK.ScreenCaptureModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._agent = target.pageAgent();
    /** @type {?function(string, !Protocol.Page.ScreencastFrameMetadata)} */
    this._onScreencastFrame = null;
    /** @type {?function(boolean)} */
    this._onScreencastVisibilityChanged = null;
    target.registerPageDispatcher(this);
  }

  /**
   * @param {string} format
   * @param {number} quality
   * @param {number|undefined} width
   * @param {number|undefined} height
   * @param {number|undefined} everyNthFrame
   * @param {function(string, !Protocol.Page.ScreencastFrameMetadata)} onFrame
   * @param {function(boolean)} onVisibilityChanged
   */
  startScreencast(format, quality, width, height, everyNthFrame, onFrame, onVisibilityChanged) {
    this._onScreencastFrame = onFrame;
    this._onScreencastVisibilityChanged = onVisibilityChanged;
    this._agent.startScreencast(format, quality, width, height, everyNthFrame);
  }

  stopScreencast() {
    this._onScreencastFrame = null;
    this._onScreencastVisibilityChanged = null;
    this._agent.stopScreencast();
  }

  /**
   * @param {string} format
   * @param {number} quality
   * @param {!Protocol.Page.Viewport=} clip
   * @return {!Promise<?string>}
   */
  captureScreenshot(format, quality, clip) {
    return this._agent.captureScreenshot(format, quality, clip, true);
  }

  /**
   * @return {!Promise<?{viewportX: number, viewportY: number, viewportScale: number, contentWidth: number, contentHeight: number}>}
   */
  async fetchLayoutMetrics() {
    const response = await this._agent.invoke_getLayoutMetrics({});
    if (response[Protocol.Error])
      return null;
    return {
      viewportX: response.visualViewport.pageX,
      viewportY: response.visualViewport.pageY,
      viewportScale: response.visualViewport.scale,
      contentWidth: response.contentSize.width,
      contentHeight: response.contentSize.height
    };
  }

  /**
   * @override
   * @param {string} data
   * @param {!Protocol.Page.ScreencastFrameMetadata} metadata
   * @param {number} sessionId
   */
  screencastFrame(data, metadata, sessionId) {
    this._agent.screencastFrameAck(sessionId);
    if (this._onScreencastFrame)
      this._onScreencastFrame.call(null, data, metadata);
  }

  /**
   * @override
   * @param {boolean} visible
   */
  screencastVisibilityChanged(visible) {
    if (this._onScreencastVisibilityChanged)
      this._onScreencastVisibilityChanged.call(null, visible);
  }

  /**
   * @override
   * @param {number} time
   */
  domContentEventFired(time) {
  }

  /**
   * @override
   * @param {number} time
   */
  loadEventFired(time) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   * @param {!Protocol.Network.LoaderId} loaderId
   * @param {string} name
   * @param {number} time
   */
  lifecycleEvent(frameId, loaderId, name, time) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   * @param {string} url
   */
  navigatedWithinDocument(frameId, url) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   * @param {!Protocol.Page.FrameId} parentFrameId
   */
  frameAttached(frameId, parentFrameId) {
  }

  /**
   * @override
   * @param {!Protocol.Page.Frame} frame
   */
  frameNavigated(frame) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   */
  frameDetached(frameId) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   */
  frameStartedLoading(frameId) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   */
  frameStoppedLoading(frameId) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   * @param {number} delay
   */
  frameScheduledNavigation(frameId, delay) {
  }

  /**
   * @override
   * @param {!Protocol.Page.FrameId} frameId
   */
  frameClearedScheduledNavigation(frameId) {
  }

  /**
   * @override
   */
  frameResized() {
  }

  /**
   * @override
   * @param {string} url
   * @param {string} message
   * @param {string} dialogType
   * @param {boolean} hasBrowserHandler
   * @param {string=} prompt
   */
  javascriptDialogOpening(url, message, dialogType, hasBrowserHandler, prompt) {
  }

  /**
   * @override
   * @param {boolean} result
   * @param {string} userInput
   */
  javascriptDialogClosed(result, userInput) {
  }

  /**
   * @override
   */
  interstitialShown() {
  }

  /**
   * @override
   */
  interstitialHidden() {
  }

  /**
   * @override
   * @param {string} url
   * @param {string} windowName
   * @param {!Array<string>} windowFeatures
   * @param {boolean} userGesture
   */
  windowOpen(url, windowName, windowFeatures, userGesture) {
  }

  /**
   * @override
   * @param {string} url
   * @param {string} data
   */
  compilationCacheProduced(url, data) {
  }
};

SDK.SDKModel.register(SDK.ScreenCaptureModel, SDK.Target.Capability.ScreenCapture, false);
