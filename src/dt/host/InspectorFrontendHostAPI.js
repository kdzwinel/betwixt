// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/** @interface */
function InspectorFrontendHostAPI() {
}
window.InspectorFrontendHostAPI = InspectorFrontendHostAPI;
/** @typedef
{{
    type: string,
    id: (number|undefined),
    label: (string|undefined),
    enabled: (boolean|undefined),
    checked: (boolean|undefined),
    subItems: (!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>|undefined)
}} */
InspectorFrontendHostAPI.ContextMenuDescriptor;

/** @typedef
{{
    statusCode: number,
    headers: (!Object.<string, string>|undefined)
}} */
InspectorFrontendHostAPI.LoadNetworkResourceResult;

/** @enum {symbol} */
InspectorFrontendHostAPI.Events = {
  AddExtensions: Symbol('addExtensions'),
  AppendedToURL: Symbol('appendedToURL'),
  CanceledSaveURL: Symbol('canceledSaveURL'),
  ContextMenuCleared: Symbol('contextMenuCleared'),
  ContextMenuItemSelected: Symbol('contextMenuItemSelected'),
  DeviceCountUpdated: Symbol('deviceCountUpdated'),
  DevicesDiscoveryConfigChanged: Symbol('devicesDiscoveryConfigChanged'),
  DevicesPortForwardingStatusChanged: Symbol('devicesPortForwardingStatusChanged'),
  DevicesUpdated: Symbol('devicesUpdated'),
  DispatchMessage: Symbol('dispatchMessage'),
  DispatchMessageChunk: Symbol('dispatchMessageChunk'),
  EnterInspectElementMode: Symbol('enterInspectElementMode'),
  EyeDropperPickedColor: Symbol('eyeDropperPickedColor'),
  FileSystemsLoaded: Symbol('fileSystemsLoaded'),
  FileSystemRemoved: Symbol('fileSystemRemoved'),
  FileSystemAdded: Symbol('fileSystemAdded'),
  FileSystemFilesChangedAddedRemoved: Symbol('FileSystemFilesChangedAddedRemoved'),
  IndexingTotalWorkCalculated: Symbol('indexingTotalWorkCalculated'),
  IndexingWorked: Symbol('indexingWorked'),
  IndexingDone: Symbol('indexingDone'),
  KeyEventUnhandled: Symbol('keyEventUnhandled'),
  ReloadInspectedPage: Symbol('reloadInspectedPage'),
  RevealSourceLine: Symbol('revealSourceLine'),
  SavedURL: Symbol('savedURL'),
  SearchCompleted: Symbol('searchCompleted'),
  SetInspectedTabId: Symbol('setInspectedTabId'),
  SetUseSoftMenu: Symbol('setUseSoftMenu'),
  ShowPanel: Symbol('showPanel')
};

InspectorFrontendHostAPI.EventDescriptors = [
  [InspectorFrontendHostAPI.Events.AddExtensions, 'addExtensions', ['extensions']],
  [InspectorFrontendHostAPI.Events.AppendedToURL, 'appendedToURL', ['url']],
  [InspectorFrontendHostAPI.Events.CanceledSaveURL, 'canceledSaveURL', ['url']],
  [InspectorFrontendHostAPI.Events.ContextMenuCleared, 'contextMenuCleared', []],
  [InspectorFrontendHostAPI.Events.ContextMenuItemSelected, 'contextMenuItemSelected', ['id']],
  [InspectorFrontendHostAPI.Events.DeviceCountUpdated, 'deviceCountUpdated', ['count']],
  [InspectorFrontendHostAPI.Events.DevicesDiscoveryConfigChanged, 'devicesDiscoveryConfigChanged', ['config']],
  [
    InspectorFrontendHostAPI.Events.DevicesPortForwardingStatusChanged, 'devicesPortForwardingStatusChanged', ['status']
  ],
  [InspectorFrontendHostAPI.Events.DevicesUpdated, 'devicesUpdated', ['devices']],
  [InspectorFrontendHostAPI.Events.DispatchMessage, 'dispatchMessage', ['messageObject']],
  [InspectorFrontendHostAPI.Events.DispatchMessageChunk, 'dispatchMessageChunk', ['messageChunk', 'messageSize']],
  [InspectorFrontendHostAPI.Events.EnterInspectElementMode, 'enterInspectElementMode', []],
  [InspectorFrontendHostAPI.Events.EyeDropperPickedColor, 'eyeDropperPickedColor', ['color']],
  [InspectorFrontendHostAPI.Events.FileSystemsLoaded, 'fileSystemsLoaded', ['fileSystems']],
  [InspectorFrontendHostAPI.Events.FileSystemRemoved, 'fileSystemRemoved', ['fileSystemPath']],
  [InspectorFrontendHostAPI.Events.FileSystemAdded, 'fileSystemAdded', ['errorMessage', 'fileSystem']],
  [
    InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved, 'fileSystemFilesChangedAddedRemoved',
    ['changed', 'added', 'removed']
  ],
  [
    InspectorFrontendHostAPI.Events.IndexingTotalWorkCalculated, 'indexingTotalWorkCalculated',
    ['requestId', 'fileSystemPath', 'totalWork']
  ],
  [InspectorFrontendHostAPI.Events.IndexingWorked, 'indexingWorked', ['requestId', 'fileSystemPath', 'worked']],
  [InspectorFrontendHostAPI.Events.IndexingDone, 'indexingDone', ['requestId', 'fileSystemPath']],
  [InspectorFrontendHostAPI.Events.KeyEventUnhandled, 'keyEventUnhandled', ['event']],
  [InspectorFrontendHostAPI.Events.ReloadInspectedPage, 'reloadInspectedPage', ['hard']],
  [InspectorFrontendHostAPI.Events.RevealSourceLine, 'revealSourceLine', ['url', 'lineNumber', 'columnNumber']],
  [InspectorFrontendHostAPI.Events.SavedURL, 'savedURL', ['url', 'fileSystemPath']],
  [InspectorFrontendHostAPI.Events.SearchCompleted, 'searchCompleted', ['requestId', 'fileSystemPath', 'files']],
  [InspectorFrontendHostAPI.Events.SetInspectedTabId, 'setInspectedTabId', ['tabId']],
  [InspectorFrontendHostAPI.Events.SetUseSoftMenu, 'setUseSoftMenu', ['useSoftMenu']],
  [InspectorFrontendHostAPI.Events.ShowPanel, 'showPanel', ['panelName']]
];

