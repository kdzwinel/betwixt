// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Persistence.WorkspaceSettingsTab = class extends UI.VBox {
  constructor() {
    super();
    this.registerRequiredCSS('persistence/workspaceSettingsTab.css');

    const header = this.element.createChild('header');
    header.createChild('h3').createTextChild(Common.UIString('Workspace'));

    this.containerElement = this.element.createChild('div', 'settings-container-wrapper')
                                .createChild('div', 'settings-tab settings-content settings-container');

    Persistence.isolatedFileSystemManager.addEventListener(
        Persistence.IsolatedFileSystemManager.Events.FileSystemAdded,
        event => this._fileSystemAdded(/** @type {!Persistence.PlatformFileSystem} */ (event.data)), this);
    Persistence.isolatedFileSystemManager.addEventListener(
        Persistence.IsolatedFileSystemManager.Events.FileSystemRemoved,
        event => this._fileSystemRemoved(/** @type {!Persistence.PlatformFileSystem} */ (event.data)), this);

    const folderExcludePatternInput = this._createFolderExcludePatternInput();
    folderExcludePatternInput.classList.add('folder-exclude-pattern');
    this.containerElement.appendChild(folderExcludePatternInput);

    const div = this.containerElement.createChild('div', 'settings-info-message');
    div.createTextChild(Common.UIString('Mappings are inferred automatically.'));

    this._fileSystemsListContainer = this.containerElement.createChild('div', '');

    this.containerElement.appendChild(
        UI.createTextButton(Common.UIString('Add folder\u2026'), this._addFileSystemClicked.bind(this)));

    /** @type {!Map<string, !Element>} */
    this._elementByPath = new Map();

    /** @type {!Map<string, !Persistence.EditFileSystemView>} */
    this._mappingViewByPath = new Map();

    const fileSystems = Persistence.isolatedFileSystemManager.fileSystems();
    for (let i = 0; i < fileSystems.length; ++i)
      this._addItem(fileSystems[i]);
  }

  /**
   * @return {!Element}
   */
  _createFolderExcludePatternInput() {
    const p = createElement('p');
    const labelElement = p.createChild('label');
    labelElement.textContent = Common.UIString('Folder exclude pattern');
    const inputElement = UI.createInput('', 'text');
    p.appendChild(inputElement);
    inputElement.style.width = '270px';
    const folderExcludeSetting = Persistence.isolatedFileSystemManager.workspaceFolderExcludePatternSetting();
    const setValue =
        UI.bindInput(inputElement, folderExcludeSetting.set.bind(folderExcludeSetting), regexValidator, false);
    folderExcludeSetting.addChangeListener(() => setValue.call(null, folderExcludeSetting.get()));
    setValue(folderExcludeSetting.get());
    return p;

    /**
     * @param {string} value
     * @return {boolean}
     */
    function regexValidator(value) {
      let regex;
      try {
        regex = new RegExp(value);
      } catch (e) {
      }
      return !!regex;
    }
  }

  /**
   * @param {!Persistence.PlatformFileSystem} fileSystem
   */
  _addItem(fileSystem) {
    // Support managing only instances of IsolatedFileSystem.
    if (!(fileSystem instanceof Persistence.IsolatedFileSystem))
      return;
    const networkPersistenceProject = Persistence.networkPersistenceManager.project();
    if (networkPersistenceProject &&
        Persistence.isolatedFileSystemManager.fileSystem(networkPersistenceProject.fileSystemPath()) === fileSystem)
      return;
    const element = this._renderFileSystem(fileSystem);
    this._elementByPath.set(fileSystem.path(), element);

    this._fileSystemsListContainer.appendChild(element);

    const mappingView = new Persistence.EditFileSystemView(fileSystem.path());
    this._mappingViewByPath.set(fileSystem.path(), mappingView);
    mappingView.element.classList.add('file-system-mapping-view');
    mappingView.show(element);
  }

  /**
   * @param {!Persistence.PlatformFileSystem} fileSystem
   * @return {!Element}
   */
  _renderFileSystem(fileSystem) {
    const fileSystemPath = fileSystem.path();
    const lastIndexOfSlash = fileSystemPath.lastIndexOf(Host.isWin() ? '\\' : '/');
    const folderName = fileSystemPath.substr(lastIndexOfSlash + 1);

    const element = createElementWithClass('div', 'file-system-container');
    const header = element.createChild('div', 'file-system-header');

    header.createChild('div', 'file-system-name').textContent = folderName;
    const path = header.createChild('div', 'file-system-path');
    path.textContent = fileSystemPath;
    path.title = fileSystemPath;

    const toolbar = new UI.Toolbar('');
    const button = new UI.ToolbarButton(Common.UIString('Remove'), 'largeicon-delete');
    button.addEventListener(UI.ToolbarButton.Events.Click, this._removeFileSystemClicked.bind(this, fileSystem));
    toolbar.appendToolbarItem(button);
    header.appendChild(toolbar.element);

    return element;
  }

  /**
   * @param {!Persistence.PlatformFileSystem} fileSystem
   */
  _removeFileSystemClicked(fileSystem) {
    Persistence.isolatedFileSystemManager.removeFileSystem(fileSystem);
  }

  _addFileSystemClicked() {
    Persistence.isolatedFileSystemManager.addFileSystem();
  }

  /**
   * @param {!Persistence.PlatformFileSystem} fileSystem
   */
  _fileSystemAdded(fileSystem) {
    this._addItem(fileSystem);
  }

  /**
   * @param {!Persistence.PlatformFileSystem} fileSystem
   */
  _fileSystemRemoved(fileSystem) {
    const mappingView = this._mappingViewByPath.get(fileSystem.path());
    if (mappingView) {
      mappingView.dispose();
      this._mappingViewByPath.delete(fileSystem.path());
    }

    const element = this._elementByPath.get(fileSystem.path());
    if (element) {
      this._elementByPath.delete(fileSystem.path());
      element.remove();
    }
  }
};
