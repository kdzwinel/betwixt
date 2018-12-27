/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
 * @implements {InspectorFrontendHostAPI}
 * @unrestricted
 */
Host.InspectorFrontendHostStub = class {
  /**
   * @suppressGlobalPropertiesCheck
   */
  constructor() {
    /**
     * @param {!Event} event
     */
    function stopEventPropagation(event) {
      // Let browser handle Ctrl+/Ctrl- shortcuts in hosted mode.
      const zoomModifier = Host.isMac() ? event.metaKey : event.ctrlKey;
      if (zoomModifier && (event.keyCode === 187 || event.keyCode === 189))
        event.stopPropagation();
    }
    document.addEventListener('keydown', stopEventPropagation, true);
    /**
     * @type {!Map<string, !Array<string>>}
     */
    this._urlsBeingSaved = new Map();
  }

  /**
   * @override
   * @return {string}
   */
  platform() {
    let match = navigator.userAgent.match(/Windows NT/);
    if (match)
      return 'windows';
    match = navigator.userAgent.match(/Mac OS X/);
    if (match)
      return 'mac';
    return 'linux';
  }

  /**
   * @override
   */
  loadCompleted() {
  }

  /**
   * @override
   */
  bringToFront() {
    this._windowVisible = true;
  }

  /**
   * @override
   */
  closeWindow() {
    this._windowVisible = false;
  }

  /**
   * @override
   * @param {boolean} isDocked
   * @param {function()} callback
   */
  setIsDocked(isDocked, callback) {
    setTimeout(callback, 0);
  }

  /**
   * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
   * @override
   * @param {{x: number, y: number, width: number, height: number}} bounds
   */
  setInspectedPageBounds(bounds) {
  }

  /**
   * @override
   */
  inspectElementCompleted() {
  }

  /**
   * @override
   * @param {string} origin
   * @param {string} script
   */
  setInjectedScriptForOrigin(origin, script) {
  }

  /**
   * @override
   * @param {string} url
   * @suppressGlobalPropertiesCheck
   */
  inspectedURLChanged(url) {
    document.title = Common.UIString('DevTools - %s', url.replace(/^https?:\/\//, ''));
  }

  /**
   * @override
   * @param {string} text
   * @suppressGlobalPropertiesCheck
   */
  copyText(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else if (document.queryCommandSupported('copy')) {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    } else {
      Common.console.error('Clipboard is not enabled in hosted mode. Please inspect using chrome://inspect');
    }
  }

  /**
   * @override
   * @param {string} url
   */
  openInNewTab(url) {
    window.open(url, '_blank');
  }

  /**
   * @override
   * @param {string} fileSystemPath
   */
  showItemInFolder(fileSystemPath) {
    Common.console.error('Show item in folder is not enabled in hosted mode. Please inspect using chrome://inspect');
  }

  /**
   * @override
   * @param {string} url
   * @param {string} content
   * @param {boolean} forceSaveAs
   */
  save(url, content, forceSaveAs) {
    let buffer = this._urlsBeingSaved.get(url);
    if (!buffer) {
      buffer = [];
      this._urlsBeingSaved.set(url, buffer);
    }
    buffer.push(content);
    this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.SavedURL, {url, fileSystemPath: url});
  }

  /**
   * @override
   * @param {string} url
   * @param {string} content
   */
  append(url, content) {
    const buffer = this._urlsBeingSaved.get(url);
    buffer.push(content);
    this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.AppendedToURL, url);
  }

  /**
   * @override
   * @param {string} url
   */
  close(url) {
    const buffer = this._urlsBeingSaved.get(url);
    this._urlsBeingSaved.delete(url);
    const fileName = url ? url.trimURL().removeURLFragment() : '';
    const link = createElement('a');
    link.download = fileName;
    const blob = new Blob([buffer.join('')], {type: 'text/plain'});
    link.href = URL.createObjectURL(blob);
    link.click();
  }

  /**
   * @override
   * @param {string} message
   */
  sendMessageToBackend(message) {
  }

  /**
   * @override
   * @param {string} actionName
   * @param {number} actionCode
   * @param {number} bucketSize
   */
  recordEnumeratedHistogram(actionName, actionCode, bucketSize) {
  }

  /**
   * @override
   */
  requestFileSystems() {
    this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.FileSystemsLoaded, []);
  }

  /**
   * @override
   * @param {string=} type
   */
  addFileSystem(type) {
  }

  /**
   * @override
   * @param {string} fileSystemPath
   */
  removeFileSystem(fileSystemPath) {
  }

  /**
   * @override
   * @param {string} fileSystemId
   * @param {string} registeredName
   * @return {?DOMFileSystem}
   */
  isolatedFileSystem(fileSystemId, registeredName) {
    return null;
  }

  /**
   * @override
   * @param {string} url
   * @param {string} headers
   * @param {number} streamId
   * @param {function(!InspectorFrontendHostAPI.LoadNetworkResourceResult)} callback
   */
  loadNetworkResource(url, headers, streamId, callback) {
    Runtime.loadResourcePromise(url)
        .then(function(text) {
          Host.ResourceLoader.streamWrite(streamId, text);
          callback({statusCode: 200});
        })
        .catch(function() {
          callback({statusCode: 404});
        });
  }

  /**
   * @override
   * @param {function(!Object<string, string>)} callback
   */
  getPreferences(callback) {
    const prefs = {};
    for (const name in window.localStorage)
      prefs[name] = window.localStorage[name];
    callback(prefs);
  }

  /**
   * @override
   * @param {string} name
   * @param {string} value
   */
  setPreference(name, value) {
    window.localStorage[name] = value;
  }

  /**
   * @override
   * @param {string} name
   */
  removePreference(name) {
    delete window.localStorage[name];
  }

  /**
   * @override
   */
  clearPreferences() {
    window.localStorage.clear();
  }

  /**
   * @override
   * @param {!FileSystem} fileSystem
   */
  upgradeDraggedFileSystemPermissions(fileSystem) {
  }

  /**
   * @override
   * @param {number} requestId
   * @param {string} fileSystemPath
   * @param {string} excludedFolders
   */
  indexPath(requestId, fileSystemPath, excludedFolders) {
  }

  /**
   * @override
   * @param {number} requestId
   */
  stopIndexing(requestId) {
  }

  /**
   * @override
   * @param {number} requestId
   * @param {string} fileSystemPath
   * @param {string} query
   */
  searchInPath(requestId, fileSystemPath, query) {
  }

  /**
   * @override
   * @return {number}
   */
  zoomFactor() {
    return 1;
  }

  /**
   * @override
   */
  zoomIn() {
  }

  /**
   * @override
   */
  zoomOut() {
  }

  /**
   * @override
   */
  resetZoom() {
  }

  /**
   * @override
   * @param {string} shortcuts
   */
  setWhitelistedShortcuts(shortcuts) {
  }

  /**
   * @override
   * @param {boolean} active
   */
  setEyeDropperActive(active) {
  }

  /**
   * @param {!Array<string>} certChain
   * @override
   */
  showCertificateViewer(certChain) {
  }

  /**
   * @override
   * @param {function()} callback
   */
  reattach(callback) {
  }

  /**
   * @override
   */
  readyForTest() {
  }

  /**
   * @override
   */
  connectionReady() {
  }

  /**
   * @override
   * @param {boolean} value
   */
  setOpenNewWindowForPopups(value) {
  }

  /**
   * @override
   * @param {!Adb.Config} config
   */
  setDevicesDiscoveryConfig(config) {
  }

  /**
   * @override
   * @param {boolean} enabled
   */
  setDevicesUpdatesEnabled(enabled) {
  }

  /**
   * @override
   * @param {string} pageId
   * @param {string} action
   */
  performActionOnRemotePage(pageId, action) {
  }

  /**
   * @override
   * @param {string} browserId
   * @param {string} url
   */
  openRemotePage(browserId, url) {
  }

  /**
   * @override
   */
  openNodeFrontend() {
  }

  /**
   * @override
   * @param {number} x
   * @param {number} y
   * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
   * @param {!Document} document
   */
  showContextMenuAtPoint(x, y, items, document) {
    throw 'Soft context menu should be used';
  }

  /**
   * @override
   * @return {boolean}
   */
  isHostedMode() {
    return true;
  }
};

