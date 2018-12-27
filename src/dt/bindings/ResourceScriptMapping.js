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
 * @implements {Bindings.DebuggerSourceMapping}
 * @unrestricted
 */
Bindings.ResourceScriptMapping = class {
  /**
   * @param {!SDK.DebuggerModel} debuggerModel
   * @param {!Workspace.Workspace} workspace
   * @param {!Bindings.DebuggerWorkspaceBinding} debuggerWorkspaceBinding
   */
  constructor(debuggerModel, workspace, debuggerWorkspaceBinding) {
    this._debuggerModel = debuggerModel;
    this._workspace = workspace;
    this._debuggerWorkspaceBinding = debuggerWorkspaceBinding;
    /** @type {!Map.<!Workspace.UISourceCode, !Bindings.ResourceScriptFile>} */
    this._uiSourceCodeToScriptFile = new Map();

    /** @type {!Map<string, !Bindings.ContentProviderBasedProject>} */
    this._projects = new Map();

    /** @type {!Set<!SDK.Script>} */
    this._acceptedScripts = new Set();
    const runtimeModel = debuggerModel.runtimeModel();
    this._eventListeners = [
      this._debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, this._parsedScriptSource, this),
      this._debuggerModel.addEventListener(
          SDK.DebuggerModel.Events.GlobalObjectCleared, this._globalObjectCleared, this),
      runtimeModel.addEventListener(
          SDK.RuntimeModel.Events.ExecutionContextDestroyed, this._executionContextDestroyed, this),
    ];
  }

  /**
   * @param {!SDK.Script} script
   * @return {!Bindings.ContentProviderBasedProject}
   */
  _project(script) {
    const frameId = script[Bindings.ResourceScriptMapping._frameIdSymbol];
    const prefix = script.isContentScript() ? 'js:extensions:' : 'js::';
    const projectId = prefix + this._debuggerModel.target().id() + ':' + frameId;
    let project = this._projects.get(projectId);
    if (!project) {
      const projectType =
          script.isContentScript() ? Workspace.projectTypes.ContentScripts : Workspace.projectTypes.Network;
      project = new Bindings.ContentProviderBasedProject(
          this._workspace, projectId, projectType, '' /* displayName */, false /* isServiceProject */);
      Bindings.NetworkProject.setTargetForProject(project, this._debuggerModel.target());
      this._projects.set(projectId, project);
    }
    return project;
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel.Location} rawLocation
   * @return {?Workspace.UILocation}
   */
  rawLocationToUILocation(rawLocation) {
    const script = rawLocation.script();
    if (!script)
      return null;
    const project = this._project(script);
    const uiSourceCode = project.uiSourceCodeForURL(script.sourceURL);
    if (!uiSourceCode)
      return null;
    const scriptFile = this._uiSourceCodeToScriptFile.get(uiSourceCode);
    if (!scriptFile)
      return null;
    if ((scriptFile.hasDivergedFromVM() && !scriptFile.isMergingToVM()) || scriptFile.isDivergingFromVM())
      return null;
    if (!scriptFile._hasScripts([script]))
      return null;
    const lineNumber = rawLocation.lineNumber - (script.isInlineScriptWithSourceURL() ? script.lineOffset : 0);
    let columnNumber = rawLocation.columnNumber || 0;
    if (script.isInlineScriptWithSourceURL() && !lineNumber && columnNumber)
      columnNumber -= script.columnOffset;
    return uiSourceCode.uiLocation(lineNumber, columnNumber);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {!Array<!SDK.DebuggerModel.Location>}
   */
  uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
    const scriptFile = this._uiSourceCodeToScriptFile.get(uiSourceCode);
    if (!scriptFile)
      return [];
    const script = scriptFile._script;
    if (script.isInlineScriptWithSourceURL()) {
      return [this._debuggerModel.createRawLocation(
          script, lineNumber + script.lineOffset, lineNumber ? columnNumber : columnNumber + script.columnOffset)];
    }
    return [this._debuggerModel.createRawLocation(script, lineNumber, columnNumber)];
  }

  /**
   * @param {!SDK.Script} script
   * @return {boolean}
   */
  _acceptsScript(script) {
    if (!script.sourceURL || script.isLiveEdit() || (script.isInlineScript() && !script.hasSourceURL))
      return false;
    // Filter out embedder injected content scripts.
    if (script.isContentScript() && !script.hasSourceURL) {
      const parsedURL = new Common.ParsedURL(script.sourceURL);
      if (!parsedURL.isValid)
        return false;
    }
    return true;
  }

  /**
   * @param {!Common.Event} event
   */
  _parsedScriptSource(event) {
    const script = /** @type {!SDK.Script} */ (event.data);
    if (!this._acceptsScript(script))
      return;
    this._acceptedScripts.add(script);
    const originalContentProvider = script.originalContentProvider();
    const frameId = Bindings.frameIdForScript(script);
    script[Bindings.ResourceScriptMapping._frameIdSymbol] = frameId;

    const url = script.sourceURL;
    const project = this._project(script);

    // Remove previous UISourceCode, if any
    const oldUISourceCode = project.uiSourceCodeForURL(url);
    if (oldUISourceCode) {
      const scriptFile = this._uiSourceCodeToScriptFile.get(oldUISourceCode);
      this._removeScript(scriptFile._script);
    }

    // Create UISourceCode.
    const uiSourceCode = project.createUISourceCode(url, originalContentProvider.contentType());
    Bindings.NetworkProject.setInitialFrameAttribution(uiSourceCode, frameId);
    const metadata = Bindings.metadataForURL(this._debuggerModel.target(), frameId, url);

    // Bind UISourceCode to scripts.
    const scriptFile = new Bindings.ResourceScriptFile(this, uiSourceCode, [script]);
    this._uiSourceCodeToScriptFile.set(uiSourceCode, scriptFile);

    project.addUISourceCodeWithProvider(uiSourceCode, originalContentProvider, metadata, 'text/javascript');
    this._debuggerWorkspaceBinding.updateLocations(script);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {?Bindings.ResourceScriptFile}
   */
  scriptFile(uiSourceCode) {
    return this._uiSourceCodeToScriptFile.get(uiSourceCode) || null;
  }

  /**
   * @param {!SDK.Script} script
   */
  _removeScript(script) {
    if (!this._acceptedScripts.has(script))
      return;
    this._acceptedScripts.delete(script);
    const project = this._project(script);
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (project.uiSourceCodeForURL(script.sourceURL));
    const scriptFile = this._uiSourceCodeToScriptFile.get(uiSourceCode);
    scriptFile.dispose();
    this._uiSourceCodeToScriptFile.delete(uiSourceCode);
    project.removeFile(script.sourceURL);
    this._debuggerWorkspaceBinding.updateLocations(script);
  }

  /**
   * @param {!Common.Event} event
   */
  _executionContextDestroyed(event) {
    const executionContext = /** @type {!SDK.ExecutionContext} */ (event.data);
    const scripts = this._debuggerModel.scriptsForExecutionContext(executionContext);
    for (const script of scripts)
      this._removeScript(script);
  }

  /**
   * @param {!Common.Event} event
   */
  _globalObjectCleared(event) {
    const scripts = Array.from(this._acceptedScripts);
    for (const script of scripts)
      this._removeScript(script);
  }

  resetForTest() {
    const scripts = Array.from(this._acceptedScripts);
    for (const script of scripts)
      this._removeScript(script);
  }

  dispose() {
    Common.EventTarget.removeEventListeners(this._eventListeners);
    const scripts = Array.from(this._acceptedScripts);
    for (const script of scripts)
      this._removeScript(script);
    for (const project of this._projects.values())
      project.removeProject();
    this._projects.clear();
  }
};

