// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Common.Console = class extends Common.Object {
  constructor() {
    super();
    /** @type {!Array.<!Common.Console.Message>} */
    this._messages = [];
  }

  /**
   * @param {string} text
   * @param {!Common.Console.MessageLevel} level
   * @param {boolean=} show
   */
  addMessage(text, level, show) {
    const message =
        new Common.Console.Message(text, level || Common.Console.MessageLevel.Info, Date.now(), show || false);
    this._messages.push(message);
    this.dispatchEventToListeners(Common.Console.Events.MessageAdded, message);
  }

  /**
   * @param {string} text
   */
  log(text) {
    this.addMessage(text, Common.Console.MessageLevel.Info);
  }

  /**
   * @param {string} text
   */
  warn(text) {
    this.addMessage(text, Common.Console.MessageLevel.Warning);
  }

  /**
   * @param {string} text
   */
  error(text) {
    this.addMessage(text, Common.Console.MessageLevel.Error, true);
  }

  /**
   * @return {!Array.<!Common.Console.Message>}
   */
  messages() {
    return this._messages;
  }

  show() {
    this.showPromise();
  }

  /**
   * @return {!Promise.<undefined>}
   */
  showPromise() {
    return Common.Revealer.reveal(this);
  }
};

/** @enum {symbol} */
Common.Console.Events = {
  MessageAdded: Symbol('messageAdded')
};

/**
 * @enum {string}
 */
Common.Console.MessageLevel = {
  Info: 'info',
  Warning: 'warning',
  Error: 'error'
};

/**
 * @unrestricted
 */
Common.Console.Message = class {
  /**
   * @param {string} text
   * @param {!Common.Console.MessageLevel} level
   * @param {number} timestamp
   * @param {boolean} show
   */
  constructor(text, level, timestamp, show) {
    this.text = text;
    this.level = level;
    this.timestamp = (typeof timestamp === 'number') ? timestamp : Date.now();
    this.show = show;
  }
};

Common.console = new Common.Console();
