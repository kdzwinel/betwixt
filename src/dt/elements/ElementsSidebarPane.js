// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Elements.ElementsSidebarPane = class extends UI.VBox {
  constructor() {
    super(true);
    this.element.classList.add('flex-none');
    this._computedStyleModel = new Elements.ComputedStyleModel();
    this._computedStyleModel.addEventListener(
        Elements.ComputedStyleModel.Events.ComputedStyleChanged, this.onCSSModelChanged, this);

    this._updateThrottler = new Common.Throttler(100);
    this._updateWhenVisible = false;
  }

  /**
   * @return {?SDK.DOMNode}
   */
  node() {
    return this._computedStyleModel.node();
  }

  /**
   * @return {?SDK.CSSModel}
   */
  cssModel() {
    return this._computedStyleModel.cssModel();
  }

  /**
   * @protected
   * @return {!Promise.<?>}
   */
  doUpdate() {
    return Promise.resolve();
  }

  update() {
    this._updateWhenVisible = !this.isShowing();
    if (this._updateWhenVisible)
      return;
    this._updateThrottler.schedule(innerUpdate.bind(this));

    /**
     * @return {!Promise.<?>}
     * @this {Elements.ElementsSidebarPane}
     */
    function innerUpdate() {
      return this.isShowing() ? this.doUpdate() : Promise.resolve();
    }
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    if (this._updateWhenVisible)
      this.update();
  }

  /**
   * @param {!Common.Event} event
   */
  onCSSModelChanged(event) {
  }
};
