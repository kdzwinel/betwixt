// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
SDK.ServerTiming = class {
  /**
   * @param {string} metric
   * @param {?number} value
   * @param {?string} description
   */
  constructor(metric, value, description) {
    this.metric = metric;
    this.value = value;
    this.description = description;
  }

  /**
   * @param {!Array<!SDK.NetworkRequest.NameValue>} headers
   * @return {?Array<!SDK.ServerTiming>}
   */
  static parseHeaders(headers) {
    const rawServerTimingHeaders = headers.filter(item => item.name.toLowerCase() === 'server-timing');
    if (!rawServerTimingHeaders.length)
      return null;

    const serverTimings = rawServerTimingHeaders.reduce((memo, header) => {
      const timing = this.createFromHeaderValue(header.value);
      memo.pushAll(timing.map(function(entry) {
        return new SDK.ServerTiming(
            entry.name, entry.hasOwnProperty('dur') ? entry.dur : null, entry.hasOwnProperty('desc') ? entry.desc : '');
      }));
      return memo;
    }, []);
    serverTimings.sort((a, b) => a.metric.toLowerCase().compareTo(b.metric.toLowerCase()));
    return serverTimings;
  }

  /**
   * @param {string} valueString
   * @return {?Array<!Object>}
   */
  static createFromHeaderValue(valueString) {
    function trimLeadingWhiteSpace() {
      valueString = valueString.replace(/^\s*/, '');
    }
    function consumeDelimiter(char) {
      console.assert(char.length === 1);
      trimLeadingWhiteSpace();
      if (valueString.charAt(0) !== char)
        return false;

      valueString = valueString.substring(1);
      return true;
    }
    function consumeToken() {
      // https://tools.ietf.org/html/rfc7230#appendix-B
      const result = /^(?:\s*)([\w!#$%&'*+\-.^`|~]+)(?:\s*)(.*)/.exec(valueString);
      if (!result)
        return null;

      valueString = result[2];
      return result[1];
    }
    function consumeTokenOrQuotedString() {
      trimLeadingWhiteSpace();
      if (valueString.charAt(0) === '"')
        return consumeQuotedString();

      return consumeToken();
    }
    function consumeQuotedString() {
      console.assert(valueString.charAt(0) === '"');
      valueString = valueString.substring(1);  // remove leading DQUOTE

      let value = '';
      while (valueString.length) {
        // split into two parts:
        //  -everything before the first " or \
        //  -everything else
        const result = /^([^"\\]*)(.*)/.exec(valueString);
        value += result[1];
        if (result[2].charAt(0) === '"') {
          // we have found our closing "
          valueString = result[2].substring(1);  // strip off everything after the closing "
          return value;                          // we are done here
        }

        console.assert(result[2].charAt(0) === '\\');
        // special rules for \ found in quoted-string (https://tools.ietf.org/html/rfc7230#section-3.2.6)
        value += result[2].charAt(1);          // grab the character AFTER the \ (if there was one)
        valueString = result[2].substring(2);  // strip off \ and next character
      }

      return null;  // not a valid quoted-string
    }
    function consumeExtraneous() {
      const result = /([,;].*)/.exec(valueString);
      if (result)
        valueString = result[1];
    }

    const result = [];
    let name;
    while ((name = consumeToken()) !== null) {
      const entry = {name};

      if (valueString.charAt(0) === '=')
        this.showWarning(ls`Deprecated syntax found. Please use: <name>;dur=<duration>;desc=<description>`);

      while (consumeDelimiter(';')) {
        let paramName;
        if ((paramName = consumeToken()) === null)
          continue;

        paramName = paramName.toLowerCase();
        const parseParameter = this.getParserForParameter(paramName);
        let paramValue = null;
        if (consumeDelimiter('=')) {
          // always parse the value, even if we don't recognize the parameter name
          paramValue = consumeTokenOrQuotedString();
          consumeExtraneous();
        }

        if (parseParameter) {
          // paramName is valid
          if (entry.hasOwnProperty(paramName)) {
            this.showWarning(ls`Duplicate parameter \"${paramName}\" ignored.`);
            continue;
          }

          if (paramValue === null)
            this.showWarning(ls`No value found for parameter \"${paramName}\".`);

          parseParameter.call(this, entry, paramValue);
        } else {
          // paramName is not valid
          this.showWarning(ls`Unrecognized parameter \"${paramName}\".`);
        }
      }

      result.push(entry);
      if (!consumeDelimiter(','))
        break;
    }

    if (valueString.length)
      this.showWarning(ls`Extraneous trailing characters.`);
    return result;
  }

  /**
   * @param {string} paramName
   * @return {?function(!Object, string)}
   */
  static getParserForParameter(paramName) {
    switch (paramName) {
      case 'dur':
        return function(entry, paramValue) {
          entry.dur = 0;
          if (paramValue !== null) {
            const duration = parseFloat(paramValue);
            if (isNaN(duration)) {
              this.showWarning(ls`Unable to parse \"${paramName}\" value \"${paramValue}\".`);
              return;
            }
            entry.dur = duration;
          }
        };

      case 'desc':
        return function(entry, paramValue) {
          entry.desc = paramValue || '';
        };

      default:
        return null;
    }
  }

  /**
   * @param {string} msg
   */
  static showWarning(msg) {
    Common.console.warn(Common.UIString(`ServerTiming: ${msg}`));
  }
};
