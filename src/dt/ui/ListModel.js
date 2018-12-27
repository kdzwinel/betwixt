// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Iterable<T>}
 * @template T
 */
UI.ListModel = class extends Common.Object {
  /**
   * @param {!Array<T>=} items
   */
  constructor(items) {
    super();
    this._items = items || [];
  }

  /**
   * @return {!Iterator<T>}
   */
  [Symbol.iterator]() {
    return this._items[Symbol.iterator]();
  }

  /**
   * @return {number}
   */
  get length() {
    return this._items.length;
  }

  /**
   * @param {number} index
   * @return {T}
   */
  at(index) {
    return this._items[index];
  }

  /**
   * @param {function(T):boolean} callback
   * @return {boolean}
   */
  every(callback) {
    return this._items.every(callback);
  }

  /**
   * @param {function(T):boolean} callback
   * @return {!Array<T>}
   */
  filter(callback) {
    return this._items.filter(callback);
  }

  /**
   * @param {function(T):boolean} callback
   * @return {T|undefined}
   */
  find(callback) {
    return this._items.find(callback);
  }

  /**
   * @param {function(T):boolean} callback
   * @return {number}
   */
  findIndex(callback) {
    return this._items.findIndex(callback);
  }

  /**
   * @param {T} value
   * @param {number=} fromIndex
   * @return {number}
   */
  indexOf(value, fromIndex) {
    return this._items.indexOf(value, fromIndex);
  }

  /**
   * @param {number} index
   * @param {T} value
   */
  insert(index, value) {
    this._items.splice(index, 0, value);
    this._replaced(index, [], 1);
  }

  /**
   * @param {T} value
   * @param {function(T, T):number} comparator
   */
  insertWithComparator(value, comparator) {
    this.insert(this._items.lowerBound(value, comparator), value);
  }

  /**
   * @param {string=} separator
   * @return {string}
   */
  join(separator) {
    return this._items.join(separator);
  }

  /**
   * @param {number} index
   * @return {T}
   */
  remove(index) {
    const result = this._items[index];
    this._items.splice(index, 1);
    this._replaced(index, [result], 0);
    return result;
  }

  /**
   * @param {number} index
   * @param {T} value
   * @return {T}
   */
  replace(index, value) {
    const oldValue = this._items[index];
    this._items[index] = value;
    this._replaced(index, [oldValue], 1);
    return oldValue;
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {!Array<T>} items
   * @return {!Array<T>} removed
   */
  replaceRange(from, to, items) {
    let removed;
    if (items.length < 10000) {
      removed = this._items.splice(from, to - from, ...items);
    } else {
      removed = this._items.slice(from, to);
      // Splice may fail with too many arguments.
      const before = this._items.slice(0, from);
      const after = this._items.slice(to);
      this._items = [].concat(before, items, after);
    }
    this._replaced(from, removed, items.length);
    return removed;
  }

  /**
   * @param {!Array<T>} items
   * @return {!Array<T>}
   */
  replaceAll(items) {
    const oldItems = this._items.slice();
    this._items = items;
    this._replaced(0, oldItems, items.length);
    return oldItems;
  }

  /**
   * @param {number=} from
   * @param {number=} to
   * @return {!Array<T>}
   */
  slice(from, to) {
    return this._items.slice(from, to);
  }

  /**
   * @param {function(T):boolean} callback
   * @return {boolean}
   */
  some(callback) {
    return this._items.some(callback);
  }

  /**
   * @param {number} index
   * @param {!Array<T>} removed
   * @param {number} inserted
   */
  _replaced(index, removed, inserted) {
    this.dispatchEventToListeners(
        UI.ListModel.Events.ItemsReplaced, {index: index, removed: removed, inserted: inserted});
  }
};

/** @enum {symbol} */
UI.ListModel.Events = {
  ItemsReplaced: Symbol('ItemsReplaced'),
};
