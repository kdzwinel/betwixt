// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @template T
 */
SDK.SourceMapManager = class extends Common.Object {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super();

    this._target = target;
    this._isEnabled = true;

    /** @type {!Map<!T, string>} */
    this._relativeSourceURL = new Map();
    /** @type {!Map<!T, string>} */
    this._relativeSourceMapURL = new Map();
    /** @type {!Map<!T, string>} */
    this._resolvedSourceMapURL = new Map();

    /** @type {!Map<string, !SDK.SourceMap>} */
    this._sourceMapByURL = new Map();
    /** @type {!Multimap<string, !T>} */
    this._sourceMapURLToLoadingClients = new Multimap();
    /** @type {!Multimap<string, !T>} */
    this._sourceMapURLToClients = new Multimap();

    SDK.targetManager.addEventListener(SDK.TargetManager.Events.InspectedURLChanged, this._inspectedURLChanged, this);
  }

  /**
   * @param {boolean} isEnabled
   */
  setEnabled(isEnabled) {
    if (isEnabled === this._isEnabled)
      return;
    this._isEnabled = isEnabled;
    const clients = Array.from(this._resolvedSourceMapURL.keys());
    for (const client of clients) {
      const relativeSourceURL = this._relativeSourceURL.get(client);
      const relativeSourceMapURL = this._relativeSourceMapURL.get(client);
      this.detachSourceMap(client);
      this.attachSourceMap(client, relativeSourceURL, relativeSourceMapURL);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _inspectedURLChanged(event) {
    if (event.data !== this._target)
      return;

    const clients = Array.from(this._resolvedSourceMapURL.keys());
    for (const client of clients) {
      const relativeSourceURL = this._relativeSourceURL.get(client);
      const relativeSourceMapURL = this._relativeSourceMapURL.get(client);
      const resolvedSourceMapURL = this._resolvedSourceMapURL.get(client);
      const sourceMapURL = this._resolveRelativeURLs(relativeSourceURL, relativeSourceMapURL).sourceMapURL;
      if (sourceMapURL !== resolvedSourceMapURL) {
        this.detachSourceMap(client);
        this.attachSourceMap(client, relativeSourceURL, relativeSourceMapURL);
      }
    }
  }

  /**
   * @param {!T} client
   * @return {?SDK.SourceMap}
   */
  sourceMapForClient(client) {
    const sourceMapURL = this._resolvedSourceMapURL.get(client);
    return sourceMapURL ? this._sourceMapByURL.get(sourceMapURL) || null : null;
  }

  /**
   * @param {!SDK.SourceMap} sourceMap
   * @return {!Array<!T>}
   */
  clientsForSourceMap(sourceMap) {
    if (this._sourceMapURLToClients.has(sourceMap.url()))
      return this._sourceMapURLToClients.get(sourceMap.url()).valuesArray();
    return this._sourceMapURLToLoadingClients.get(sourceMap.url()).valuesArray();
  }

  /**
   * @param {!SDK.SourceMap.EditResult} editResult
   */
  applySourceMapEdit(editResult) {
    console.assert(
        this._sourceMapByURL.has(editResult.map.url()), 'Cannot apply edit result for non-existing source map');
    this._sourceMapByURL.set(editResult.map.url(), editResult.map);
    this.dispatchEventToListeners(
        SDK.SourceMapManager.Events.SourceMapChanged, {sourceMap: editResult.map, newSources: editResult.newSources});
  }

  /**
   * @param {string} sourceURL
   * @param {string} sourceMapURL
   * @return {!{sourceURL: ?string, sourceMapURL: ?string}}
   */
  _resolveRelativeURLs(sourceURL, sourceMapURL) {
    // |sourceURL| can be a random string, but is generally an absolute path.
    // Complete it to inspected page url for relative links.
    const resolvedSourceURL = Common.ParsedURL.completeURL(this._target.inspectedURL(), sourceURL);
    const resolvedSourceMapURL =
        resolvedSourceURL ? Common.ParsedURL.completeURL(resolvedSourceURL, sourceMapURL) : null;
    return {sourceURL: resolvedSourceURL, sourceMapURL: resolvedSourceMapURL};
  }

  /**
   * @param {!T} client
   * @param {string} sourceURL
   * @param {?string} sourceMapURL
   */
  attachSourceMap(client, sourceURL, sourceMapURL) {
    if (!sourceMapURL)
      return;
    console.assert(!this._resolvedSourceMapURL.has(client), 'SourceMap is already attached to client');
    const resolvedURLs = this._resolveRelativeURLs(sourceURL, sourceMapURL);
    if (!resolvedURLs.sourceURL || !resolvedURLs.sourceMapURL)
      return;
    this._relativeSourceURL.set(client, sourceURL);
    this._relativeSourceMapURL.set(client, sourceMapURL);
    this._resolvedSourceMapURL.set(client, resolvedURLs.sourceMapURL);

    sourceURL = resolvedURLs.sourceURL;
    sourceMapURL = resolvedURLs.sourceMapURL;
    if (!this._isEnabled)
      return;

    this.dispatchEventToListeners(SDK.SourceMapManager.Events.SourceMapWillAttach, client);

    if (this._sourceMapByURL.has(sourceMapURL)) {
      attach.call(this, sourceMapURL, client);
      return;
    }
    if (!this._sourceMapURLToLoadingClients.has(sourceMapURL)) {
      SDK.TextSourceMap.load(sourceMapURL, sourceURL)
          .then(onSourceMap.bind(this, sourceMapURL));
    }
    this._sourceMapURLToLoadingClients.set(sourceMapURL, client);

    /**
     * @param {string} sourceMapURL
     * @param {?SDK.SourceMap} sourceMap
     * @this {SDK.SourceMapManager}
     */
    function onSourceMap(sourceMapURL, sourceMap) {
      this._sourceMapLoadedForTest();
      const clients = this._sourceMapURLToLoadingClients.get(sourceMapURL);
      this._sourceMapURLToLoadingClients.deleteAll(sourceMapURL);
      if (!clients.size)
        return;
      if (!sourceMap) {
        for (const client of clients)
          this.dispatchEventToListeners(SDK.SourceMapManager.Events.SourceMapFailedToAttach, client);
        return;
      }
      this._sourceMapByURL.set(sourceMapURL, sourceMap);
      for (const client of clients)
        attach.call(this, sourceMapURL, client);
    }

    /**
     * @param {string} sourceMapURL
     * @param {!T} client
     * @this {SDK.SourceMapManager}
     */
    function attach(sourceMapURL, client) {
      this._sourceMapURLToClients.set(sourceMapURL, client);
      const sourceMap = this._sourceMapByURL.get(sourceMapURL);
      this.dispatchEventToListeners(
          SDK.SourceMapManager.Events.SourceMapAttached, {client: client, sourceMap: sourceMap});
    }
  }

  /**
   * @param {!T} client
   */
  detachSourceMap(client) {
    const sourceMapURL = this._resolvedSourceMapURL.get(client);
    this._relativeSourceURL.delete(client);
    this._relativeSourceMapURL.delete(client);
    this._resolvedSourceMapURL.delete(client);

    if (!sourceMapURL)
      return;
    if (!this._sourceMapURLToClients.hasValue(sourceMapURL, client)) {
      if (this._sourceMapURLToLoadingClients.delete(sourceMapURL, client))
        this.dispatchEventToListeners(SDK.SourceMapManager.Events.SourceMapFailedToAttach, client);
      return;
    }
    this._sourceMapURLToClients.delete(sourceMapURL, client);
    const sourceMap = this._sourceMapByURL.get(sourceMapURL);
    if (!this._sourceMapURLToClients.has(sourceMapURL))
      this._sourceMapByURL.delete(sourceMapURL);
    this.dispatchEventToListeners(
        SDK.SourceMapManager.Events.SourceMapDetached, {client: client, sourceMap: sourceMap});
  }

  _sourceMapLoadedForTest() {
  }

  dispose() {
    SDK.targetManager.removeEventListener(
        SDK.TargetManager.Events.InspectedURLChanged, this._inspectedURLChanged, this);
  }
};

SDK.SourceMapManager.Events = {
  SourceMapWillAttach: Symbol('SourceMapWillAttach'),
  SourceMapFailedToAttach: Symbol('SourceMapFailedToAttach'),
  SourceMapAttached: Symbol('SourceMapAttached'),
  SourceMapDetached: Symbol('SourceMapDetached'),
  SourceMapChanged: Symbol('SourceMapChanged')
};
