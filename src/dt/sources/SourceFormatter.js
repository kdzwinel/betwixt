// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Sources.SourceFormatData = class {
  /**
   * @param {!Workspace.UISourceCode} originalSourceCode
   * @param {!Workspace.UISourceCode} formattedSourceCode
   * @param {!Formatter.FormatterSourceMapping} mapping
   */
  constructor(originalSourceCode, formattedSourceCode, mapping) {
    this.originalSourceCode = originalSourceCode;
    this.formattedSourceCode = formattedSourceCode;
    this.mapping = mapping;
  }

  originalPath() {
    return this.originalSourceCode.project().id() + ':' + this.originalSourceCode.url();
  }

  /**
   * @param {!Object} object
   * @return {?Sources.SourceFormatData}
   */
  static _for(object) {
    return object[Sources.SourceFormatData._formatDataSymbol];
  }
};

Sources.SourceFormatData._formatDataSymbol = Symbol('formatData');

Sources.SourceFormatter = class {
  constructor() {
    this._projectId = 'formatter:';
    this._project = new Bindings.ContentProviderBasedProject(
        Workspace.workspace, this._projectId, Workspace.projectTypes.Formatter, 'formatter',
        true /* isServiceProject */);

    /** @type {!Map<!Workspace.UISourceCode, !{promise: !Promise<!Sources.SourceFormatData>, formatData: ?Sources.SourceFormatData}>} */
    this._formattedSourceCodes = new Map();
    this._scriptMapping = new Sources.SourceFormatter.ScriptMapping();
    this._styleMapping = new Sources.SourceFormatter.StyleMapping();
    Workspace.workspace.addEventListener(
        Workspace.Workspace.Events.UISourceCodeRemoved, this._onUISourceCodeRemoved, this);
  }

  /**
   * @param {!Common.Event} event
   */
  _onUISourceCodeRemoved(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    const cacheEntry = this._formattedSourceCodes.get(uiSourceCode);
    if (cacheEntry && cacheEntry.formatData)
      this._discardFormatData(cacheEntry.formatData);
    this._formattedSourceCodes.remove(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} formattedUISourceCode
   * @return {?Workspace.UISourceCode}
   */
  discardFormattedUISourceCode(formattedUISourceCode) {
    const formatData = Sources.SourceFormatData._for(formattedUISourceCode);
    if (!formatData)
      return null;
    this._discardFormatData(formatData);
    this._formattedSourceCodes.remove(formatData.originalSourceCode);
    return formatData.originalSourceCode;
  }

  /**
   * @param {!Sources.SourceFormatData} formatData
   */
  _discardFormatData(formatData) {
    delete formatData.formattedSourceCode[Sources.SourceFormatData._formatDataSymbol];
    this._scriptMapping._setSourceMappingEnabled(formatData, false);
    this._styleMapping._setSourceMappingEnabled(formatData, false);
    this._project.removeFile(formatData.formattedSourceCode.url());
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  hasFormatted(uiSourceCode) {
    return this._formattedSourceCodes.has(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Promise<!Sources.SourceFormatData>}
   */
  async format(uiSourceCode) {
    const cacheEntry = this._formattedSourceCodes.get(uiSourceCode);
    if (cacheEntry)
      return cacheEntry.promise;

    let fulfillFormatPromise;
    const resultPromise = new Promise(fulfill => {
      fulfillFormatPromise = fulfill;
    });
    this._formattedSourceCodes.set(uiSourceCode, {promise: resultPromise, formatData: null});
    const content = await uiSourceCode.requestContent();
    // ------------ ASYNC ------------
    Formatter.Formatter.format(
        uiSourceCode.contentType(), uiSourceCode.mimeType(), content || '', formatDone.bind(this));
    return resultPromise;

    /**
     * @this Sources.SourceFormatter
     * @param {string} formattedContent
     * @param {!Formatter.FormatterSourceMapping} formatterMapping
     */
    function formatDone(formattedContent, formatterMapping) {
      const cacheEntry = this._formattedSourceCodes.get(uiSourceCode);
      if (!cacheEntry || cacheEntry.promise !== resultPromise)
        return;
      let formattedURL;
      let count = 0;
      let suffix = '';
      do {
        formattedURL = `${uiSourceCode.url()}:formatted${suffix}`;
        suffix = `:${count++}`;
      } while (this._project.uiSourceCodeForURL(formattedURL));
      const contentProvider =
          Common.StaticContentProvider.fromString(formattedURL, uiSourceCode.contentType(), formattedContent);
      const formattedUISourceCode =
          this._project.addContentProvider(formattedURL, contentProvider, uiSourceCode.mimeType());
      const formatData = new Sources.SourceFormatData(uiSourceCode, formattedUISourceCode, formatterMapping);
      formattedUISourceCode[Sources.SourceFormatData._formatDataSymbol] = formatData;
      this._scriptMapping._setSourceMappingEnabled(formatData, true);
      this._styleMapping._setSourceMappingEnabled(formatData, true);
      cacheEntry.formatData = formatData;

      for (const decoration of uiSourceCode.allDecorations()) {
        const range = decoration.range();
        const startLocation = formatterMapping.originalToFormatted(range.startLine, range.startColumn);
        const endLocation = formatterMapping.originalToFormatted(range.endLine, range.endColumn);

        formattedUISourceCode.addDecoration(
            new TextUtils.TextRange(startLocation[0], startLocation[1], endLocation[0], endLocation[1]),
            /** @type {string} */ (decoration.type()), decoration.data());
      }

      fulfillFormatPromise(formatData);
    }
  }
};

/**
 * @implements {Bindings.DebuggerSourceMapping}
 */
Sources.SourceFormatter.ScriptMapping = class {
  constructor() {
    Bindings.debuggerWorkspaceBinding.addSourceMapping(this);
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel.Location} rawLocation
   * @return {?Workspace.UILocation}
   */
  rawLocationToUILocation(rawLocation) {
    const script = rawLocation.script();
    const formatData = script && Sources.SourceFormatData._for(script);
    if (!formatData)
      return null;
    const lineNumber = rawLocation.lineNumber;
    const columnNumber = rawLocation.columnNumber || 0;
    const formattedLocation = formatData.mapping.originalToFormatted(lineNumber, columnNumber);
    return formatData.formattedSourceCode.uiLocation(formattedLocation[0], formattedLocation[1]);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {!Array<!SDK.DebuggerModel.Location>}
   */
  uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
    const formatData = Sources.SourceFormatData._for(uiSourceCode);
    if (!formatData)
      return [];
    const originalLocation = formatData.mapping.formattedToOriginal(lineNumber, columnNumber);
    const scripts = this._scriptsForUISourceCode(formatData.originalSourceCode);
    if (!scripts.length)
      return [];
    return scripts.map(
        script => script.debuggerModel.createRawLocation(script, originalLocation[0], originalLocation[1]));
  }

  /**
   * @param {!Sources.SourceFormatData} formatData
   * @param {boolean} enabled
   */
  _setSourceMappingEnabled(formatData, enabled) {
    const scripts = this._scriptsForUISourceCode(formatData.originalSourceCode);
    if (!scripts.length)
      return;
    if (enabled) {
      for (const script of scripts)
        script[Sources.SourceFormatData._formatDataSymbol] = formatData;
    } else {
      for (const script of scripts)
        delete script[Sources.SourceFormatData._formatDataSymbol];
    }
    for (const script of scripts)
      Bindings.debuggerWorkspaceBinding.updateLocations(script);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Array<!SDK.Script>}
   */
  _scriptsForUISourceCode(uiSourceCode) {
    if (uiSourceCode.contentType() === Common.resourceTypes.Document) {
      const target = Bindings.NetworkProject.targetForUISourceCode(uiSourceCode);
      const debuggerModel = target && target.model(SDK.DebuggerModel);
      if (debuggerModel) {
        const scripts = debuggerModel.scriptsForSourceURL(uiSourceCode.url())
                            .filter(script => script.isInlineScript() && !script.hasSourceURL);
        return scripts;
      }
    }
    if (uiSourceCode.contentType().isScript()) {
      const rawLocations = Bindings.debuggerWorkspaceBinding.uiLocationToRawLocations(uiSourceCode, 0, 0);
      return rawLocations.map(location => location.script());
    }
    return [];
  }
};

/**
 * @implements {Bindings.CSSWorkspaceBinding.SourceMapping}
 */
Sources.SourceFormatter.StyleMapping = class {
  constructor() {
    Bindings.cssWorkspaceBinding.addSourceMapping(this);
    this._headersSymbol = Symbol('Sources.SourceFormatter.StyleMapping._headersSymbol');
  }

  /**
   * @override
   * @param {!SDK.CSSLocation} rawLocation
   * @return {?Workspace.UILocation}
   */
  rawLocationToUILocation(rawLocation) {
    const styleHeader = rawLocation.header();
    const formatData = styleHeader && Sources.SourceFormatData._for(styleHeader);
    if (!formatData)
      return null;
    const formattedLocation =
        formatData.mapping.originalToFormatted(rawLocation.lineNumber, rawLocation.columnNumber || 0);
    return formatData.formattedSourceCode.uiLocation(formattedLocation[0], formattedLocation[1]);
  }

  /**
   * @override
   * @param {!Workspace.UILocation} uiLocation
   * @return {!Array<!SDK.CSSLocation>}
   */
  uiLocationToRawLocations(uiLocation) {
    const formatData = Sources.SourceFormatData._for(uiLocation.uiSourceCode);
    if (!formatData)
      return [];
    const originalLocation = formatData.mapping.formattedToOriginal(uiLocation.lineNumber, uiLocation.columnNumber);
    const headers = formatData.originalSourceCode[this._headersSymbol];
    return headers.map(header => new SDK.CSSLocation(header, originalLocation[0], originalLocation[1]));
  }

  /**
   * @param {!Sources.SourceFormatData} formatData
   * @param {boolean} enable
   */
  _setSourceMappingEnabled(formatData, enable) {
    const original = formatData.originalSourceCode;
    const rawLocations = Bindings.cssWorkspaceBinding.uiLocationToRawLocations(original.uiLocation(0, 0));
    const headers = rawLocations.map(rawLocation => rawLocation.header()).filter(header => !!header);
    if (!headers.length)
      return;
    if (enable) {
      original[this._headersSymbol] = headers;
      headers.forEach(header => header[Sources.SourceFormatData._formatDataSymbol] = formatData);
    } else {
      original[this._headersSymbol] = null;
      headers.forEach(header => delete header[Sources.SourceFormatData._formatDataSymbol]);
    }
    headers.forEach(header => Bindings.cssWorkspaceBinding.updateLocations(header));
  }
};

Sources.sourceFormatter = new Sources.SourceFormatter();