/**
 * @unrestricted
 */
Host.InspectorFrontendAPIImpl = class {
  constructor() {
    this._debugFrontend =
        !!Runtime.queryParam('debugFrontend') || (window['InspectorTest'] && window['InspectorTest']['debugTest']);

    const descriptors = InspectorFrontendHostAPI.EventDescriptors;
    for (let i = 0; i < descriptors.length; ++i)
      this[descriptors[i][1]] = this._dispatch.bind(this, descriptors[i][0], descriptors[i][2], descriptors[i][3]);
  }

  /**
   * @param {symbol} name
   * @param {!Array.<string>} signature
   * @param {boolean} runOnceLoaded
   */
  _dispatch(name, signature, runOnceLoaded) {
    const params = Array.prototype.slice.call(arguments, 3);

    if (this._debugFrontend)
      setImmediate(innerDispatch);
    else
      innerDispatch();

    function innerDispatch() {
      // Single argument methods get dispatched with the param.
      if (signature.length < 2) {
        try {
          InspectorFrontendHost.events.dispatchEventToListeners(name, params[0]);
        } catch (e) {
          console.error(e + ' ' + e.stack);
        }
        return;
      }
      const data = {};
      for (let i = 0; i < signature.length; ++i)
        data[signature[i]] = params[i];
      try {
        InspectorFrontendHost.events.dispatchEventToListeners(name, data);
      } catch (e) {
        console.error(e + ' ' + e.stack);
      }
    }
  }

  /**
   * @param {number} id
   * @param {string} chunk
   */
  streamWrite(id, chunk) {
    Host.ResourceLoader.streamWrite(id, chunk);
  }
};

