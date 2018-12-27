// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {Protocol.StorageDispatcher}
 * @unrestricted
 */
SDK.ServiceWorkerCacheModel = class extends SDK.SDKModel {
  /**
   * Invariant: This model can only be constructed on a ServiceWorker target.
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    target.registerStorageDispatcher(this);

    /** @type {!Map<string, !SDK.ServiceWorkerCacheModel.Cache>} */
    this._caches = new Map();

    this._cacheAgent = target.cacheStorageAgent();
    this._storageAgent = target.storageAgent();

    this._securityOriginManager = target.model(SDK.SecurityOriginManager);

    this._originsUpdated = new Set();
    this._throttler = new Common.Throttler(2000);

    /** @type {boolean} */
    this._enabled = false;
  }

  enable() {
    if (this._enabled)
      return;

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
    this._removeOrigin(origin);
    this._addOrigin(origin);
  }

  refreshCacheNames() {
    for (const cache of this._caches.values())
      this._cacheRemoved(cache);
    this._caches.clear();
    const securityOrigins = this._securityOriginManager.securityOrigins();
    for (const securityOrigin of securityOrigins)
      this._loadCacheNames(securityOrigin);
  }

  /**
   * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
   */
  async deleteCache(cache) {
    const response = await this._cacheAgent.invoke_deleteCache({cacheId: cache.cacheId});
    if (response[Protocol.Error]) {
      console.error(`ServiceWorkerCacheAgent error deleting cache ${cache.toString()}: ${response[Protocol.Error]}`);
      return;
    }
    this._caches.delete(cache.cacheId);
    this._cacheRemoved(cache);
  }

  /**
   * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
   * @param {string} request
   * @return {!Promise}
   */
  async deleteCacheEntry(cache, request) {
    const response = await this._cacheAgent.invoke_deleteEntry({cacheId: cache.cacheId, request});
    if (!response[Protocol.Error])
      return;
    Common.console.error(Common.UIString(
        'ServiceWorkerCacheAgent error deleting cache entry %s in cache: %s', cache.toString(),
        response[Protocol.Error]));
  }

  /**
   * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
   * @param {number} skipCount
   * @param {number} pageSize
   * @param {string} pathFilter
   * @param {function(!Array.<!Protocol.CacheStorage.DataEntry>, boolean)} callback
   */
  loadCacheData(cache, skipCount, pageSize, pathFilter, callback) {
    this._requestEntries(cache, skipCount, pageSize, pathFilter, callback);
  }

  /**
   * @return {!Array.<!SDK.ServiceWorkerCacheModel.Cache>}
   */
  caches() {
    const caches = new Array();
    for (const cache of this._caches.values())
      caches.push(cache);
    return caches;
  }

  /**
   * @override
   */
  dispose() {
    for (const cache of this._caches.values())
      this._cacheRemoved(cache);
    this._caches.clear();
    if (this._enabled) {
      this._securityOriginManager.removeEventListener(
          SDK.SecurityOriginManager.Events.SecurityOriginAdded, this._securityOriginAdded, this);
      this._securityOriginManager.removeEventListener(
          SDK.SecurityOriginManager.Events.SecurityOriginRemoved, this._securityOriginRemoved, this);
    }
  }

  _addOrigin(securityOrigin) {
    this._loadCacheNames(securityOrigin);
    if (this._isValidSecurityOrigin(securityOrigin))
      this._storageAgent.trackCacheStorageForOrigin(securityOrigin);
  }

  /**
   * @param {string} securityOrigin
   */
  _removeOrigin(securityOrigin) {
    for (const opaqueId of this._caches.keys()) {
      const cache = this._caches.get(opaqueId);
      if (cache.securityOrigin === securityOrigin) {
        this._caches.delete(opaqueId);
        this._cacheRemoved(cache);
      }
    }
    if (this._isValidSecurityOrigin(securityOrigin))
      this._storageAgent.untrackCacheStorageForOrigin(securityOrigin);
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
   */
  async _loadCacheNames(securityOrigin) {
    const caches = await this._cacheAgent.requestCacheNames(securityOrigin);
    if (!caches)
      return;
    this._updateCacheNames(securityOrigin, caches);
  }

  /**
   * @param {string} securityOrigin
   * @param {!Array} cachesJson
   */
  _updateCacheNames(securityOrigin, cachesJson) {
    /**
     * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
     * @this {SDK.ServiceWorkerCacheModel}
     */
    function deleteAndSaveOldCaches(cache) {
      if (cache.securityOrigin === securityOrigin && !updatingCachesIds.has(cache.cacheId)) {
        oldCaches.set(cache.cacheId, cache);
        this._caches.delete(cache.cacheId);
      }
    }

    /** @type {!Set<string>} */
    const updatingCachesIds = new Set();
    /** @type {!Map<string, !SDK.ServiceWorkerCacheModel.Cache>} */
    const newCaches = new Map();
    /** @type {!Map<string, !SDK.ServiceWorkerCacheModel.Cache>} */
    const oldCaches = new Map();

    for (const cacheJson of cachesJson) {
      const cache =
          new SDK.ServiceWorkerCacheModel.Cache(this, cacheJson.securityOrigin, cacheJson.cacheName, cacheJson.cacheId);
      updatingCachesIds.add(cache.cacheId);
      if (this._caches.has(cache.cacheId))
        continue;
      newCaches.set(cache.cacheId, cache);
      this._caches.set(cache.cacheId, cache);
    }
    this._caches.forEach(deleteAndSaveOldCaches, this);
    newCaches.forEach(this._cacheAdded, this);
    oldCaches.forEach(this._cacheRemoved, this);
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
   * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
   */
  _cacheAdded(cache) {
    this.dispatchEventToListeners(SDK.ServiceWorkerCacheModel.Events.CacheAdded, {model: this, cache: cache});
  }

  /**
   * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
   */
  _cacheRemoved(cache) {
    this.dispatchEventToListeners(SDK.ServiceWorkerCacheModel.Events.CacheRemoved, {model: this, cache: cache});
  }

  /**
   * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
   * @param {number} skipCount
   * @param {number} pageSize
   * @param {string} pathFilter
   * @param {function(!Array<!Protocol.CacheStorage.DataEntry>, boolean)} callback
   */
  async _requestEntries(cache, skipCount, pageSize, pathFilter, callback) {
    const response =
        await this._cacheAgent.invoke_requestEntries({cacheId: cache.cacheId, skipCount, pageSize, pathFilter});
    if (response[Protocol.Error]) {
      console.error('ServiceWorkerCacheAgent error while requesting entries: ', response[Protocol.Error]);
      return;
    }
    callback(response.cacheDataEntries, response.hasMore);
  }

  /**
   * @param {string} origin
   * @override
   */
  cacheStorageListUpdated(origin) {
    this._originsUpdated.add(origin);

    this._throttler.schedule(() => {
      const promises = Array.from(this._originsUpdated, origin => this._loadCacheNames(origin));
      this._originsUpdated.clear();
      return Promise.all(promises);
    });
  }

  /**
   * @param {string} origin
   * @param {string} cacheName
   * @override
   */
  cacheStorageContentUpdated(origin, cacheName) {
    this.dispatchEventToListeners(
        SDK.ServiceWorkerCacheModel.Events.CacheStorageContentUpdated, {origin: origin, cacheName: cacheName});
  }

  /**
   * @param {string} origin
   * @override
   */
  indexedDBListUpdated(origin) {
  }

  /**
   * @param {string} origin
   * @param {string} databaseName
   * @param {string} objectStoreName
   * @override
   */
  indexedDBContentUpdated(origin, databaseName, objectStoreName) {
  }
};

SDK.SDKModel.register(SDK.ServiceWorkerCacheModel, SDK.Target.Capability.Browser, false);

/** @enum {symbol} */
SDK.ServiceWorkerCacheModel.Events = {
  CacheAdded: Symbol('CacheAdded'),
  CacheRemoved: Symbol('CacheRemoved'),
  CacheStorageContentUpdated: Symbol('CacheStorageContentUpdated')
};

/**
 * @unrestricted
 */
SDK.ServiceWorkerCacheModel.Cache = class {
  /**
   * @param {!SDK.ServiceWorkerCacheModel} model
   * @param {string} securityOrigin
   * @param {string} cacheName
   * @param {string} cacheId
   */
  constructor(model, securityOrigin, cacheName, cacheId) {
    this._model = model;
    this.securityOrigin = securityOrigin;
    this.cacheName = cacheName;
    this.cacheId = cacheId;
  }

  /**
   * @param {!SDK.ServiceWorkerCacheModel.Cache} cache
   * @return {boolean}
   */
  equals(cache) {
    return this.cacheId === cache.cacheId;
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return this.securityOrigin + this.cacheName;
  }

  /**
   * @param {string} url
   * @return {!Promise<?Protocol.CacheStorage.CachedResponse>}
   */
  requestCachedResponse(url) {
    return this._model._cacheAgent.requestCachedResponse(this.cacheId, url);
  }
};
