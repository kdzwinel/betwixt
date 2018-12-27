/*
 * Copyright (C) 2009 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

Resources.CookieItemsView = class extends Resources.StorageItemsView {
  /**
   * @param {!SDK.CookieModel} model
   * @param {string} cookieDomain
   */
  constructor(model, cookieDomain) {
    super(Common.UIString('Cookies'), 'cookiesPanel');

    this.element.classList.add('storage-view');

    this._model = model;
    this._cookieDomain = cookieDomain;

    this._totalSize = 0;
    /** @type {?CookieTable.CookiesTable} */
    this._cookiesTable = null;
    this._refreshThrottler = new Common.Throttler(300);
    /** @type {!Array<!Common.EventTarget.EventDescriptor>} */
    this._eventDescriptors = [];
    this.setCookiesDomain(model, cookieDomain);
  }

  /**
   * @param {!SDK.CookieModel} model
   * @param {string} domain
   */
  setCookiesDomain(model, domain) {
    this._model = model;
    this._cookieDomain = domain;
    this.refreshItems();
    Common.EventTarget.removeEventListeners(this._eventDescriptors);
    const networkManager = model.target().model(SDK.NetworkManager);
    this._eventDescriptors =
        [networkManager.addEventListener(SDK.NetworkManager.Events.ResponseReceived, this._onResponseReceived, this)];
  }

  /**
   * @param {!SDK.Cookie} newCookie
   * @param {?SDK.Cookie} oldCookie
   * @return {!Promise<boolean>}
   */
  _saveCookie(newCookie, oldCookie) {
    if (!this._model)
      return Promise.resolve(false);
    if (oldCookie && (newCookie.name() !== oldCookie.name() || newCookie.url() !== oldCookie.url()))
      this._model.deleteCookie(oldCookie);
    return this._model.saveCookie(newCookie);
  }

  /**
   * @param {!SDK.Cookie} cookie
   * @param {function()} callback
   */
  _deleteCookie(cookie, callback) {
    this._model.deleteCookie(cookie, callback);
  }

  /**
   * @param {!Array<!SDK.Cookie>} allCookies
   */
  _updateWithCookies(allCookies) {
    this._totalSize = allCookies.reduce((size, cookie) => size + cookie.size(), 0);

    if (!this._cookiesTable) {
      this._cookiesTable = new CookieTable.CookiesTable(
          this._saveCookie.bind(this),
          this.refreshItems.bind(this),
          () => this.setCanDeleteSelected(!!this._cookiesTable.selectedCookie()),
          this._deleteCookie.bind(this));
    }

    const parsedURL = this._cookieDomain.asParsedURL();
    const host = parsedURL ? parsedURL.host : '';
    this._cookiesTable.setCookieDomain(host);

    const shownCookies = this.filter(allCookies, cookie => `${cookie.name()} ${cookie.value()} ${cookie.domain()}`);
    this._cookiesTable.setCookies(shownCookies);
    this._cookiesTable.show(this.element);
    this.setCanFilter(true);
    this.setCanDeleteAll(true);
    this.setCanDeleteSelected(!!this._cookiesTable.selectedCookie());
  }

  /**
   * @override
   */
  deleteAllItems() {
    this._model.clear(this._cookieDomain, () => this.refreshItems());
  }

  /**
   * @override
   */
  deleteSelectedItem() {
    const selectedCookie = this._cookiesTable.selectedCookie();
    if (selectedCookie)
      this._model.deleteCookie(selectedCookie, () => this.refreshItems());
  }

  /**
   * @override
   */
  refreshItems() {
    this._model.getCookiesForDomain(this._cookieDomain).then(this._updateWithCookies.bind(this));
  }

  _onResponseReceived() {
    this._refreshThrottler.schedule(() => Promise.resolve(this.refreshItems()));
  }
};