/**
 * @unrestricted
 */
Bindings.ResourceScriptFile = class extends Common.Object {
  /**
   * @param {!Bindings.ResourceScriptMapping} resourceScriptMapping
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {!Array.<!SDK.Script>} scripts
   */
  constructor(resourceScriptMapping, uiSourceCode, scripts) {
    super();
    console.assert(scripts.length);

    this._resourceScriptMapping = resourceScriptMapping;
    this._uiSourceCode = uiSourceCode;

    if (this._uiSourceCode.contentType().isScript())
      this._script = scripts[scripts.length - 1];

    this._uiSourceCode.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    this._uiSourceCode.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
  }

  /**
   * @param {!Array.<!SDK.Script>} scripts
   * @return {boolean}
   */
  _hasScripts(scripts) {
    return this._script && this._script === scripts[0];
  }

  /**
   * @return {boolean}
   */
  _isDiverged() {
    if (this._uiSourceCode.isDirty())
      return true;
    if (!this._script)
      return false;
    if (typeof this._scriptSource === 'undefined')
      return false;
    const workingCopy = this._uiSourceCode.workingCopy();
    if (!workingCopy)
      return false;

    // Match ignoring sourceURL.
    if (!workingCopy.startsWith(this._scriptSource.trimRight()))
      return true;
    const suffix = this._uiSourceCode.workingCopy().substr(this._scriptSource.length);
    return !!suffix.length && !suffix.match(SDK.Script.sourceURLRegex);
  }

  /**
   * @param {!Common.Event} event
   */
  _workingCopyChanged(event) {
    this._update();
  }

  /**
   * @param {!Common.Event} event
   */
  _workingCopyCommitted(event) {
    if (this._uiSourceCode.project().canSetFileContent())
      return;
    if (!this._script)
      return;
    const debuggerModel = this._resourceScriptMapping._debuggerModel;
    const breakpoints = Bindings.breakpointManager.breakpointLocationsForUISourceCode(this._uiSourceCode)
                            .map(breakpointLocation => breakpointLocation.breakpoint);
    const source = this._uiSourceCode.workingCopy();
    debuggerModel.setScriptSource(this._script.scriptId, source, scriptSourceWasSet.bind(this));

    /**
     * @param {?string} error
     * @param {!Protocol.Runtime.ExceptionDetails=} exceptionDetails
     * @this {Bindings.ResourceScriptFile}
     */
    async function scriptSourceWasSet(error, exceptionDetails) {
      if (!error && !exceptionDetails)
        this._scriptSource = source;
      this._update();

      if (!error && !exceptionDetails) {
        // Live edit can cause breakpoints to be in the wrong position, or to be lost altogether.
        // If any breakpoints were in the pre-live edit script, they need to be re-added.
        breakpoints.map(breakpoint => breakpoint.refreshInDebugger());
        return;
      }
      if (!exceptionDetails) {
        Common.console.addMessage(Common.UIString('LiveEdit failed: %s', error), Common.Console.MessageLevel.Warning);
        return;
      }
      const messageText = Common.UIString('LiveEdit compile failed: %s', exceptionDetails.text);
      this._uiSourceCode.addLineMessage(
          Workspace.UISourceCode.Message.Level.Error, messageText, exceptionDetails.lineNumber,
          exceptionDetails.columnNumber);
    }
  }

  _update() {
    if (this._isDiverged() && !this._hasDivergedFromVM)
      this._divergeFromVM();
    else if (!this._isDiverged() && this._hasDivergedFromVM)
      this._mergeToVM();
  }

  _divergeFromVM() {
    this._isDivergingFromVM = true;
    this._resourceScriptMapping._debuggerWorkspaceBinding.updateLocations(this._script);
    delete this._isDivergingFromVM;
    this._hasDivergedFromVM = true;
    this.dispatchEventToListeners(Bindings.ResourceScriptFile.Events.DidDivergeFromVM, this._uiSourceCode);
  }

  _mergeToVM() {
    delete this._hasDivergedFromVM;
    this._isMergingToVM = true;
    this._resourceScriptMapping._debuggerWorkspaceBinding.updateLocations(this._script);
    delete this._isMergingToVM;
    this.dispatchEventToListeners(Bindings.ResourceScriptFile.Events.DidMergeToVM, this._uiSourceCode);
  }

  /**
   * @return {boolean}
   */
  hasDivergedFromVM() {
    return this._hasDivergedFromVM;
  }

  /**
   * @return {boolean}
   */
  isDivergingFromVM() {
    return this._isDivergingFromVM;
  }

  /**
   * @return {boolean}
   */
  isMergingToVM() {
    return this._isMergingToVM;
  }

  checkMapping() {
    if (!this._script || typeof this._scriptSource !== 'undefined') {
      this._mappingCheckedForTest();
      return;
    }
    this._script.requestContent().then(callback.bind(this));

    /**
     * @param {?string} source
     * @this {Bindings.ResourceScriptFile}
     */
    function callback(source) {
      this._scriptSource = source;
      this._update();
      this._mappingCheckedForTest();
    }
  }

  _mappingCheckedForTest() {
  }

  dispose() {
    this._uiSourceCode.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._workingCopyChanged, this);
    this._uiSourceCode.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
  }

  /**
   * @param {string} sourceMapURL
   */
  addSourceMapURL(sourceMapURL) {
    if (!this._script)
      return;
    this._script.debuggerModel.setSourceMapURL(this._script, sourceMapURL);
  }

  /**
   * @return {boolean}
   */
  hasSourceMapURL() {
    return this._script && !!this._script.sourceMapURL;
  }
};

Bindings.ResourceScriptMapping._frameIdSymbol = Symbol('frameid');

/** @enum {symbol} */
Bindings.ResourceScriptFile.Events = {
  DidMergeToVM: Symbol('DidMergeToVM'),
  DidDivergeFromVM: Symbol('DidDivergeFromVM'),
};
