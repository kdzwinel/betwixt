/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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

UI.Dialog = class extends UI.GlassPane {
  constructor() {
    super();
    this.registerRequiredCSS('ui/dialog.css');
    this.contentElement.tabIndex = 0;
    this.contentElement.addEventListener('focus', () => this.widget().focus(), false);
    this.contentElement.addEventListener('keydown', this._onKeyDown.bind(this), false);
    this.widget().setDefaultFocusedElement(this.contentElement);
    this.setPointerEventsBehavior(UI.GlassPane.PointerEventsBehavior.BlockedByGlassPane);
    this.setOutsideClickCallback(event => {
      this.hide();
      event.consume(true);
    });
    /** @type {!Map<!HTMLElement, number>} */
    this._tabIndexMap = new Map();
    /** @type {?UI.WidgetFocusRestorer} */
    this._focusRestorer = null;
    this._closeOnEscape = true;
  }

  /**
   * @return {boolean}
   */
  static hasInstance() {
    return !!UI.Dialog._instance;
  }

  /**
   * @override
   * @param {!Document|!Element=} where
   */
  show(where) {
    const document = /** @type {!Document} */ (
        where instanceof Document ? where : (where || UI.inspectorView.element).ownerDocument);
    if (UI.Dialog._instance)
      UI.Dialog._instance.hide();
    UI.Dialog._instance = this;
    this._disableTabIndexOnElements(document);
    super.show(document);
    this._focusRestorer = new UI.WidgetFocusRestorer(this.widget());
  }

  /**
   * @override
   */
  hide() {
    this._focusRestorer.restore();
    super.hide();
    this._restoreTabIndexOnElements();
    delete UI.Dialog._instance;
  }

  /**
   * @param {boolean} close
   */
  setCloseOnEscape(close) {
    this._closeOnEscape = close;
  }

  addCloseButton() {
    const closeButton = this.contentElement.createChild('div', 'dialog-close-button', 'dt-close-button');
    closeButton.gray = true;
    closeButton.addEventListener('click', () => this.hide(), false);
  }

  /**
   * @param {!Document} document
   */
  _disableTabIndexOnElements(document) {
    this._tabIndexMap.clear();
    for (let node = document; node; node = node.traverseNextNode(document)) {
      if (node instanceof HTMLElement) {
        const element = /** @type {!HTMLElement} */ (node);
        const tabIndex = element.tabIndex;
        if (tabIndex >= 0) {
          this._tabIndexMap.set(element, tabIndex);
          element.tabIndex = -1;
        }
      }
    }
  }

  _restoreTabIndexOnElements() {
    for (const element of this._tabIndexMap.keys())
      element.tabIndex = /** @type {number} */ (this._tabIndexMap.get(element));
    this._tabIndexMap.clear();
  }

  /**
   * @param {!Event} event
   */
  _onKeyDown(event) {
    if (this._closeOnEscape && event.keyCode === UI.KeyboardShortcut.Keys.Esc.code &&
        UI.KeyboardShortcut.hasNoModifiers(event)) {
      event.consume(true);
      this.hide();
    }
  }
};
