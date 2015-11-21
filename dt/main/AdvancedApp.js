// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.App}
 */
WebInspector.AdvancedApp = function()
{
    WebInspector.dockController.addEventListener(WebInspector.DockController.Events.BeforeDockSideChanged, this._openToolboxWindow, this);
};

WebInspector.AdvancedApp.prototype = {
    /**
     * @override
     * @param {!Document} document
     * @param {function()} callback
     */
    presentUI: function(document, callback)
    {
        var rootView = new WebInspector.RootView();

        this._rootSplitWidget = new WebInspector.SplitWidget(false, true, "InspectorView.splitViewState", 555, 300, true);
        this._rootSplitWidget.show(rootView.element);

        this._rootSplitWidget.setSidebarWidget(WebInspector.inspectorView);

        this._inspectedPagePlaceholder = new WebInspector.InspectedPagePlaceholder();
        this._inspectedPagePlaceholder.addEventListener(WebInspector.InspectedPagePlaceholder.Events.Update, this._onSetInspectedPageBounds.bind(this), this);
        this._responsiveDesignView = new WebInspector.ResponsiveDesignView(this._inspectedPagePlaceholder);

        WebInspector.dockController.addEventListener(WebInspector.DockController.Events.BeforeDockSideChanged, this._onBeforeDockSideChange, this);
        WebInspector.dockController.addEventListener(WebInspector.DockController.Events.DockSideChanged, this._onDockSideChange, this);
        WebInspector.dockController.addEventListener(WebInspector.DockController.Events.AfterDockSideChanged, this._onAfterDockSideChange, this);
        this._onDockSideChange();

        WebInspector.inspectorView.showInitialPanel();
        console.timeStamp("AdvancedApp.attachToBody");
        rootView.attachToDocument(document);
        this._inspectedPagePlaceholder.update();

        if (this._isDocked())
            callback();
        else
            this._presentUICallback = callback;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _openToolboxWindow: function(event)
    {
        if (/** @type {string} */ (event.data.to) !== WebInspector.DockController.State.Undocked)
            return;

        if (this._toolboxWindow)
            return;

        var url = window.location.href.replace("inspector.html", "toolbox.html");
        this._toolboxWindow = window.open(url, undefined);
    },

    /**
     * @param {!Document} toolboxDocument
     */
    toolboxLoaded: function(toolboxDocument)
    {
        WebInspector.initializeUIUtils(toolboxDocument.defaultView);
        WebInspector.installComponentRootStyles(/** @type {!Element} */ (toolboxDocument.body));
        WebInspector.ContextMenu.installHandler(toolboxDocument);
        WebInspector.Tooltip.installHandler(toolboxDocument);

        this._toolboxRootView = new WebInspector.RootView();
        this._toolboxRootView.attachToDocument(toolboxDocument);

        this._updateResponsiveDesignView();

        if (this._presentUICallback) {
            var callback = this._presentUICallback;
            delete this._presentUICallback;
            callback();
        }
    },

    _updateResponsiveDesignView: function()
    {
        if (this._isDocked()) {
            this._rootSplitWidget.setMainWidget(this._responsiveDesignView);
            this._responsiveDesignView.updatePageResizer();
        } else if (this._toolboxRootView) {
            this._responsiveDesignView.show(this._toolboxRootView.element);
            this._responsiveDesignView.updatePageResizer();
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onBeforeDockSideChange: function(event)
    {
        if (/** @type {string} */ (event.data.to) === WebInspector.DockController.State.Undocked && this._toolboxRootView) {
            // Hide inspectorView and force layout to mimic the undocked state.
            this._rootSplitWidget.hideSidebar();
            this._inspectedPagePlaceholder.update();
        }

        this._changingDockSide = true;
    },

    /**
     * @param {!WebInspector.Event=} event
     */
    _onDockSideChange: function(event)
    {
        this._updateResponsiveDesignView();

        var toDockSide = event ? /** @type {string} */ (event.data.to) : WebInspector.dockController.dockSide();
        if (toDockSide === WebInspector.DockController.State.Undocked) {
            this._updateForUndocked();
        } else if (this._toolboxRootView && event && /** @type {string} */ (event.data.from) === WebInspector.DockController.State.Undocked) {
            // Don't update yet for smooth transition.
            this._rootSplitWidget.hideSidebar();
        } else {
            this._updateForDocked(toDockSide);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onAfterDockSideChange: function(event)
    {
        // We may get here on the first dock side change while loading without BeforeDockSideChange.
        if (!this._changingDockSide)
            return;
        if (/** @type {string} */ (event.data.from) === WebInspector.DockController.State.Undocked) {
            // Restore docked layout in case of smooth transition.
            this._updateForDocked(/** @type {string} */ (event.data.to));
        }
        this._changingDockSide = false;
        this._inspectedPagePlaceholder.update();
    },

    /**
     * @param {string} dockSide
     */
    _updateForDocked: function(dockSide)
    {
        this._rootSplitWidget.setVertical(dockSide === WebInspector.DockController.State.DockedToRight);
        this._rootSplitWidget.setSecondIsSidebar(dockSide === WebInspector.DockController.State.DockedToRight || dockSide === WebInspector.DockController.State.DockedToBottom);
        this._rootSplitWidget.toggleResizer(this._rootSplitWidget.resizerElement(), true);
        this._rootSplitWidget.toggleResizer(WebInspector.inspectorView.topResizerElement(), dockSide === WebInspector.DockController.State.DockedToBottom);
        this._rootSplitWidget.showBoth();
    },

    _updateForUndocked: function()
    {
        this._rootSplitWidget.toggleResizer(this._rootSplitWidget.resizerElement(), false);
        this._rootSplitWidget.toggleResizer(WebInspector.inspectorView.topResizerElement(), false);
        this._rootSplitWidget.hideMain();
    },

    _isDocked: function()
    {
        return WebInspector.dockController.dockSide() !== WebInspector.DockController.State.Undocked;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onSetInspectedPageBounds: function(event)
    {
        if (this._changingDockSide)
            return;
        var window = this._inspectedPagePlaceholder.element.window();
        if (!window.innerWidth || !window.innerHeight)
            return;
        if (!this._inspectedPagePlaceholder.isShowing())
            return;
        var bounds = /** @type {{x: number, y: number, width: number, height: number}} */ (event.data);
        console.timeStamp("AdvancedApp.setInspectedPageBounds");
        InspectorFrontendHost.setInspectedPageBounds(bounds);
    }
};

/** @type {!WebInspector.AdvancedApp} */
WebInspector.AdvancedApp._appInstance;

/**
 * @return {!WebInspector.AdvancedApp}
 */
WebInspector.AdvancedApp._instance = function()
{
    if (!WebInspector.AdvancedApp._appInstance)
        WebInspector.AdvancedApp._appInstance = new WebInspector.AdvancedApp();
    return WebInspector.AdvancedApp._appInstance;
};

/**
 * @constructor
 * @implements {WebInspector.AppProvider}
 */
WebInspector.AdvancedAppProvider = function()
{
};

WebInspector.AdvancedAppProvider.prototype = {
    /**
     * @override
     * @return {!WebInspector.App}
     */
    createApp: function()
    {
        return WebInspector.AdvancedApp._instance();
    }
};
