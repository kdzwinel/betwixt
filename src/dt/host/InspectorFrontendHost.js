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

const clipboard = require("clipboard");
const remote = require("remote");
const dialog = remote.require("dialog");
const fs = remote.require("fs");
const Menu = remote.Menu;
const electronWindow = remote.getCurrentWindow();

/**
 * @constructor
 * @implements {InspectorFrontendHostAPI}
 * @suppressGlobalPropertiesCheck
 */
WebInspector.InspectorFrontendHostStub = function()
{
    this._urlSavePath = {};

    /**
     * @param {!Event} event
     */
    function stopEventPropagation(event)
    {
        // Let browser handle Ctrl+/Ctrl- shortcuts in hosted mode.
        var zoomModifier = WebInspector.isMac() ? event.metaKey : event.ctrlKey;
        if (zoomModifier && (event.keyCode === 187 || event.keyCode === 189))
            event.stopPropagation();
    }
    document.addEventListener("keydown", stopEventPropagation, true);
}

WebInspector.InspectorFrontendHostStub.prototype = {
    /**
     * @override
     * @return {string}
     */
    getSelectionBackgroundColor: function()
    {
        return "#6e86ff";
    },

    /**
     * @override
     * @return {string}
     */
    getSelectionForegroundColor: function()
    {
        return "#ffffff";
    },

    /**
     * @override
     * @return {string}
     */
    platform: function()
    {
        var match = navigator.userAgent.match(/Windows NT/);
        if (match)
            return "windows";
        match = navigator.userAgent.match(/Mac OS X/);
        if (match)
            return "mac";
        return "linux";
    },

    /**
     * @override
     */
    loadCompleted: function()
    {
    },

    /**
     * @override
     */
    bringToFront: function()
    {
        this._windowVisible = true;
    },

    /**
     * @override
     */
    closeWindow: function()
    {
        this._windowVisible = false;
    },

    /**
     * @override
     * @param {boolean} isDocked
     * @param {function()} callback
     */
    setIsDocked: function(isDocked, callback)
    {
        setTimeout(callback, 0);
    },

    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     * @override
     * @param {{x: number, y: number, width: number, height: number}} bounds
     */
    setInspectedPageBounds: function(bounds)
    {
    },

    /**
     * @override
     */
    inspectElementCompleted: function()
    {
    },

    /**
     * @override
     * @param {string} origin
     * @param {string} script
     */
    setInjectedScriptForOrigin: function(origin, script)
    {
    },

    /**
     * @override
     * @param {string} url
     * @suppressGlobalPropertiesCheck
     */
    inspectedURLChanged: function(url)
    {
    },

    /**
     * @override
     * @param {string} text
     */
    copyText: function(text)
    {
        clipboard.writeText(text);
    },

    /**
     * @override
     * @param {string} url
     */
    openInNewTab: function(url)
    {
        window.open(url, "_blank");
    },

    /**
     * @override
     * @param {string} url
     * @param {string} content
     * @param {boolean} forceSaveAs
     */
    save: function(url, content, forceSaveAs)
    {
        function saveToPath(path) {
            if (!path) {
                return Promise.reject();
            }

            return new Promise((resolve, reject) => {
                fs.writeFile(path, content, (err) => {
                    if (err) {
                        reject(err.message);
                    }
                    resolve();
                });
            });
        }

        dialog.showSaveDialog(electronWindow, {
            defaultPath: url
        }, (path) => {
            saveToPath(path)
                .then(() => {
                    this._urlSavePath[url] = path;
                    this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.SavedURL, url);
                })
                .catch((msg) => {
                    if (msg) {
                        dialog.showMessageBox(electronWindow, {
                            type: "warning",
                            buttons: ["OK"],
                            title: "Error",
                            message: "Error writing to file",
                            detail: msg
                        });
                    }

                    this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.CanceledSaveURL, url);
                });
        });
    },

    /**
     * @override
     * @param {string} url
     * @param {string} content
     */
    append: function(url, content)
    {
        const path = this._urlSavePath[url];

        if (path) {
            fs.appendFile(path, content, (err) => {
                if (err) {
                    return;
                }

                this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.AppendedToURL, url);
            });
        }
    },

    /**
     * @override
     * @param {string} message
     */
    sendMessageToBackend: function(message)
    {
    },

    /**
     * @override
     * @param {string} actionName
     * @param {number} actionCode
     * @param {number} bucketSize
     */
    recordEnumeratedHistogram: function(actionName, actionCode, bucketSize)
    {
    },

    /**
     * @override
     */
    requestFileSystems: function()
    {
        this.events.dispatchEventToListeners(InspectorFrontendHostAPI.Events.FileSystemsLoaded, []);
    },

    /**
     * @override
     * @param {string=} fileSystemPath
     */
    addFileSystem: function(fileSystemPath)
    {
    },

    /**
     * @override
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath)
    {
    },

    /**
     * @override
     * @param {string} fileSystemId
     * @param {string} registeredName
     * @return {?DOMFileSystem}
     */
    isolatedFileSystem: function(fileSystemId, registeredName)
    {
        return null;
    },

    /**
     * @override
     * @param {string} url
     * @param {string} headers
     * @param {number} streamId
     * @param {function(!InspectorFrontendHostAPI.LoadNetworkResourceResult)} callback
     */
    loadNetworkResource: function(url, headers, streamId, callback)
    {
        loadResourcePromise(url).then(function(text) {
            WebInspector.ResourceLoader.streamWrite(streamId, text);
            callback({statusCode: 200});
        }).catch(function() {
            callback({statusCode: 404});
        });
    },

    /**
     * @override
     * @param {function(!Object<string, string>)} callback
     */
    getPreferences: function(callback)
    {
        var prefs = {};
        for (var name in window.localStorage)
            prefs[name] = window.localStorage[name];
        callback(prefs);
    },

    /**
     * @override
     * @param {string} name
     * @param {string} value
     */
    setPreference: function(name, value)
    {
        window.localStorage[name] = value;
    },

    /**
     * @override
     * @param {string} name
     */
    removePreference: function(name)
    {
        delete window.localStorage[name];
    },

    /**
     * @override
     */
    clearPreferences: function()
    {
        window.localStorage.clear();
    },

    /**
     * @override
     * @param {!FileSystem} fileSystem
     */
    upgradeDraggedFileSystemPermissions: function(fileSystem)
    {
    },

    /**
     * @override
     * @param {number} requestId
     * @param {string} fileSystemPath
     */
    indexPath: function(requestId, fileSystemPath)
    {
    },

    /**
     * @override
     * @param {number} requestId
     */
    stopIndexing: function(requestId)
    {
    },

    /**
     * @override
     * @param {number} requestId
     * @param {string} fileSystemPath
     * @param {string} query
     */
    searchInPath: function(requestId, fileSystemPath, query)
    {
    },

    /**
     * @override
     * @return {number}
     */
    zoomFactor: function()
    {
        return 1;
    },

    /**
     * @override
     */
    zoomIn: function()
    {
    },

    /**
     * @override
     */
    zoomOut: function()
    {
    },

    /**
     * @override
     */
    resetZoom: function()
    {
    },

    /**
     * @override
     * @param {string} shortcuts
     */
    setWhitelistedShortcuts: function(shortcuts)
    {
    },

    /**
     * @override
     * @return {boolean}
     */
    isUnderTest: function()
    {
        return false;
    },

    /**
     * @override
     * @param {boolean} discoverUsbDevices
     * @param {boolean} portForwardingEnabled
     * @param {!Adb.PortForwardingConfig} portForwardingConfig
     */
    setDevicesDiscoveryConfig: function(discoverUsbDevices, portForwardingEnabled, portForwardingConfig)
    {
    },

    /**
     * @override
     * @param {boolean} enabled
     */
    setDevicesUpdatesEnabled: function(enabled)
    {
    },

    /**
     * @override
     * @param {string} pageId
     * @param {string} action
     */
    performActionOnRemotePage: function(pageId, action)
    {
    },

    /**
     * @override
     * @param {number} x
     * @param {number} y
     * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
     * @param {!Document} document
     * @param {function(number)} callback
     */
    showContextMenuAtPoint: function(x, y, items, document, callback)
    {
        //TODO does not support checkboxes, radio and submenus yet
        const menu = Menu.buildFromTemplate(items.map(item => {
            if (item.type === "separator") {
                return {
                   type: "separator"
                };
            }

            return {
                id: item.id,
                label: item.label,
                enabled: item.enabled,
                click: () => callback(item.id)
            };
        }));

        menu.popup(electronWindow);

        window.getSelection().removeAllRanges();
    },

    /**
     * @override
     * @return {boolean}
     */
    isHostedMode: function()
    {
        return true;
    },

    /**
     * @override
     * @return {boolean}
     */
    isElectron: function()
    {
        return true;
    },

    /**
     * @override
     * @param {string} message
     */
    sendFrontendAPINotification: function(message)
    {
    }
};

