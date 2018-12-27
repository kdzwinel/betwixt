// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @extends {UI.XElement}
 */
UI.XLink = class extends UI.XElement {
  /**
   * @param {string} url
   * @param {string=} linkText
   * @param {string=} className
   * @param {boolean=} preventClick
   * @return {!Element}
   */
  static create(url, linkText, className, preventClick) {
    if (!linkText)
      linkText = url;
    className = className || '';
    // clang-format off
    // TODO(dgozman): migrate css from 'devtools-link' to 'x-link'.
    return UI.html`
        <x-link href='${url}' class='${className} devtools-link' ${preventClick ? 'no-click' : ''}
        >${linkText.trimMiddle(UI.MaxLengthForDisplayedURLs)}</x-link>`;
    // clang-format on
  }

  constructor() {
    super();

    this.style.setProperty('display', 'inline');
    UI.ARIAUtils.markAsLink(this);
    this.tabIndex = 0;
    this.setAttribute('target', '_blank');

    /** @type {?string} */
    this._href = null;
    this._clickable = true;

    this._onClick = event => {
      event.consume(true);
      InspectorFrontendHost.openInNewTab(/** @type {string} */ (this._href));
    };
    this._onKeyDown = event => {
      if (event.key !== ' ' && !isEnterKey(event))
        return;
      event.consume(true);
      InspectorFrontendHost.openInNewTab(/** @type {string} */ (this._href));
    };
  }

  /**
   * @return {!Array<string>}
   */
  static get observedAttributes() {
    // TODO(dgozman): should be super.observedAttributes, but it does not compile.
    return UI.XElement.observedAttributes.concat(['href', 'no-click']);
  }

  /**
   * @param {string} attr
   * @param {?string} oldValue
   * @param {?string} newValue
   * @override
   */
  attributeChangedCallback(attr, oldValue, newValue) {
    if (attr === 'no-click') {
      this._clickable = !newValue;
      this._updateClick();
      return;
    }

    if (attr === 'href') {
      let href = newValue;
      if (newValue.trim().toLowerCase().startsWith('javascript:'))
        href = null;
      if (Common.ParsedURL.isRelativeURL(newValue))
        href = null;

      this._href = href;
      this.title = newValue;
      this._updateClick();
      return;
    }

    super.attributeChangedCallback(attr, oldValue, newValue);
  }

  _updateClick() {
    if (this._href !== null && this._clickable) {
      this.addEventListener('click', this._onClick, false);
      this.addEventListener('keydown', this._onKeyDown, false);
      this.style.setProperty('cursor', 'pointer');
    } else {
      this.removeEventListener('click', this._onClick, false);
      this.removeEventListener('keydown', this._onKeyDown, false);
      this.style.removeProperty('cursor');
    }
  }
};

/**
 * @implements {UI.ContextMenu.Provider}
 */
UI.XLink.ContextMenuProvider = class {
  /**
   * @override
   * @param {!Event} event
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Object} target
   */
  appendApplicableItems(event, contextMenu, target) {
    let targetNode = /** @type {!Node} */ (target);
    while (targetNode && !(targetNode instanceof UI.XLink))
      targetNode = targetNode.parentNodeOrShadowHost();
    if (!targetNode || !targetNode._href)
      return;
    contextMenu.revealSection().appendItem(
        UI.openLinkExternallyLabel(), () => InspectorFrontendHost.openInNewTab(targetNode._href));
    contextMenu.revealSection().appendItem(
        UI.copyLinkAddressLabel(), () => InspectorFrontendHost.copyText(targetNode._href));
  }
};

self.customElements.define('x-link', UI.XLink);
