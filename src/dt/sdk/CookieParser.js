/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
// Ideally, we would rely on platform support for parsing a cookie, since
// this would save us from any potential inconsistency. However, exposing
// platform cookie parsing logic would require quite a bit of additional
// plumbing, and at least some platforms lack support for parsing Cookie,
// which is in a format slightly different from Set-Cookie and is normally
// only required on the server side.

/**
 * @unrestricted
 */
SDK.CookieParser = class {
  constructor() {
  }

  /**
   * @param {string|undefined} header
   * @return {?Array<!SDK.Cookie>}
   */
  static parseCookie(header) {
    return (new SDK.CookieParser()).parseCookie(header);
  }

  /**
   * @param {string|undefined} header
   * @return {?Array<!SDK.Cookie>}
   */
  static parseSetCookie(header) {
    return (new SDK.CookieParser()).parseSetCookie(header);
  }

  /**
   * @return {!Array<!SDK.Cookie>}
   */
  cookies() {
    return this._cookies;
  }

  /**
   * @param {string|undefined} cookieHeader
   * @return {?Array<!SDK.Cookie>}
   */
  parseCookie(cookieHeader) {
    if (!this._initialize(cookieHeader))
      return null;

    for (let kv = this._extractKeyValue(); kv; kv = this._extractKeyValue()) {
      if (kv.key.charAt(0) === '$' && this._lastCookie)
        this._lastCookie.addAttribute(kv.key.slice(1), kv.value);
      else if (kv.key.toLowerCase() !== '$version' && typeof kv.value === 'string')
        this._addCookie(kv, SDK.Cookie.Type.Request);
      this._advanceAndCheckCookieDelimiter();
    }
    this._flushCookie();
    return this._cookies;
  }

  /**
   * @param {string|undefined} setCookieHeader
   * @return {?Array<!SDK.Cookie>}
   */
  parseSetCookie(setCookieHeader) {
    if (!this._initialize(setCookieHeader))
      return null;
    for (let kv = this._extractKeyValue(); kv; kv = this._extractKeyValue()) {
      if (this._lastCookie)
        this._lastCookie.addAttribute(kv.key, kv.value);
      else
        this._addCookie(kv, SDK.Cookie.Type.Response);
      if (this._advanceAndCheckCookieDelimiter())
        this._flushCookie();
    }
    this._flushCookie();
    return this._cookies;
  }

  /**
   * @param {string|undefined} headerValue
   * @return {boolean}
   */
  _initialize(headerValue) {
    this._input = headerValue;
    if (typeof headerValue !== 'string')
      return false;
    this._cookies = [];
    this._lastCookie = null;
    this._originalInputLength = this._input.length;
    return true;
  }

  _flushCookie() {
    if (this._lastCookie)
      this._lastCookie.setSize(this._originalInputLength - this._input.length - this._lastCookiePosition);
    this._lastCookie = null;
  }

  /**
   * @return {?SDK.CookieParser.KeyValue}
   */
  _extractKeyValue() {
    if (!this._input || !this._input.length)
      return null;
    // Note: RFCs offer an option for quoted values that may contain commas and semicolons.
    // Many browsers/platforms do not support this, however (see http://webkit.org/b/16699
    // and http://crbug.com/12361). The logic below matches latest versions of IE, Firefox,
    // Chrome and Safari on some old platforms. The latest version of Safari supports quoted
    // cookie values, though.
    const keyValueMatch = /^[ \t]*([^\s=;]+)[ \t]*(?:=[ \t]*([^;\n]*))?/.exec(this._input);
    if (!keyValueMatch) {
      console.error('Failed parsing cookie header before: ' + this._input);
      return null;
    }

    const result = new SDK.CookieParser.KeyValue(
        keyValueMatch[1], keyValueMatch[2] && keyValueMatch[2].trim(), this._originalInputLength - this._input.length);
    this._input = this._input.slice(keyValueMatch[0].length);
    return result;
  }

  /**
   * @return {boolean}
   */
  _advanceAndCheckCookieDelimiter() {
    const match = /^\s*[\n;]\s*/.exec(this._input);
    if (!match)
      return false;
    this._input = this._input.slice(match[0].length);
    return match[0].match('\n') !== null;
  }

  /**
   * @param {!SDK.CookieParser.KeyValue} keyValue
   * @param {!SDK.Cookie.Type} type
   */
  _addCookie(keyValue, type) {
    if (this._lastCookie)
      this._lastCookie.setSize(keyValue.position - this._lastCookiePosition);

    // Mozilla bug 169091: Mozilla, IE and Chrome treat single token (w/o "=") as
    // specifying a value for a cookie with empty name.
    this._lastCookie = typeof keyValue.value === 'string' ? new SDK.Cookie(keyValue.key, keyValue.value, type) :
                                                            new SDK.Cookie('', keyValue.key, type);
    this._lastCookiePosition = keyValue.position;
    this._cookies.push(this._lastCookie);
  }
};