/**
 * @type {!InspectorFrontendHostAPI}
 */
var InspectorFrontendHost = window.InspectorFrontendHost || null;

(function() {

    function initializeInspectorFrontendHost()
    {
        if (!InspectorFrontendHost) {
            // Instantiate stub for web-hosted mode if necessary.
            InspectorFrontendHost = new WebInspector.InspectorFrontendHostStub();
        } else {
            // Otherwise add stubs for missing methods that are declared in the interface.
            var proto = WebInspector.InspectorFrontendHostStub.prototype;
            for (var name in proto) {
                var value = proto[name];
                if (typeof value !== "function" || InspectorFrontendHost[name])
                    continue;

                InspectorFrontendHost[name] = stub.bind(null, name);
            }
        }

        /**
         * @param {string} name
         * @return {?}
         */
        function stub(name)
        {
            console.error("Incompatible embedder: method InspectorFrontendHost." + name + " is missing. Using stub instead.");
            var args = Array.prototype.slice.call(arguments, 1);
            return proto[name].apply(InspectorFrontendHost, args);
        }

        // Attach the events object.
        InspectorFrontendHost.events = new WebInspector.Object();
    }

    /**
     * @constructor
     */
    function InspectorFrontendAPIImpl()
    {
        this._debugFrontend = !!Runtime.queryParam("debugFrontend") || (window["InspectorTest"] && window["InspectorTest"]["debugTest"]);

        var descriptors = InspectorFrontendHostAPI.EventDescriptors;
        for (var i = 0; i < descriptors.length; ++i)
            this[descriptors[i][0]] = this._dispatch.bind(this, descriptors[i][0], descriptors[i][1], descriptors[i][2]);
    }

    InspectorFrontendAPIImpl.prototype = {
        /**
         * @param {string} name
         * @param {!Array.<string>} signature
         * @param {boolean} runOnceLoaded
         */
        _dispatch: function(name, signature, runOnceLoaded)
        {
            var params = Array.prototype.slice.call(arguments, 3);

            if (this._debugFrontend)
                setImmediate(innerDispatch);
            else
                innerDispatch();

            function innerDispatch()
            {
                // Single argument methods get dispatched with the param.
                if (signature.length < 2) {
                    try {
                        InspectorFrontendHost.events.dispatchEventToListeners(name, params[0]);
                    } catch(e) {
                        console.error(e + " " + e.stack);
                    }
                    return;
                }
                var data = {};
                for (var i = 0; i < signature.length; ++i)
                    data[signature[i]] = params[i];
                try {
                    InspectorFrontendHost.events.dispatchEventToListeners(name, data);
                } catch(e) {
                    console.error(e + " " + e.stack);
                }
            }
        },

        /**
         * @param {number} id
         * @param {string} chunk
         */
        streamWrite: function(id, chunk)
        {
            WebInspector.ResourceLoader.streamWrite(id, chunk);
        }
    }

    // FIXME: This file is included into both apps, since the devtools_app needs the InspectorFrontendHostAPI only,
    // so the host instance should not initialized there.
    initializeInspectorFrontendHost();
    window.InspectorFrontendAPI = new InspectorFrontendAPIImpl();
    WebInspector.setLocalizationPlatform(InspectorFrontendHost.platform());
})();

/**
 * @type {!WebInspector.EventTarget}
 */
InspectorFrontendHost.events;
