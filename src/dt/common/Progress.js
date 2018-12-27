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
/**
 * @interface
 */
Common.Progress = function() {};

Common.Progress.prototype = {
  /**
   * @param {number} totalWork
   */
  setTotalWork(totalWork) {},

  /**
   * @param {string} title
   */
  setTitle(title) {},

  /**
   * @param {number} worked
   * @param {string=} title
   */
  setWorked(worked, title) {},

  /**
   * @param {number=} worked
   */
  worked(worked) {},

  done() {},

  /**
   * @return {boolean}
   */
  isCanceled() {
    return false;
  },
};

/**
 * @unrestricted
 */
Common.CompositeProgress = class {
  /**
   * @param {!Common.Progress} parent
   */
  constructor(parent) {
    this._parent = parent;
    this._children = [];
    this._childrenDone = 0;
    this._parent.setTotalWork(1);
    this._parent.setWorked(0);
  }

  _childDone() {
    if (++this._childrenDone !== this._children.length)
      return;
    this._parent.done();
  }

  /**
   * @param {number=} weight
   * @return {!Common.SubProgress}
   */
  createSubProgress(weight) {
    const child = new Common.SubProgress(this, weight);
    this._children.push(child);
    return child;
  }

  _update() {
    let totalWeights = 0;
    let done = 0;

    for (let i = 0; i < this._children.length; ++i) {
      const child = this._children[i];
      if (child._totalWork)
        done += child._weight * child._worked / child._totalWork;
      totalWeights += child._weight;
    }
    this._parent.setWorked(done / totalWeights);
  }
};

/**
 * @implements {Common.Progress}
 * @unrestricted
 */
Common.SubProgress = class {
  /**
   * @param {!Common.CompositeProgress} composite
   * @param {number=} weight
   */
  constructor(composite, weight) {
    this._composite = composite;
    this._weight = weight || 1;
    this._worked = 0;
  }

  /**
   * @override
   * @return {boolean}
   */
  isCanceled() {
    return this._composite._parent.isCanceled();
  }

  /**
   * @override
   * @param {string} title
   */
  setTitle(title) {
    this._composite._parent.setTitle(title);
  }

  /**
   * @override
   */
  done() {
    this.setWorked(this._totalWork);
    this._composite._childDone();
  }

  /**
   * @override
   * @param {number} totalWork
   */
  setTotalWork(totalWork) {
    this._totalWork = totalWork;
    this._composite._update();
  }

  /**
   * @override
   * @param {number} worked
   * @param {string=} title
   */
  setWorked(worked, title) {
    this._worked = worked;
    if (typeof title !== 'undefined')
      this.setTitle(title);
    this._composite._update();
  }

  /**
   * @override
   * @param {number=} worked
   */
  worked(worked) {
    this.setWorked(this._worked + (worked || 1));
  }
};

/**
 * @implements {Common.Progress}
 * @unrestricted
 */
Common.ProgressProxy = class {
  /**
   * @param {?Common.Progress} delegate
   * @param {function()=} doneCallback
   */
  constructor(delegate, doneCallback) {
    this._delegate = delegate;
    this._doneCallback = doneCallback;
  }

  /**
   * @override
   * @return {boolean}
   */
  isCanceled() {
    return this._delegate ? this._delegate.isCanceled() : false;
  }

  /**
   * @override
   * @param {string} title
   */
  setTitle(title) {
    if (this._delegate)
      this._delegate.setTitle(title);
  }

  /**
   * @override
   */
  done() {
    if (this._delegate)
      this._delegate.done();
    if (this._doneCallback)
      this._doneCallback();
  }

  /**
   * @override
   * @param {number} totalWork
   */
  setTotalWork(totalWork) {
    if (this._delegate)
      this._delegate.setTotalWork(totalWork);
  }

  /**
   * @override
   * @param {number} worked
   * @param {string=} title
   */
  setWorked(worked, title) {
    if (this._delegate)
      this._delegate.setWorked(worked, title);
  }

  /**
   * @override
   * @param {number=} worked
   */
  worked(worked) {
    if (this._delegate)
      this._delegate.worked(worked);
  }
};