/**
 * @unrestricted
 */
SDK.CookieParser.KeyValue = class {
  /**
   * @param {string} key
   * @param {string|undefined} value
   * @param {number} position
   */
  constructor(key, value, position) {
    this.key = key;
    this.value = value;
    this.position = position;
  }
};


/**
 * @unrestricted
 */
SDK.Cookie = class {
  /**
   * @param {string} name
   * @param {string} value
   * @param {?SDK.Cookie.Type} type
   */
  constructor(name, value, type) {
    this._name = name;
    this._value = value;
    this._type = type;
    this._attributes = {};
    this._size = 0;
  }

  /**
   * @return {string}
   */
  name() {
    return this._name;
  }

  /**
   * @return {string}
   */
  value() {
    return this._value;
  }

  /**
   * @return {?SDK.Cookie.Type}
   */
  type() {
    return this._type;
  }

  /**
   * @return {boolean}
   */
  httpOnly() {
    return 'httponly' in this._attributes;
  }

  /**
   * @return {boolean}
   */
  secure() {
    return 'secure' in this._attributes;
  }

  /**
   * @return {!Protocol.Network.CookieSameSite}
   */
  sameSite() {
    // TODO(allada) This should not rely on _attributes and instead store them individually.
    return /** @type {!Protocol.Network.CookieSameSite} */ (this._attributes['samesite']);
  }

  /**
   * @return {boolean}
   */
  session() {
    // RFC 2965 suggests using Discard attribute to mark session cookies, but this does not seem to be widely used.
    // Check for absence of explicitly max-age or expiry date instead.
    return !('expires' in this._attributes || 'max-age' in this._attributes);
  }

  /**
   * @return {string}
   */
  path() {
    return this._attributes['path'];
  }

  /**
   * @return {string}
   */
  port() {
    return this._attributes['port'];
  }

  /**
   * @return {string}
   */
  domain() {
    return this._attributes['domain'];
  }

  /**
   * @return {number}
   */
  expires() {
    return this._attributes['expires'];
  }

  /**
   * @return {string}
   */
  maxAge() {
    return this._attributes['max-age'];
  }

  /**
   * @return {number}
   */
  size() {
    return this._size;
  }

  /**
   * @return {string}
   */
  url() {
    return (this.secure() ? 'https://' : 'http://') + this.domain() + this.path();
  }

  /**
   * @param {number} size
   */
  setSize(size) {
    this._size = size;
  }

  /**
   * @return {?Date}
   */
  expiresDate(requestDate) {
    // RFC 6265 indicates that the max-age attribute takes precedence over the expires attribute
    if (this.maxAge()) {
      const targetDate = requestDate === null ? new Date() : requestDate;
      return new Date(targetDate.getTime() + 1000 * this.maxAge());
    }

    if (this.expires())
      return new Date(this.expires());

    return null;
  }

  /**
   * @return {!Object}
   */
  attributes() {
    return this._attributes;
  }

  /**
   * @param {string} key
   * @param {string|number=} value
   */
  addAttribute(key, value) {
    this._attributes[key.toLowerCase()] = value;
  }
};

/**
 * @enum {number}
 */
SDK.Cookie.Type = {
  Request: 0,
  Response: 1
};