/**
 * @type {!InspectorFrontendHostAPI}
 */
let InspectorFrontendHost = window.InspectorFrontendHost;
(function() {

  function initializeInspectorFrontendHost() {
    let proto;
    if (!InspectorFrontendHost) {
      // Instantiate stub for web-hosted mode if necessary.
      window.InspectorFrontendHost = InspectorFrontendHost = new Host.InspectorFrontendHostStub();
    } else {
      // Otherwise add stubs for missing methods that are declared in the interface.
      proto = Host.InspectorFrontendHostStub.prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const stub = proto[name];
        if (typeof stub !== 'function' || InspectorFrontendHost[name])
          continue;

        console.error(
            'Incompatible embedder: method InspectorFrontendHost.' + name + ' is missing. Using stub instead.');
        InspectorFrontendHost[name] = stub;
      }
    }

    // Attach the events object.
    InspectorFrontendHost.events = new Common.Object();
  }

  // FIXME: This file is included into both apps, since the devtools_app needs the InspectorFrontendHostAPI only,
  // so the host instance should not initialized there.
  initializeInspectorFrontendHost();
  window.InspectorFrontendAPI = new Host.InspectorFrontendAPIImpl();
})();

/**
 * @type {!Common.EventTarget}
 */
InspectorFrontendHost.events;

/**
 * @param {!Object<string, string>=} prefs
 * @return {boolean}
 */
Host.isUnderTest = function(prefs) {
  // Integration tests rely on test queryParam.
  if (Runtime.queryParam('test'))
    return true;
  // Browser tests rely on prefs.
  if (prefs)
    return prefs['isUnderTest'] === 'true';
  return Common.settings && Common.settings.createSetting('isUnderTest', false).get();
};
