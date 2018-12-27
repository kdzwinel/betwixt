// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
Sources.JavaScriptCompilerPlugin = class extends Sources.UISourceCodeFrame.Plugin {
  /**
   * @param {!SourceFrame.SourcesTextEditor} textEditor
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  constructor(textEditor, uiSourceCode) {
    super();
    this._textEditor = textEditor;
    this._uiSourceCode = uiSourceCode;
    this._compiling = false;
    this._recompileScheduled = false;
    /** @type {?number} */
    this._timeout = null;
    /** @type {?Workspace.UISourceCode.Message} */
    this._message = null;
    this._disposed = false;

    this._textEditor.addEventListener(UI.TextEditor.Events.TextChanged, this._scheduleCompile, this);
    if (this._uiSourceCode.hasCommits() || this._uiSourceCode.isDirty())
      this._scheduleCompile();
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  static accepts(uiSourceCode) {
    if (uiSourceCode.extension() === 'js')
      return true;
    if (Snippets.isSnippetsUISourceCode(uiSourceCode))
      return true;
    for (const debuggerModel of SDK.targetManager.models(SDK.DebuggerModel)) {
      if (Bindings.debuggerWorkspaceBinding.scriptFile(uiSourceCode, debuggerModel))
        return true;
    }
    return false;
  }

  _scheduleCompile() {
    if (this._compiling) {
      this._recompileScheduled = true;
      return;
    }
    if (this._timeout)
      clearTimeout(this._timeout);
    this._timeout = setTimeout(this._compile.bind(this), Sources.JavaScriptCompilerPlugin.CompileDelay);
  }

  /**
   * @return {?SDK.RuntimeModel}
   */
  _findRuntimeModel() {
    const debuggerModels = SDK.targetManager.models(SDK.DebuggerModel);
    for (let i = 0; i < debuggerModels.length; ++i) {
      const scriptFile = Bindings.debuggerWorkspaceBinding.scriptFile(this._uiSourceCode, debuggerModels[i]);
      if (scriptFile)
        return debuggerModels[i].runtimeModel();
    }
    return SDK.targetManager.mainTarget() ? SDK.targetManager.mainTarget().model(SDK.RuntimeModel) : null;
  }

  async _compile() {
    const runtimeModel = this._findRuntimeModel();
    if (!runtimeModel)
      return;
    const currentExecutionContext = UI.context.flavor(SDK.ExecutionContext);
    if (!currentExecutionContext)
      return;

    const code = this._textEditor.text();
    if (code.length > 1024 * 100)
      return;

    this._compiling = true;
    const result = await runtimeModel.compileScript(code, '', false, currentExecutionContext.id);

    this._compiling = false;
    if (this._recompileScheduled) {
      this._recompileScheduled = false;
      this._scheduleCompile();
      return;
    }
    if (this._message)
      this._uiSourceCode.removeMessage(this._message);
    if (this._disposed || !result || !result.exceptionDetails)
      return;

    const exceptionDetails = result.exceptionDetails;
    const text = SDK.RuntimeModel.simpleTextFromException(exceptionDetails);
    this._message = this._uiSourceCode.addLineMessage(
        Workspace.UISourceCode.Message.Level.Error, text, exceptionDetails.lineNumber, exceptionDetails.columnNumber);
    this._compilationFinishedForTest();
  }

  _compilationFinishedForTest() {
  }

  /**
   * @override
   */
  dispose() {
    this._textEditor.removeEventListener(UI.TextEditor.Events.TextChanged, this._scheduleCompile, this);
    if (this._message)
      this._uiSourceCode.removeMessage(this._message);
    this._disposed = true;
    if (this._timeout)
      clearTimeout(this._timeout);
  }
};

Sources.JavaScriptCompilerPlugin.CompileDelay = 1000;
