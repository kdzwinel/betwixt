/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
Resources.Database = class {
  /**
   * @param {!Resources.DatabaseModel} model
   * @param {string} id
   * @param {string} domain
   * @param {string} name
   * @param {string} version
   */
  constructor(model, id, domain, name, version) {
    this._model = model;
    this._id = id;
    this._domain = domain;
    this._name = name;
    this._version = version;
  }

  /** @return {string} */
  get id() {
    return this._id;
  }

  /** @return {string} */
  get name() {
    return this._name;
  }

  /** @param {string} x */
  set name(x) {
    this._name = x;
  }

  /** @return {string} */
  get version() {
    return this._version;
  }

  /** @param {string} x */
  set version(x) {
    this._version = x;
  }

  /** @return {string} */
  get domain() {
    return this._domain;
  }

  /** @param {string} x */
  set domain(x) {
    this._domain = x;
  }

  /**
   * @return {!Promise<!Array<string>>}
   */
  async tableNames() {
    const names = await this._model._agent.getDatabaseTableNames(this._id) || [];
    return names.sort();
  }

  /**
   * @param {string} query
   * @param {function(!Array.<string>=, !Array.<*>=)} onSuccess
   * @param {function(string)} onError
   */
  async executeSql(query, onSuccess, onError) {
    const response = await this._model._agent.invoke_executeSQL({'databaseId': this._id, 'query': query});
    const error = response[Protocol.Error];
    if (error) {
      onError(error);
      return;
    }
    const sqlError = response.sqlError;
    if (!sqlError) {
      onSuccess(response.columnNames, response.values);
      return;
    }
    let message;
    if (sqlError.message)
      message = sqlError.message;
    else if (sqlError.code === 2)
      message = Common.UIString('Database no longer has expected version.');
    else
      message = Common.UIString('An unexpected error %s occurred.', sqlError.code);
    onError(message);
  }
};

/**
 * @unrestricted
 */
Resources.DatabaseModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);

    this._databases = [];
    this._agent = target.databaseAgent();
    this.target().registerDatabaseDispatcher(new Resources.DatabaseDispatcher(this));
  }

  enable() {
    if (this._enabled)
      return;
    this._agent.enable();
    this._enabled = true;
  }

  disable() {
    if (!this._enabled)
      return;
    this._enabled = false;
    this._databases = [];
    this._agent.disable();
    this.dispatchEventToListeners(Resources.DatabaseModel.Events.DatabasesRemoved);
  }

  /**
   * @return {!Array.<!Resources.Database>}
   */
  databases() {
    const result = [];
    for (const database of this._databases)
      result.push(database);
    return result;
  }

  /**
   * @param {!Resources.Database} database
   */
  _addDatabase(database) {
    this._databases.push(database);
    this.dispatchEventToListeners(Resources.DatabaseModel.Events.DatabaseAdded, database);
  }
};

SDK.SDKModel.register(Resources.DatabaseModel, SDK.Target.Capability.None, false);

/** @enum {symbol} */
Resources.DatabaseModel.Events = {
  DatabaseAdded: Symbol('DatabaseAdded'),
  DatabasesRemoved: Symbol('DatabasesRemoved'),
};

/**
 * @implements {Protocol.DatabaseDispatcher}
 * @unrestricted
 */
Resources.DatabaseDispatcher = class {
  /**
   * @param {!Resources.DatabaseModel} model
   */
  constructor(model) {
    this._model = model;
  }

  /**
   * @override
   * @param {!Protocol.Database.Database} payload
   */
  addDatabase(payload) {
    this._model._addDatabase(
        new Resources.Database(this._model, payload.id, payload.domain, payload.name, payload.version));
  }
};

Resources.DatabaseModel._symbol = Symbol('DatabaseModel');
