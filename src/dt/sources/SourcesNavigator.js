/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY GOOGLE INC. AND ITS CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GOOGLE INC.
 * OR ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
Sources.NetworkNavigatorView = class extends Sources.NavigatorView {
  constructor() {
    super();
    SDK.targetManager.addEventListener(SDK.TargetManager.Events.InspectedURLChanged, this._inspectedURLChanged, this);
  }

  /**
   * @override
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  acceptProject(project) {
    return project.type() === Workspace.projectTypes.Network;
  }

  /**
   * @param {!Common.Event} event
   */
  _inspectedURLChanged(event) {
    const mainTarget = SDK.targetManager.mainTarget();
    if (event.data !== mainTarget)
      return;
    const inspectedURL = mainTarget && mainTarget.inspectedURL();
    if (!inspectedURL)
      return;
    for (const uiSourceCode of this.workspace().uiSourceCodes()) {
      if (this.acceptProject(uiSourceCode.project()) && uiSourceCode.url() === inspectedURL)
        this.revealUISourceCode(uiSourceCode, true);
    }
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  uiSourceCodeAdded(uiSourceCode) {
    const mainTarget = SDK.targetManager.mainTarget();
    const inspectedURL = mainTarget && mainTarget.inspectedURL();
    if (!inspectedURL)
      return;
    if (uiSourceCode.url() === inspectedURL)
      this.revealUISourceCode(uiSourceCode, true);
  }
};

/**
 * @unrestricted
 */
Sources.FilesNavigatorView = class extends Sources.NavigatorView {
  constructor() {
    super();
    const toolbar = new UI.Toolbar('navigator-toolbar');
    toolbar.appendItemsAtLocation('files-navigator-toolbar').then(() => {
      if (!toolbar.empty())
        this.contentElement.insertBefore(toolbar.element, this.contentElement.firstChild);
    });
  }

  /**
   * @override
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  acceptProject(project) {
    return project.type() === Workspace.projectTypes.FileSystem &&
        Persistence.FileSystemWorkspaceBinding.fileSystemType(project) !== 'overrides' &&
        !Snippets.isSnippetsProject(project);
  }

  /**
   * @override
   * @param {!Event} event
   */
  handleContextMenu(event) {
    const contextMenu = new UI.ContextMenu(event);
    contextMenu.defaultSection().appendAction('sources.add-folder-to-workspace', undefined, true);
    contextMenu.show();
  }
};

Sources.OverridesNavigatorView = class extends Sources.NavigatorView {
  constructor() {
    super();
    this._toolbar = new UI.Toolbar('navigator-toolbar');

    this.contentElement.insertBefore(this._toolbar.element, this.contentElement.lastChild);

    Persistence.networkPersistenceManager.addEventListener(
        Persistence.NetworkPersistenceManager.Events.ProjectChanged, this._updateProjectAndUI, this);
    this.workspace().addEventListener(Workspace.Workspace.Events.ProjectAdded, this._onProjectAddOrRemoved, this);
    this.workspace().addEventListener(Workspace.Workspace.Events.ProjectRemoved, this._onProjectAddOrRemoved, this);
    this._updateProjectAndUI();
  }

  /**
   * @param {!Common.Event} event
   */
  _onProjectAddOrRemoved(event) {
    const project = /** @type {!Workspace.Project} */ (event.data);
    if (project && project.type() === Workspace.projectTypes.FileSystem &&
        Persistence.FileSystemWorkspaceBinding.fileSystemType(project) !== 'overrides')
      return;
    this._updateUI();
  }

  _updateProjectAndUI() {
    this.reset();
    const project = Persistence.networkPersistenceManager.project();
    if (project)
      this.tryAddProject(project);
    this._updateUI();
  }

  _updateUI() {
    this._toolbar.removeToolbarItems();
    const project = Persistence.networkPersistenceManager.project();
    if (project) {
      const enableCheckbox =
          new UI.ToolbarSettingCheckbox(Common.settings.moduleSetting('persistenceNetworkOverridesEnabled'));
      this._toolbar.appendToolbarItem(enableCheckbox);

      this._toolbar.appendToolbarItem(new UI.ToolbarSeparator(true));
      const clearButton = new UI.ToolbarButton(Common.UIString('Clear configuration'), 'largeicon-clear');
      clearButton.addEventListener(UI.ToolbarButton.Events.Click, () => {
        project.remove();
      });
      this._toolbar.appendToolbarItem(clearButton);
      return;
    }
    const title = Common.UIString('Select folder for overrides');
    const setupButton = new UI.ToolbarButton(title, 'largeicon-add', title);
    setupButton.addEventListener(UI.ToolbarButton.Events.Click, this._setupNewWorkspace, this);
    this._toolbar.appendToolbarItem(setupButton);
  }

  async _setupNewWorkspace() {
    const fileSystem = await Persistence.isolatedFileSystemManager.addFileSystem('overrides');
    if (!fileSystem)
      return;
    Common.settings.moduleSetting('persistenceNetworkOverridesEnabled').set(true);
  }

  /**
   * @override
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  acceptProject(project) {
    return project === Persistence.networkPersistenceManager.project();
  }
};

/**
 * @unrestricted
 */
Sources.ContentScriptsNavigatorView = class extends Sources.NavigatorView {
  constructor() {
    super();
  }

  /**
   * @override
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  acceptProject(project) {
    return project.type() === Workspace.projectTypes.ContentScripts;
  }
};

/**
 * @unrestricted
 */
Sources.SnippetsNavigatorView = class extends Sources.NavigatorView {
  constructor() {
    super();
    const toolbar = new UI.Toolbar('navigator-toolbar');
    const newButton = new UI.ToolbarButton('', 'largeicon-add', Common.UIString('New snippet'));
    newButton.addEventListener(UI.ToolbarButton.Events.Click, () => this.create(Snippets.project, ''));
    toolbar.appendToolbarItem(newButton);
    this.contentElement.insertBefore(toolbar.element, this.contentElement.firstChild);
  }

  /**
   * @override
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  acceptProject(project) {
    return Snippets.isSnippetsProject(project);
  }

  /**
   * @override
   * @param {!Event} event
   */
  handleContextMenu(event) {
    const contextMenu = new UI.ContextMenu(event);
    contextMenu.headerSection().appendItem(Common.UIString('New'), () => this.create(Snippets.project, ''));
    contextMenu.show();
  }

  /**
   * @override
   * @param {!Event} event
   * @param {!Sources.NavigatorUISourceCodeTreeNode} node
   */
  handleFileContextMenu(event, node) {
    const uiSourceCode = node.uiSourceCode();
    const contextMenu = new UI.ContextMenu(event);
    contextMenu.headerSection().appendItem(Common.UIString('Run'), () => Snippets.evaluateScriptSnippet(uiSourceCode));
    contextMenu.editSection().appendItem(Common.UIString('Rename\u2026'), () => this.rename(node, false));
    contextMenu.editSection().appendItem(
        Common.UIString('Remove'), () => uiSourceCode.project().deleteFile(uiSourceCode));
    contextMenu.saveSection().appendItem(Common.UIString('Save as...'), this._handleSaveAs.bind(this, uiSourceCode));
    contextMenu.show();
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  async _handleSaveAs(uiSourceCode) {
    uiSourceCode.commitWorkingCopy();
    const content = await uiSourceCode.requestContent();
    Workspace.fileManager.save(uiSourceCode.url(), content, true);
    Workspace.fileManager.close(uiSourceCode.url());
  }
};

/**
 * @implements {UI.ActionDelegate}
 */
Sources.ActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    switch (actionId) {
      case 'sources.create-snippet':
        Snippets.project.createFile('', null, '').then(uiSourceCode => Common.Revealer.reveal(uiSourceCode));
        return true;
      case 'sources.add-folder-to-workspace':
        Persistence.isolatedFileSystemManager.addFileSystem();
        return true;
    }
    return false;
  }
};
