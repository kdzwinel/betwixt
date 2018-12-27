/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @implements {Common.EventTarget}
 * @unrestricted
 */
Common.Object = class {
  constructor() {
    /** @type {(!Map<symbol, !Array<!Common.Object._listenerCallbackTuple>>|undefined)} */
    this._listeners;
  }

  /**
   * @override
   * @param {symbol} eventType
   * @param {function(!Common.Event)} listener
   * @param {!Object=} thisObject
   * @return {!Common.EventTarget.EventDescriptor}
   */
  addEventListener(eventType, listener, thisObject) {
    if (!listener)
      console.assert(false);

    if (!this._listeners)
      this._listeners = new Map();

    if (!this._listeners.has(eventType))
      this._listeners.set(eventType, []);
    this._listeners.get(eventType).push({thisObject: thisObject, listener: listener});
    return {eventTarget: this, eventType: eventType, thisObject: thisObject, listener: listener};
  }

  /**
   * @override
   * @param {symbol} eventType
   * @return {!Promise<*>}
   */
  once(eventType) {
    return new Promise(resolve => {
      const descriptor = this.addEventListener(eventType, event => {
        this.removeEventListener(eventType, descriptor.listener);
        resolve(event.data);
      });
    });
  }

  /**
   * @override
   * @param {symbol} eventType
   * @param {function(!Common.Event)} listener
   * @param {!Object=} thisObject
   */
  removeEventListener(eventType, listener, thisObject) {
    console.assert(listener);

    if (!this._listeners || !this._listeners.has(eventType))
      return;
    const listeners = this._listeners.get(eventType);
    for (let i = 0; i < listeners.length; ++i) {
      if (listeners[i].listener === listener && listeners[i].thisObject === thisObject) {
        listeners[i].disposed = true;
        listeners.splice(i--, 1);
      }
    }

    if (!listeners.length)
      this._listeners.delete(eventType);
  }

  /**
   * @override
   * @param {symbol} eventType
   * @return {boolean}
   */
  hasEventListeners(eventType) {
    return !!(this._listeners && this._listeners.has(eventType));
  }

  /**
   * @override
   * @param {symbol} eventType
   * @param {*=} eventData
   */
  dispatchEventToListeners(eventType, eventData) {
    if (!this._listeners || !this._listeners.has(eventType))
      return;

    const event = /** @type {!Common.Event} */ ({data: eventData});
    const listeners = this._listeners.get(eventType).slice(0);
    for (let i = 0; i < listeners.length; ++i) {
      if (!listeners[i].disposed)
        listeners[i].listener.call(listeners[i].thisObject, event);
    }
  }
};

/**
 * @typedef {!{data: *}}
 */
Common.Event;

/**
 * @typedef {!{thisObject: (!Object|undefined), listener: function(!Common.Event), disposed: (boolean|undefined)}}
 */
Common.Object._listenerCallbackTuple;

/**
 * @interface
 */
Common.EventTarget = function() {};

/**
 * @typedef {!{eventTarget: !Common.EventTarget, eventType: symbol, thisObject: (!Object|undefined), listener: function(!Common.Event)}}
 */
Common.EventTarget.EventDescriptor;

/**
 * @param {!Array<!Common.EventTarget.EventDescriptor>} eventList
 */
Common.EventTarget.removeEventListeners = function(eventList) {
  for (const eventInfo of eventList)
    eventInfo.eventTarget.removeEventListener(eventInfo.eventType, eventInfo.listener, eventInfo.thisObject);
  // Do not hold references on unused event descriptors.
  eventList.splice(0);
};

Common.EventTarget.prototype = {
  /**
   * @param {symbol} eventType
   * @param {function(!Common.Event)} listener
   * @param {!Object=} thisObject
   * @return {!Common.EventTarget.EventDescriptor}
   */
  addEventListener(eventType, listener, thisObject) {},

  /**
   * @param {symbol} eventType
   * @return {!Promise<*>}
   */
  once(eventType) {},

  /**
   * @param {symbol} eventType
   * @param {function(!Common.Event)} listener
   * @param {!Object=} thisObject
   */
  removeEventListener(eventType, listener, thisObject) {},

  /**
   * @param {symbol} eventType
   * @return {boolean}
   */
  hasEventListeners(eventType) {},

  /**
   * @param {symbol} eventType
   * @param {*=} eventData
   */
  dispatchEventToListeners(eventType, eventData) {},
};
