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
 * @implements {Protocol.StorageDispatcher}
 * @unrestricted
 */
Resources.IndexedDBModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    target.registerStorageDispatcher(this);
    this._securityOriginManager = target.model(SDK.SecurityOriginManager);
    this._indexedDBAgent = target.indexedDBAgent();
    this._storageAgent = target.storageAgent();

    /** @type {!Map.<!Resources.IndexedDBModel.DatabaseId, !Resources.IndexedDBModel.Database>} */
    this._databases = new Map();
    /** @type {!Object.<string, !Array.<string>>} */
    this._databaseNamesBySecurityOrigin = {};

    this._originsUpdated = new Set();
    this._throttler = new Common.Throttler(1000);
  }

  /**
   * @param {*} idbKey
   * @return {({
   *   array: (!Array<?>|undefined),
   *   date: (number|undefined),
   *   number: (number|undefined),
   *   string: (string|undefined),
   *   type: !Protocol.IndexedDB.KeyType<string>
   * }|undefined)}
   */
  static keyFromIDBKey(idbKey) {
    if (typeof(idbKey) === 'undefined' || idbKey === null)
      return undefined;

    let type;
    const key = {};
    switch (typeof(idbKey)) {
      case 'number':
        key.number = idbKey;
        type = Resources.IndexedDBModel.KeyTypes.NumberType;
        break;
      case 'string':
        key.string = idbKey;
        type = Resources.IndexedDBModel.KeyTypes.StringType;
        break;
      case 'object':
        if (idbKey instanceof Date) {
          key.date = idbKey.getTime();
          type = Resources.IndexedDBModel.KeyTypes.DateType;
        } else if (Array.isArray(idbKey)) {
          key.array = [];
          for (let i = 0; i < idbKey.length; ++i)
            key.array.push(Resources.IndexedDBModel.keyFromIDBKey(idbKey[i]));
          type = Resources.IndexedDBModel.KeyTypes.ArrayType;
        }
        break;
      default:
        return undefined;
    }
    key.type = /** @type {!Protocol.IndexedDB.KeyType<string>} */ (type);
    return key;
  }

  /**
   * @param {!IDBKeyRange} idbKeyRange
   * @return {!Protocol.IndexedDB.KeyRange}
   */
  static _keyRangeFromIDBKeyRange(idbKeyRange) {
    const keyRange = {};
    keyRange.lower = Resources.IndexedDBModel.keyFromIDBKey(idbKeyRange.lower);
    keyRange.upper = Resources.IndexedDBModel.keyFromIDBKey(idbKeyRange.upper);
    keyRange.lowerOpen = !!idbKeyRange.lowerOpen;
    keyRange.upperOpen = !!idbKeyRange.upperOpen;
    return keyRange;
  }

  /**
   * @param {!Protocol.IndexedDB.KeyPath} keyPath
   * @return {?string|!Array.<string>|undefined}
   */
  static idbKeyPathFromKeyPath(keyPath) {
    let idbKeyPath;
    switch (keyPath.type) {
      case Resources.IndexedDBModel.KeyPathTypes.NullType:
        idbKeyPath = null;
        break;
      case Resources.IndexedDBModel.KeyPathTypes.StringType:
        idbKeyPath = keyPath.string;
        break;
      case Resources.IndexedDBModel.KeyPathTypes.ArrayType:
        idbKeyPath = keyPath.array;
        break;
    }
    return idbKeyPath;
  }

  /**
   * @param {?string|!Array.<string>|undefined} idbKeyPath
   * @return {?string}
   */
  static keyPathStringFromIDBKeyPath(idbKeyPath) {
    if (typeof idbKeyPath === 'string')
      return '"' + idbKeyPath + '"';
    if (idbKeyPath instanceof Array)
      return '["' + idbKeyPath.join('", "') + '"]';
    return null;
  }

  enable() {
    if (this._enabled)
      return;

    this._indexedDBAgent.enable();
    this._securityOriginManager.addEventListener(
        SDK.SecurityOriginManager.Events.SecurityOriginAdded, this._securityOriginAdded, this);
    this._securityOriginManager.addEventListener(
        SDK.SecurityOriginManager.Events.SecurityOriginRemoved, this._securityOriginRemoved, this);

    for (const securityOrigin of this._securityOriginManager.securityOrigins())
      this._addOrigin(securityOrigin);

    this._enabled = true;
  }

  /**
   * @param {string} origin
   */
  clearForOrigin(origin) {
    if (!this._enabled)
      return;

    this._removeOrigin(origin);
    this._addOrigin(origin);
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   */
  async deleteDatabase(databaseId) {
    if (!this._enabled)
      return;
    await this._indexedDBAgent.deleteDatabase(databaseId.securityOrigin, databaseId.name);
    this._loadDatabaseNames(databaseId.securityOrigin);
  }

  async refreshDatabaseNames() {
    for (const securityOrigin in this._databaseNamesBySecurityOrigin)
      await this._loadDatabaseNames(securityOrigin);
    this.dispatchEventToListeners(Resources.IndexedDBModel.Events.DatabaseNamesRefreshed);
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   */
  refreshDatabase(databaseId) {
    this._loadDatabase(databaseId, true);
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @param {string} objectStoreName
   * @return {!Promise}
   */
  clearObjectStore(databaseId, objectStoreName) {
    return this._indexedDBAgent.clearObjectStore(databaseId.securityOrigin, databaseId.name, objectStoreName);
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @param {string} objectStoreName
   * @param {!IDBKeyRange} idbKeyRange
   * @return {!Promise}
   */
  deleteEntries(databaseId, objectStoreName, idbKeyRange) {
    const keyRange = Resources.IndexedDBModel._keyRangeFromIDBKeyRange(idbKeyRange);
    return this._indexedDBAgent.deleteObjectStoreEntries(
        databaseId.securityOrigin, databaseId.name, objectStoreName, keyRange);
  }

  /**
   * @param {!Common.Event} event
   */
  _securityOriginAdded(event) {
    const securityOrigin = /** @type {string} */ (event.data);
    this._addOrigin(securityOrigin);
  }

  /**
   * @param {!Common.Event} event
   */
  _securityOriginRemoved(event) {
    const securityOrigin = /** @type {string} */ (event.data);
    this._removeOrigin(securityOrigin);
  }

  /**
   * @param {string} securityOrigin
   */
  _addOrigin(securityOrigin) {
    console.assert(!this._databaseNamesBySecurityOrigin[securityOrigin]);
    this._databaseNamesBySecurityOrigin[securityOrigin] = [];
    this._loadDatabaseNames(securityOrigin);
    if (this._isValidSecurityOrigin(securityOrigin))
      this._storageAgent.trackIndexedDBForOrigin(securityOrigin);
  }

  /**
   * @param {string} securityOrigin
   */
  _removeOrigin(securityOrigin) {
    console.assert(this._databaseNamesBySecurityOrigin[securityOrigin]);
    for (let i = 0; i < this._databaseNamesBySecurityOrigin[securityOrigin].length; ++i)
      this._databaseRemoved(securityOrigin, this._databaseNamesBySecurityOrigin[securityOrigin][i]);
    delete this._databaseNamesBySecurityOrigin[securityOrigin];
    if (this._isValidSecurityOrigin(securityOrigin))
      this._storageAgent.untrackIndexedDBForOrigin(securityOrigin);
  }

  /**
   * @param {string} securityOrigin
   * @return {boolean}
   */
  _isValidSecurityOrigin(securityOrigin) {
    const parsedURL = securityOrigin.asParsedURL();
    return !!parsedURL && parsedURL.scheme.startsWith('http');
  }

  /**
   * @param {string} securityOrigin
   * @param {!Array.<string>} databaseNames
   */
  _updateOriginDatabaseNames(securityOrigin, databaseNames) {
    const newDatabaseNames = new Set(databaseNames);
    const oldDatabaseNames = new Set(this._databaseNamesBySecurityOrigin[securityOrigin]);

    this._databaseNamesBySecurityOrigin[securityOrigin] = databaseNames;

    for (const databaseName of oldDatabaseNames) {
      if (!newDatabaseNames.has(databaseName))
        this._databaseRemoved(securityOrigin, databaseName);
    }
    for (const databaseName of newDatabaseNames) {
      if (!oldDatabaseNames.has(databaseName))
        this._databaseAdded(securityOrigin, databaseName);
    }
  }

  /**
   * @return {!Array.<!Resources.IndexedDBModel.DatabaseId>}
   */
  databases() {
    const result = [];
    for (const securityOrigin in this._databaseNamesBySecurityOrigin) {
      const databaseNames = this._databaseNamesBySecurityOrigin[securityOrigin];
      for (let i = 0; i < databaseNames.length; ++i)
        result.push(new Resources.IndexedDBModel.DatabaseId(securityOrigin, databaseNames[i]));
    }
    return result;
  }

  /**
   * @param {string} securityOrigin
   * @param {string} databaseName
   */
  _databaseAdded(securityOrigin, databaseName) {
    const databaseId = new Resources.IndexedDBModel.DatabaseId(securityOrigin, databaseName);
    this.dispatchEventToListeners(Resources.IndexedDBModel.Events.DatabaseAdded, {model: this, databaseId: databaseId});
  }

  /**
   * @param {string} securityOrigin
   * @param {string} databaseName
   */
  _databaseRemoved(securityOrigin, databaseName) {
    const databaseId = new Resources.IndexedDBModel.DatabaseId(securityOrigin, databaseName);
    this.dispatchEventToListeners(
        Resources.IndexedDBModel.Events.DatabaseRemoved, {model: this, databaseId: databaseId});
  }

  /**
   * @param {string} securityOrigin
   * @return {!Promise<!Array.<string>>} databaseNames
   */
  async _loadDatabaseNames(securityOrigin) {
    const databaseNames = await this._indexedDBAgent.requestDatabaseNames(securityOrigin);
    if (!databaseNames)
      return [];
    if (!this._databaseNamesBySecurityOrigin[securityOrigin])
      return [];
    this._updateOriginDatabaseNames(securityOrigin, databaseNames);
    return databaseNames;
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @param {boolean} entriesUpdated
   */
  async _loadDatabase(databaseId, entriesUpdated) {
    const databaseWithObjectStores =
        await this._indexedDBAgent.requestDatabase(databaseId.securityOrigin, databaseId.name);

    if (!databaseWithObjectStores)
      return;
    if (!this._databaseNamesBySecurityOrigin[databaseId.securityOrigin])
      return;

    const databaseModel = new Resources.IndexedDBModel.Database(databaseId, databaseWithObjectStores.version);
    this._databases.set(databaseId, databaseModel);
    for (const objectStore of databaseWithObjectStores.objectStores) {
      const objectStoreIDBKeyPath = Resources.IndexedDBModel.idbKeyPathFromKeyPath(objectStore.keyPath);
      const objectStoreModel =
          new Resources.IndexedDBModel.ObjectStore(objectStore.name, objectStoreIDBKeyPath, objectStore.autoIncrement);
      for (let j = 0; j < objectStore.indexes.length; ++j) {
        const index = objectStore.indexes[j];
        const indexIDBKeyPath = Resources.IndexedDBModel.idbKeyPathFromKeyPath(index.keyPath);
        const indexModel =
            new Resources.IndexedDBModel.Index(index.name, indexIDBKeyPath, index.unique, index.multiEntry);
        objectStoreModel.indexes[indexModel.name] = indexModel;
      }
      databaseModel.objectStores[objectStoreModel.name] = objectStoreModel;
    }

    this.dispatchEventToListeners(
        Resources.IndexedDBModel.Events.DatabaseLoaded,
        {model: this, database: databaseModel, entriesUpdated: entriesUpdated});
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @param {string} objectStoreName
   * @param {?IDBKeyRange} idbKeyRange
   * @param {number} skipCount
   * @param {number} pageSize
   * @param {function(!Array.<!Resources.IndexedDBModel.Entry>, boolean)} callback
   */
  loadObjectStoreData(databaseId, objectStoreName, idbKeyRange, skipCount, pageSize, callback) {
    this._requestData(databaseId, databaseId.name, objectStoreName, '', idbKeyRange, skipCount, pageSize, callback);
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @param {string} objectStoreName
   * @param {string} indexName
   * @param {?IDBKeyRange} idbKeyRange
   * @param {number} skipCount
   * @param {number} pageSize
   * @param {function(!Array.<!Resources.IndexedDBModel.Entry>, boolean)} callback
   */
  loadIndexData(databaseId, objectStoreName, indexName, idbKeyRange, skipCount, pageSize, callback) {
    this._requestData(
        databaseId, databaseId.name, objectStoreName, indexName, idbKeyRange, skipCount, pageSize, callback);
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @param {string} databaseName
   * @param {string} objectStoreName
   * @param {string} indexName
   * @param {?IDBKeyRange} idbKeyRange
   * @param {number} skipCount
   * @param {number} pageSize
   * @param {function(!Array.<!Resources.IndexedDBModel.Entry>, boolean)} callback
   */
  async _requestData(databaseId, databaseName, objectStoreName, indexName, idbKeyRange, skipCount, pageSize, callback) {
    const keyRange = idbKeyRange ? Resources.IndexedDBModel._keyRangeFromIDBKeyRange(idbKeyRange) : undefined;

    const response = await this._indexedDBAgent.invoke_requestData({
      securityOrigin: databaseId.securityOrigin,
      databaseName,
      objectStoreName,
      indexName,
      skipCount,
      pageSize,
      keyRange
    });

    if (response[Protocol.Error]) {
      console.error('IndexedDBAgent error: ' + response[Protocol.Error]);
      return;
    }

    const runtimeModel = this.target().model(SDK.RuntimeModel);
    if (!runtimeModel || !this._databaseNamesBySecurityOrigin[databaseId.securityOrigin])
      return;
    const dataEntries = response.objectStoreDataEntries;
    const entries = [];
    for (const dataEntry of dataEntries) {
      const key = runtimeModel.createRemoteObject(dataEntry.key);
      const primaryKey = runtimeModel.createRemoteObject(dataEntry.primaryKey);
      const value = runtimeModel.createRemoteObject(dataEntry.value);
      entries.push(new Resources.IndexedDBModel.Entry(key, primaryKey, value));
    }
    callback(entries, response.hasMore);
  }

  /**
   * @param {string} securityOrigin
   */
  async _refreshDatabaseList(securityOrigin) {
    const databaseNames = await this._loadDatabaseNames(securityOrigin);
    for (const databaseName of databaseNames)
      this._loadDatabase(new Resources.IndexedDBModel.DatabaseId(securityOrigin, databaseName), false);
  }

  /**
   * @param {string} securityOrigin
   * @override
   */
  indexedDBListUpdated(securityOrigin) {
    this._originsUpdated.add(securityOrigin);

    this._throttler.schedule(() => {
      const promises = Array.from(this._originsUpdated, securityOrigin => {
        this._refreshDatabaseList(securityOrigin);
      });
      this._originsUpdated.clear();
      return Promise.all(promises);
    });
  }

  /**
   * @param {string} securityOrigin
   * @param {string} databaseName
   * @param {string} objectStoreName
   * @override
   */
  indexedDBContentUpdated(securityOrigin, databaseName, objectStoreName) {
    const databaseId = new Resources.IndexedDBModel.DatabaseId(securityOrigin, databaseName);
    this.dispatchEventToListeners(
        Resources.IndexedDBModel.Events.IndexedDBContentUpdated,
        {databaseId: databaseId, objectStoreName: objectStoreName, model: this});
  }

  /**
   * @param {string} securityOrigin
   * @override
   */
  cacheStorageListUpdated(securityOrigin) {
  }

  /**
   * @param {string} securityOrigin
   * @override
   */
  cacheStorageContentUpdated(securityOrigin) {
  }
};

SDK.SDKModel.register(Resources.IndexedDBModel, SDK.Target.Capability.None, false);

Resources.IndexedDBModel.KeyTypes = {
  NumberType: 'number',
  StringType: 'string',
  DateType: 'date',
  ArrayType: 'array'
};

Resources.IndexedDBModel.KeyPathTypes = {
  NullType: 'null',
  StringType: 'string',
  ArrayType: 'array'
};

/** @enum {symbol} */
Resources.IndexedDBModel.Events = {
  DatabaseAdded: Symbol('DatabaseAdded'),
  DatabaseRemoved: Symbol('DatabaseRemoved'),
  DatabaseLoaded: Symbol('DatabaseLoaded'),
  DatabaseNamesRefreshed: Symbol('DatabaseNamesRefreshed'),
  IndexedDBContentUpdated: Symbol('IndexedDBContentUpdated')
};

/**
 * @unrestricted
 */
Resources.IndexedDBModel.Entry = class {
  /**
   * @param {!SDK.RemoteObject} key
   * @param {!SDK.RemoteObject} primaryKey
   * @param {!SDK.RemoteObject} value
   */
  constructor(key, primaryKey, value) {
    this.key = key;
    this.primaryKey = primaryKey;
    this.value = value;
  }
};

/**
 * @unrestricted
 */
Resources.IndexedDBModel.DatabaseId = class {
  /**
   * @param {string} securityOrigin
   * @param {string} name
   */
  constructor(securityOrigin, name) {
    this.securityOrigin = securityOrigin;
    this.name = name;
  }

  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @return {boolean}
   */
  equals(databaseId) {
    return this.name === databaseId.name && this.securityOrigin === databaseId.securityOrigin;
  }
};

/**
 * @unrestricted
 */
Resources.IndexedDBModel.Database = class {
  /**
   * @param {!Resources.IndexedDBModel.DatabaseId} databaseId
   * @param {number} version
   */
  constructor(databaseId, version) {
    this.databaseId = databaseId;
    this.version = version;
    this.objectStores = {};
  }
};

/**
 * @unrestricted
 */
Resources.IndexedDBModel.ObjectStore = class {
  /**
   * @param {string} name
   * @param {*} keyPath
   * @param {boolean} autoIncrement
   */
  constructor(name, keyPath, autoIncrement) {
    this.name = name;
    this.keyPath = keyPath;
    this.autoIncrement = autoIncrement;
    this.indexes = {};
  }

  /**
   * @return {string}
   */
  get keyPathString() {
    return /** @type {string}*/ (
        Resources.IndexedDBModel.keyPathStringFromIDBKeyPath(/** @type {string}*/ (this.keyPath)));
  }
};

/**
 * @unrestricted
 */
Resources.IndexedDBModel.Index = class {
  /**
   * @param {string} name
   * @param {*} keyPath
   * @param {boolean} unique
   * @param {boolean} multiEntry
   */
  constructor(name, keyPath, unique, multiEntry) {
    this.name = name;
    this.keyPath = keyPath;
    this.unique = unique;
    this.multiEntry = multiEntry;
  }

  /**
   * @return {string}
   */
  get keyPathString() {
    return /** @type {string}*/ (
        Resources.IndexedDBModel.keyPathStringFromIDBKeyPath(/** @type {string}*/ (this.keyPath)));
  }
};