InspectorFrontendHostAPI.prototype = {
  /**
   * @param {string=} type
   */
  addFileSystem(type) {},

  loadCompleted() {},

  /**
   * @param {number} requestId
   * @param {string} fileSystemPath
   * @param {string} excludedFolders
   */
  indexPath(requestId, fileSystemPath, excludedFolders) {},

  /**
   * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
   * @param {{x: number, y: number, width: number, height: number}} bounds
   */
  setInspectedPageBounds(bounds) {},

  /**
   * @param {!Array<string>} certChain
   */
  showCertificateViewer(certChain) {},

  /**
   * @param {string} shortcuts
   */
  setWhitelistedShortcuts(shortcuts) {},

  /**
   * @param {boolean} active
   */
  setEyeDropperActive(active) {},

  inspectElementCompleted() {},

  /**
   * @param {string} url
   */
  openInNewTab(url) {},

  /**
   * @param {string} fileSystemPath
   */
  showItemInFolder(fileSystemPath) {},

  /**
   * @param {string} fileSystemPath
   */
  removeFileSystem(fileSystemPath) {},

  requestFileSystems() {},

  /**
   * @param {string} url
   * @param {string} content
   * @param {boolean} forceSaveAs
   */
  save(url, content, forceSaveAs) {},

  /**
   * @param {string} url
   * @param {string} content
   */
  append(url, content) {},

  /**
   * @param {string} url
   */
  close(url) {},

  /**
   * @param {number} requestId
   * @param {string} fileSystemPath
   * @param {string} query
   */
  searchInPath(requestId, fileSystemPath, query) {},

  /**
   * @param {number} requestId
   */
  stopIndexing(requestId) {},

  bringToFront() {},

  closeWindow() {},

  copyText(text) {},

  /**
   * @param {string} url
   */
  inspectedURLChanged(url) {},

  /**
   * @param {string} fileSystemId
   * @param {string} registeredName
   * @return {?DOMFileSystem}
   */
  isolatedFileSystem(fileSystemId, registeredName) {},

  /**
   * @param {string} url
   * @param {string} headers
   * @param {number} streamId
   * @param {function(!InspectorFrontendHostAPI.LoadNetworkResourceResult)} callback
   */
  loadNetworkResource(url, headers, streamId, callback) {},

  /**
   * @param {function(!Object<string, string>)} callback
   */
  getPreferences(callback) {},

  /**
   * @param {string} name
   * @param {string} value
   */
  setPreference(name, value) {},

  /**
   * @param {string} name
   */
  removePreference(name) {},

  clearPreferences() {},

  /**
   * @param {!FileSystem} fileSystem
   */
  upgradeDraggedFileSystemPermissions(fileSystem) {},

  /**
   * @return {string}
   */
  platform() {},

  /**
   * @param {string} actionName
   * @param {number} actionCode
   * @param {number} bucketSize
   */
  recordEnumeratedHistogram(actionName, actionCode, bucketSize) {},

  /**
   * @param {string} message
   */
  sendMessageToBackend(message) {},

  /**
   * @param {!Adb.Config} config
   */
  setDevicesDiscoveryConfig(config) {},

  /**
   * @param {boolean} enabled
   */
  setDevicesUpdatesEnabled(enabled) {},

  /**
   * @param {string} pageId
   * @param {string} action
   */
  performActionOnRemotePage(pageId, action) {},

  /**
   * @param {string} browserId
   * @param {string} url
   */
  openRemotePage(browserId, url) {},

  openNodeFrontend() {},

  /**
   * @param {string} origin
   * @param {string} script
   */
  setInjectedScriptForOrigin(origin, script) {},

  /**
   * @param {boolean} isDocked
   * @param {function()} callback
   */
  setIsDocked(isDocked, callback) {},

  /**
   * @return {number}
   */
  zoomFactor() {},

  zoomIn() {},

  zoomOut() {},

  resetZoom() {},

  /**
   * @param {number} x
   * @param {number} y
   * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
   * @param {!Document} document
   */
  showContextMenuAtPoint(x, y, items, document) {},

  /**
   * @param {function()} callback
   */
  reattach(callback) {},

  readyForTest() {},

  connectionReady() {},

  /**
   * @param {boolean} value
   */
  setOpenNewWindowForPopups(value) {},

  /**
   * @return {boolean}
   */
  isHostedMode() {}
};
