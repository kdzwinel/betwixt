/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @unrestricted
 */
Network.RequestCookiesView = class extends UI.VBox {
  /**
   * @param {!SDK.NetworkRequest} request
   */
  constructor(request) {
    super();
    this.registerRequiredCSS('network/requestCookiesView.css');
    this.element.classList.add('request-cookies-view');

    this._request = request;
  }

  /**
   * @override
   */
  wasShown() {
    this._request.addEventListener(SDK.NetworkRequest.Events.RequestHeadersChanged, this._refreshCookies, this);
    this._request.addEventListener(SDK.NetworkRequest.Events.ResponseHeadersChanged, this._refreshCookies, this);

    if (!this._gotCookies) {
      if (!this._emptyWidget) {
        this._emptyWidget = new UI.EmptyWidget(Common.UIString('This request has no cookies.'));
        this._emptyWidget.show(this.element);
      }
      return;
    }

    if (!this._cookiesTable)
      this._buildCookiesTable();
  }

  /**
   * @override
   */
  willHide() {
    this._request.removeEventListener(SDK.NetworkRequest.Events.RequestHeadersChanged, this._refreshCookies, this);
    this._request.removeEventListener(SDK.NetworkRequest.Events.ResponseHeadersChanged, this._refreshCookies, this);
  }

  get _gotCookies() {
    return (this._request.requestCookies && this._request.requestCookies.length) ||
        (this._request.responseCookies && this._request.responseCookies.length);
  }

  _buildCookiesTable() {
    this.detachChildWidgets();

    this._cookiesTable = new CookieTable.CookiesTable();
    this._cookiesTable.setCookieFolders([
      {folderName: Common.UIString('Request Cookies'), cookies: this._request.requestCookies},
      {folderName: Common.UIString('Response Cookies'), cookies: this._request.responseCookies}
    ]);
    this._cookiesTable.show(this.element);
  }

  _refreshCookies() {
    delete this._cookiesTable;
    if (!this._gotCookies || !this.isShowing())
      return;
    this._buildCookiesTable();
  }
};
