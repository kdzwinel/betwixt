/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
UI.SplitWidget = class extends UI.Widget {
  /**
   * @param {boolean} isVertical
   * @param {boolean} secondIsSidebar
   * @param {string=} settingName
   * @param {number=} defaultSidebarWidth
   * @param {number=} defaultSidebarHeight
   * @param {boolean=} constraintsInDip
   */
  constructor(isVertical, secondIsSidebar, settingName, defaultSidebarWidth, defaultSidebarHeight, constraintsInDip) {
    super(true);
    this.element.classList.add('split-widget');
    this.registerRequiredCSS('ui/splitWidget.css');

    this.contentElement.classList.add('shadow-split-widget');
    this._mainElement =
        this.contentElement.createChild('div', 'shadow-split-widget-contents shadow-split-widget-main vbox');
    this._mainElement.createChild('content').select = '.insertion-point-main';
    this._sidebarElement =
        this.contentElement.createChild('div', 'shadow-split-widget-contents shadow-split-widget-sidebar vbox');
    this._sidebarElement.createChild('content').select = '.insertion-point-sidebar';
    this._resizerElement = this.contentElement.createChild('div', 'shadow-split-widget-resizer');
    this._resizerElementSize = null;

    this._resizerWidget = new UI.SimpleResizerWidget();
    this._resizerWidget.setEnabled(true);
    this._resizerWidget.addEventListener(UI.ResizerWidget.Events.ResizeStart, this._onResizeStart, this);
    this._resizerWidget.addEventListener(UI.ResizerWidget.Events.ResizeUpdate, this._onResizeUpdate, this);
    this._resizerWidget.addEventListener(UI.ResizerWidget.Events.ResizeEnd, this._onResizeEnd, this);

    this._defaultSidebarWidth = defaultSidebarWidth || 200;
    this._defaultSidebarHeight = defaultSidebarHeight || this._defaultSidebarWidth;
    this._constraintsInDip = !!constraintsInDip;
    this._resizeStartSizeDIP = 0;
    this._setting = settingName ? Common.settings.createSetting(settingName, {}) : null;

    this._totalSizeCSS = 0;
    this._totalSizeOtherDimensionCSS = 0;
    /** @type {?UI.Widget} */
    this._mainWidget = null;
    /** @type {?UI.Widget} */
    this._sidebarWidget = null;
    this._animationFrameHandle = 0;
    /** @type {?function()} */
    this._animationCallback = null;
    this._showHideSidebarButtonTitle = '';
    /** @type {?UI.ToolbarButton} */
    this._showHideSidebarButton = null;
    this._isVertical = false;
    this._sidebarMinimized = false;
    this._detaching = false;
    this._sidebarSizeDIP = -1;
    this._savedSidebarSizeDIP = this._sidebarSizeDIP;
    this._secondIsSidebar = false;
    this._shouldSaveShowMode = false;
    /** @type {?number} */
    this._savedVerticalMainSize = null;
    /** @type {?number} */
    this._savedHorizontalMainSize = null;

    this.setSecondIsSidebar(secondIsSidebar);

    this._innerSetVertical(isVertical);
    this._showMode = UI.SplitWidget.ShowMode.Both;
    this._savedShowMode = this._showMode;

    // Should be called after isVertical has the right value.
    this.installResizer(this._resizerElement);
  }

  /**
   * @return {boolean}
   */
  isVertical() {
    return this._isVertical;
  }

  /**
   * @param {boolean} isVertical
   */
  setVertical(isVertical) {
    if (this._isVertical === isVertical)
      return;

    this._innerSetVertical(isVertical);

    if (this.isShowing())
      this._updateLayout();
  }

  /**
   * @param {boolean} isVertical
   */
  _innerSetVertical(isVertical) {
    this.contentElement.classList.toggle('vbox', !isVertical);
    this.contentElement.classList.toggle('hbox', isVertical);
    this._isVertical = isVertical;

    this._resizerElementSize = null;
    this._sidebarSizeDIP = -1;
    this._restoreSidebarSizeFromSettings();
    if (this._shouldSaveShowMode)
      this._restoreAndApplyShowModeFromSettings();
    this._updateShowHideSidebarButton();
    // FIXME: reverse SplitWidget.isVertical meaning.
    this._resizerWidget.setVertical(!isVertical);
    this.invalidateConstraints();
  }

  /**
   * @param {boolean=} animate
   */
  _updateLayout(animate) {
    this._totalSizeCSS = 0;  // Lazy update.
    this._totalSizeOtherDimensionCSS = 0;

    // Remove properties that might affect total size calculation.
    this._mainElement.style.removeProperty('width');
    this._mainElement.style.removeProperty('height');
    this._sidebarElement.style.removeProperty('width');
    this._sidebarElement.style.removeProperty('height');

    this._innerSetSidebarSizeDIP(this._preferredSidebarSizeDIP(), !!animate);
  }

  /**
   * @param {!UI.Widget} widget
   */
  setMainWidget(widget) {
    if (this._mainWidget === widget)
      return;
    this.suspendInvalidations();
    if (this._mainWidget)
      this._mainWidget.detach();
    this._mainWidget = widget;
    if (widget) {
      widget.element.classList.add('insertion-point-main');
      widget.element.classList.remove('insertion-point-sidebar');
      if (this._showMode === UI.SplitWidget.ShowMode.OnlyMain || this._showMode === UI.SplitWidget.ShowMode.Both)
        widget.show(this.element);
    }
    this.resumeInvalidations();
  }

  /**
   * @param {!UI.Widget} widget
   */
  setSidebarWidget(widget) {
    if (this._sidebarWidget === widget)
      return;
    this.suspendInvalidations();
    if (this._sidebarWidget)
      this._sidebarWidget.detach();
    this._sidebarWidget = widget;
    if (widget) {
      widget.element.classList.add('insertion-point-sidebar');
      widget.element.classList.remove('insertion-point-main');
      if (this._showMode === UI.SplitWidget.ShowMode.OnlySidebar || this._showMode === UI.SplitWidget.ShowMode.Both)
        widget.show(this.element);
    }
    this.resumeInvalidations();
  }

  /**
   * @return {?UI.Widget}
   */
  mainWidget() {
    return this._mainWidget;
  }

  /**
   * @return {?UI.Widget}
   */
  sidebarWidget() {
    return this._sidebarWidget;
  }

  /**
   * @override
   * @param {!UI.Widget} widget
   */
  childWasDetached(widget) {
    if (this._detaching)
      return;
    if (this._mainWidget === widget)
      this._mainWidget = null;
    if (this._sidebarWidget === widget)
      this._sidebarWidget = null;
    this.invalidateConstraints();
  }

  /**
   * @return {boolean}
   */
  isSidebarSecond() {
    return this._secondIsSidebar;
  }

  enableShowModeSaving() {
    this._shouldSaveShowMode = true;
    this._restoreAndApplyShowModeFromSettings();
  }

  /**
   * @return {string}
   */
  showMode() {
    return this._showMode;
  }

  /**
   * @param {boolean} secondIsSidebar
   */
  setSecondIsSidebar(secondIsSidebar) {
    this.contentElement.classList.toggle('shadow-split-widget-first-is-sidebar', !secondIsSidebar);
    this._secondIsSidebar = secondIsSidebar;
  }

  /**
   * @return {?string}
   */
  sidebarSide() {
    if (this._showMode !== UI.SplitWidget.ShowMode.Both)
      return null;
    return this._isVertical ? (this._secondIsSidebar ? 'right' : 'left') : (this._secondIsSidebar ? 'bottom' : 'top');
  }

  /**
   * @return {!Element}
   */
  resizerElement() {
    return this._resizerElement;
  }

  /**
   * @param {boolean=} animate
   */
  hideMain(animate) {
    this._showOnly(this._sidebarWidget, this._mainWidget, this._sidebarElement, this._mainElement, animate);
    this._updateShowMode(UI.SplitWidget.ShowMode.OnlySidebar);
  }

  /**
   * @param {boolean=} animate
   */
  hideSidebar(animate) {
    this._showOnly(this._mainWidget, this._sidebarWidget, this._mainElement, this._sidebarElement, animate);
    this._updateShowMode(UI.SplitWidget.ShowMode.OnlyMain);
  }

  /**
   * @param {boolean} minimized
   */
  setSidebarMinimized(minimized) {
    this._sidebarMinimized = minimized;
    this.invalidateConstraints();
  }

  /**
   * @return {boolean}
   */
  isSidebarMinimized() {
    return this._sidebarMinimized;
  }

  /**
   * @param {?UI.Widget} sideToShow
   * @param {?UI.Widget} sideToHide
   * @param {!Element} shadowToShow
   * @param {!Element} shadowToHide
   * @param {boolean=} animate
   */
  _showOnly(sideToShow, sideToHide, shadowToShow, shadowToHide, animate) {
    this._cancelAnimation();

    /**
     * @this {UI.SplitWidget}
     */
    function callback() {
      if (sideToShow) {
        // Make sure main is first in the children list.
        if (sideToShow === this._mainWidget)
          this._mainWidget.show(this.element, this._sidebarWidget ? this._sidebarWidget.element : null);
        else
          this._sidebarWidget.show(this.element);
      }
      if (sideToHide) {
        this._detaching = true;
        sideToHide.detach();
        this._detaching = false;
      }

      this._resizerElement.classList.add('hidden');
      shadowToShow.classList.remove('hidden');
      shadowToShow.classList.add('maximized');
      shadowToHide.classList.add('hidden');
      shadowToHide.classList.remove('maximized');
      this._removeAllLayoutProperties();
      this.doResize();
      this._showFinishedForTest();
    }

    if (animate)
      this._animate(true, callback.bind(this));
    else
      callback.call(this);

    this._sidebarSizeDIP = -1;
    this.setResizable(false);
  }

  _showFinishedForTest() {
    // This method is sniffed in tests.
  }

  _removeAllLayoutProperties() {
    this._sidebarElement.style.removeProperty('flexBasis');

    this._mainElement.style.removeProperty('width');
    this._mainElement.style.removeProperty('height');
    this._sidebarElement.style.removeProperty('width');
    this._sidebarElement.style.removeProperty('height');

    this._resizerElement.style.removeProperty('left');
    this._resizerElement.style.removeProperty('right');
    this._resizerElement.style.removeProperty('top');
    this._resizerElement.style.removeProperty('bottom');

    this._resizerElement.style.removeProperty('margin-left');
    this._resizerElement.style.removeProperty('margin-right');
    this._resizerElement.style.removeProperty('margin-top');
    this._resizerElement.style.removeProperty('margin-bottom');
  }

  /**
   * @param {boolean=} animate
   */
  showBoth(animate) {
    if (this._showMode === UI.SplitWidget.ShowMode.Both)
      animate = false;

    this._cancelAnimation();
    this._mainElement.classList.remove('maximized', 'hidden');
    this._sidebarElement.classList.remove('maximized', 'hidden');
    this._resizerElement.classList.remove('hidden');
    this.setResizable(true);

    // Make sure main is the first in the children list.
    this.suspendInvalidations();
    if (this._sidebarWidget)
      this._sidebarWidget.show(this.element);
    if (this._mainWidget)
      this._mainWidget.show(this.element, this._sidebarWidget ? this._sidebarWidget.element : null);
    this.resumeInvalidations();
    // Order widgets in DOM properly.
    this.setSecondIsSidebar(this._secondIsSidebar);

    this._sidebarSizeDIP = -1;
    this._updateShowMode(UI.SplitWidget.ShowMode.Both);
    this._updateLayout(animate);
  }

  /**
   * @param {boolean} resizable
   */
  setResizable(resizable) {
    this._resizerWidget.setEnabled(resizable);
  }

  /**
   * @return {boolean}
   */
  isResizable() {
    return this._resizerWidget.isEnabled();
  }

  /**
   * @param {number} size
   */
  setSidebarSize(size) {
    const sizeDIP = UI.zoomManager.cssToDIP(size);
    this._savedSidebarSizeDIP = sizeDIP;
    this._saveSetting();
    this._innerSetSidebarSizeDIP(sizeDIP, false, true);
  }

  /**
   * @return {number}
   */
  sidebarSize() {
    const sizeDIP = Math.max(0, this._sidebarSizeDIP);
    return UI.zoomManager.dipToCSS(sizeDIP);
  }

  /**
   * Returns total size in DIP.
   * @return {number}
   */
  _totalSizeDIP() {
    if (!this._totalSizeCSS) {
      this._totalSizeCSS = this._isVertical ? this.contentElement.offsetWidth : this.contentElement.offsetHeight;
      this._totalSizeOtherDimensionCSS =
          this._isVertical ? this.contentElement.offsetHeight : this.contentElement.offsetWidth;
    }
    return UI.zoomManager.cssToDIP(this._totalSizeCSS);
  }

  /**
   * @param {string} showMode
   */
  _updateShowMode(showMode) {
    this._showMode = showMode;
    this._saveShowModeToSettings();
    this._updateShowHideSidebarButton();
    this.dispatchEventToListeners(UI.SplitWidget.Events.ShowModeChanged, showMode);
    this.invalidateConstraints();
  }

  /**
   * @param {number} sizeDIP
   * @param {boolean} animate
   * @param {boolean=} userAction
   */
  _innerSetSidebarSizeDIP(sizeDIP, animate, userAction) {
    if (this._showMode !== UI.SplitWidget.ShowMode.Both || !this.isShowing())
      return;

    sizeDIP = this._applyConstraints(sizeDIP, userAction);
    if (this._sidebarSizeDIP === sizeDIP)
      return;

    if (!this._resizerElementSize) {
      this._resizerElementSize =
          this._isVertical ? this._resizerElement.offsetWidth : this._resizerElement.offsetHeight;
    }

    // Invalidate layout below.

    this._removeAllLayoutProperties();

    // this._totalSizeDIP is available below since we successfully applied constraints.
    const roundSizeCSS = Math.round(UI.zoomManager.dipToCSS(sizeDIP));
    const sidebarSizeValue = roundSizeCSS + 'px';
    const mainSizeValue = (this._totalSizeCSS - roundSizeCSS) + 'px';
    this._sidebarElement.style.flexBasis = sidebarSizeValue;

    // Make both sides relayout boundaries.
    if (this._isVertical) {
      this._sidebarElement.style.width = sidebarSizeValue;
      this._mainElement.style.width = mainSizeValue;
      this._sidebarElement.style.height = this._totalSizeOtherDimensionCSS + 'px';
      this._mainElement.style.height = this._totalSizeOtherDimensionCSS + 'px';
    } else {
      this._sidebarElement.style.height = sidebarSizeValue;
      this._mainElement.style.height = mainSizeValue;
      this._sidebarElement.style.width = this._totalSizeOtherDimensionCSS + 'px';
      this._mainElement.style.width = this._totalSizeOtherDimensionCSS + 'px';
    }

    // Position resizer.
    if (this._isVertical) {
      if (this._secondIsSidebar) {
        this._resizerElement.style.right = sidebarSizeValue;
        this._resizerElement.style.marginRight = -this._resizerElementSize / 2 + 'px';
      } else {
        this._resizerElement.style.left = sidebarSizeValue;
        this._resizerElement.style.marginLeft = -this._resizerElementSize / 2 + 'px';
      }
    } else {
      if (this._secondIsSidebar) {
        this._resizerElement.style.bottom = sidebarSizeValue;
        this._resizerElement.style.marginBottom = -this._resizerElementSize / 2 + 'px';
      } else {
        this._resizerElement.style.top = sidebarSizeValue;
        this._resizerElement.style.marginTop = -this._resizerElementSize / 2 + 'px';
      }
    }

    this._sidebarSizeDIP = sizeDIP;

    // Force layout.

    if (animate) {
      this._animate(false);
    } else {
      // No need to recalculate this._sidebarSizeDIP and this._totalSizeDIP again.
      this.doResize();
      this.dispatchEventToListeners(UI.SplitWidget.Events.SidebarSizeChanged, this.sidebarSize());
    }
  }

  /**
   * @param {boolean} reverse
   * @param {function()=} callback
   */
  _animate(reverse, callback) {
    const animationTime = 50;
    this._animationCallback = callback || null;

    let animatedMarginPropertyName;
    if (this._isVertical)
      animatedMarginPropertyName = this._secondIsSidebar ? 'margin-right' : 'margin-left';
    else
      animatedMarginPropertyName = this._secondIsSidebar ? 'margin-bottom' : 'margin-top';

    const marginFrom = reverse ? '0' : '-' + UI.zoomManager.dipToCSS(this._sidebarSizeDIP) + 'px';
    const marginTo = reverse ? '-' + UI.zoomManager.dipToCSS(this._sidebarSizeDIP) + 'px' : '0';

    // This order of things is important.
    // 1. Resize main element early and force layout.
    this.contentElement.style.setProperty(animatedMarginPropertyName, marginFrom);
    if (!reverse) {
      suppressUnused(this._mainElement.offsetWidth);
      suppressUnused(this._sidebarElement.offsetWidth);
    }

    // 2. Issue onresize to the sidebar element, its size won't change.
    if (!reverse)
      this._sidebarWidget.doResize();

    // 3. Configure and run animation
    this.contentElement.style.setProperty('transition', animatedMarginPropertyName + ' ' + animationTime + 'ms linear');

    const boundAnimationFrame = animationFrame.bind(this);
    let startTime;
    /**
     * @this {UI.SplitWidget}
     */
    function animationFrame() {
      this._animationFrameHandle = 0;

      if (!startTime) {
        // Kick animation on first frame.
        this.contentElement.style.setProperty(animatedMarginPropertyName, marginTo);
        startTime = window.performance.now();
      } else if (window.performance.now() < startTime + animationTime) {
        // Process regular animation frame.
        if (this._mainWidget)
          this._mainWidget.doResize();
      } else {
        // Complete animation.
        this._cancelAnimation();
        if (this._mainWidget)
          this._mainWidget.doResize();
        this.dispatchEventToListeners(UI.SplitWidget.Events.SidebarSizeChanged, this.sidebarSize());
        return;
      }
      this._animationFrameHandle = this.contentElement.window().requestAnimationFrame(boundAnimationFrame);
    }
    this._animationFrameHandle = this.contentElement.window().requestAnimationFrame(boundAnimationFrame);
  }

  _cancelAnimation() {
    this.contentElement.style.removeProperty('margin-top');
    this.contentElement.style.removeProperty('margin-right');
    this.contentElement.style.removeProperty('margin-bottom');
    this.contentElement.style.removeProperty('margin-left');
    this.contentElement.style.removeProperty('transition');

    if (this._animationFrameHandle) {
      this.contentElement.window().cancelAnimationFrame(this._animationFrameHandle);
      this._animationFrameHandle = 0;
    }
    if (this._animationCallback) {
      this._animationCallback();
      this._animationCallback = null;
    }
  }

  /**
   * @param {number} sidebarSize
   * @param {boolean=} userAction
   * @return {number}
   */
  _applyConstraints(sidebarSize, userAction) {
    const totalSize = this._totalSizeDIP();
    const zoomFactor = this._constraintsInDip ? 1 : UI.zoomManager.zoomFactor();

    let constraints = this._sidebarWidget ? this._sidebarWidget.constraints() : new UI.Constraints();
    let minSidebarSize = this.isVertical() ? constraints.minimum.width : constraints.minimum.height;
    if (!minSidebarSize)
      minSidebarSize = UI.SplitWidget.MinPadding;
    minSidebarSize *= zoomFactor;
    if (this._sidebarMinimized)
      sidebarSize = minSidebarSize;

    let preferredSidebarSize = this.isVertical() ? constraints.preferred.width : constraints.preferred.height;
    if (!preferredSidebarSize)
      preferredSidebarSize = UI.SplitWidget.MinPadding;
    preferredSidebarSize *= zoomFactor;
    // Allow sidebar to be less than preferred by explicit user action.
    if (sidebarSize < preferredSidebarSize)
      preferredSidebarSize = Math.max(sidebarSize, minSidebarSize);
    preferredSidebarSize += zoomFactor;  // 1 css pixel for splitter border.

    constraints = this._mainWidget ? this._mainWidget.constraints() : new UI.Constraints();
    let minMainSize = this.isVertical() ? constraints.minimum.width : constraints.minimum.height;
    if (!minMainSize)
      minMainSize = UI.SplitWidget.MinPadding;
    minMainSize *= zoomFactor;

    let preferredMainSize = this.isVertical() ? constraints.preferred.width : constraints.preferred.height;
    if (!preferredMainSize)
      preferredMainSize = UI.SplitWidget.MinPadding;
    preferredMainSize *= zoomFactor;
    const savedMainSize = this.isVertical() ? this._savedVerticalMainSize : this._savedHorizontalMainSize;
    if (savedMainSize !== null)
      preferredMainSize = Math.min(preferredMainSize, savedMainSize * zoomFactor);
    if (userAction)
      preferredMainSize = minMainSize;

    // Enough space for preferred.
    const totalPreferred = preferredMainSize + preferredSidebarSize;
    if (totalPreferred <= totalSize)
      return Number.constrain(sidebarSize, preferredSidebarSize, totalSize - preferredMainSize);

    // Enough space for minimum.
    if (minMainSize + minSidebarSize <= totalSize) {
      const delta = totalPreferred - totalSize;
      const sidebarDelta = delta * preferredSidebarSize / totalPreferred;
      sidebarSize = preferredSidebarSize - sidebarDelta;
      return Number.constrain(sidebarSize, minSidebarSize, totalSize - minMainSize);
    }

    // Not enough space even for minimum sizes.
    return Math.max(0, totalSize - minMainSize);
  }

  /**
   * @override
   */
  wasShown() {
    this._forceUpdateLayout();
    UI.zoomManager.addEventListener(UI.ZoomManager.Events.ZoomChanged, this._onZoomChanged, this);
  }

  /**
   * @override
   */
  willHide() {
    UI.zoomManager.removeEventListener(UI.ZoomManager.Events.ZoomChanged, this._onZoomChanged, this);
  }

  /**
   * @override
   */
  onResize() {
    this._updateLayout();
  }

  /**
   * @override
   */
  onLayout() {
    this._updateLayout();
  }

  /**
   * @override
   * @return {!UI.Constraints}
   */
  calculateConstraints() {
    if (this._showMode === UI.SplitWidget.ShowMode.OnlyMain)
      return this._mainWidget ? this._mainWidget.constraints() : new UI.Constraints();
    if (this._showMode === UI.SplitWidget.ShowMode.OnlySidebar)
      return this._sidebarWidget ? this._sidebarWidget.constraints() : new UI.Constraints();

    let mainConstraints = this._mainWidget ? this._mainWidget.constraints() : new UI.Constraints();
    let sidebarConstraints = this._sidebarWidget ? this._sidebarWidget.constraints() : new UI.Constraints();
    const min = UI.SplitWidget.MinPadding;
    if (this._isVertical) {
      mainConstraints = mainConstraints.widthToMax(min).addWidth(1);  // 1 for splitter
      sidebarConstraints = sidebarConstraints.widthToMax(min);
      return mainConstraints.addWidth(sidebarConstraints).heightToMax(sidebarConstraints);
    } else {
      mainConstraints = mainConstraints.heightToMax(min).addHeight(1);  // 1 for splitter
      sidebarConstraints = sidebarConstraints.heightToMax(min);
      return mainConstraints.widthToMax(sidebarConstraints).addHeight(sidebarConstraints);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _onResizeStart(event) {
    this._resizeStartSizeDIP = this._sidebarSizeDIP;
  }

  /**
   * @param {!Common.Event} event
   */
  _onResizeUpdate(event) {
    const offset = event.data.currentPosition - event.data.startPosition;
    const offsetDIP = UI.zoomManager.cssToDIP(offset);
    const newSizeDIP =
        this._secondIsSidebar ? this._resizeStartSizeDIP - offsetDIP : this._resizeStartSizeDIP + offsetDIP;
    const constrainedSizeDIP = this._applyConstraints(newSizeDIP, true);
    this._savedSidebarSizeDIP = constrainedSizeDIP;
    this._saveSetting();
    this._innerSetSidebarSizeDIP(constrainedSizeDIP, false, true);
    if (this.isVertical())
      this._savedVerticalMainSize = this._totalSizeDIP() - this._sidebarSizeDIP;
    else
      this._savedHorizontalMainSize = this._totalSizeDIP() - this._sidebarSizeDIP;
  }

  /**
   * @param {!Common.Event} event
   */
  _onResizeEnd(event) {
    this._resizeStartSizeDIP = 0;
  }

  /**
   * @param {boolean=} noSplitter
   */
  hideDefaultResizer(noSplitter) {
    this.uninstallResizer(this._resizerElement);
    this._sidebarElement.classList.toggle('no-default-splitter', !!noSplitter);
  }

  /**
   * @param {!Element} resizerElement
   */
  installResizer(resizerElement) {
    this._resizerWidget.addElement(resizerElement);
  }

  /**
   * @param {!Element} resizerElement
   */
  uninstallResizer(resizerElement) {
    this._resizerWidget.removeElement(resizerElement);
  }

  /**
   * @return {boolean}
   */
  hasCustomResizer() {
    const elements = this._resizerWidget.elements();
    return elements.length > 1 || (elements.length === 1 && elements[0] !== this._resizerElement);
  }

  /**
   * @param {!Element} resizer
   * @param {boolean} on
   */
  toggleResizer(resizer, on) {
    if (on)
      this.installResizer(resizer);
    else
      this.uninstallResizer(resizer);
  }

  /**
   * @return {?UI.SplitWidget.SettingForOrientation}
   */
  _settingForOrientation() {
    const state = this._setting ? this._setting.get() : {};
    return this._isVertical ? state.vertical : state.horizontal;
  }

  /**
   * @return {number}
   */
  _preferredSidebarSizeDIP() {
    let size = this._savedSidebarSizeDIP;
    if (!size) {
      size = this._isVertical ? this._defaultSidebarWidth : this._defaultSidebarHeight;
      // If we have default value in percents, calculate it on first use.
      if (0 < size && size < 1)
        size *= this._totalSizeDIP();
    }
    return size;
  }

  _restoreSidebarSizeFromSettings() {
    const settingForOrientation = this._settingForOrientation();
    this._savedSidebarSizeDIP = settingForOrientation ? settingForOrientation.size : 0;
  }

  _restoreAndApplyShowModeFromSettings() {
    const orientationState = this._settingForOrientation();
    this._savedShowMode = orientationState && orientationState.showMode ? orientationState.showMode : this._showMode;
    this._showMode = this._savedShowMode;

    switch (this._savedShowMode) {
      case UI.SplitWidget.ShowMode.Both:
        this.showBoth();
        break;
      case UI.SplitWidget.ShowMode.OnlyMain:
        this.hideSidebar();
        break;
      case UI.SplitWidget.ShowMode.OnlySidebar:
        this.hideMain();
        break;
    }
  }

  _saveShowModeToSettings() {
    this._savedShowMode = this._showMode;
    this._saveSetting();
  }

  _saveSetting() {
    if (!this._setting)
      return;
    const state = this._setting.get();
    const orientationState = (this._isVertical ? state.vertical : state.horizontal) || {};

    orientationState.size = this._savedSidebarSizeDIP;
    if (this._shouldSaveShowMode)
      orientationState.showMode = this._savedShowMode;

    if (this._isVertical)
      state.vertical = orientationState;
    else
      state.horizontal = orientationState;
    this._setting.set(state);
  }

  _forceUpdateLayout() {
    // Force layout even if sidebar size does not change.
    this._sidebarSizeDIP = -1;
    this._updateLayout();
  }

  /**
   * @param {!Common.Event} event
   */
  _onZoomChanged(event) {
    this._forceUpdateLayout();
  }

  /**
   * @param {string} title
   * @return {!UI.ToolbarButton}
   */
  createShowHideSidebarButton(title) {
    this._showHideSidebarButtonTitle = Common.UIString(title);
    this._showHideSidebarButton = new UI.ToolbarButton('', '');
    this._showHideSidebarButton.addEventListener(UI.ToolbarButton.Events.Click, buttonClicked, this);
    this._updateShowHideSidebarButton();

    /**
     * @param {!Common.Event} event
     * @this {UI.SplitWidget}
     */
    function buttonClicked(event) {
      if (this._showMode !== UI.SplitWidget.ShowMode.Both)
        this.showBoth(true);
      else
        this.hideSidebar(true);
    }

    return this._showHideSidebarButton;
  }

  _updateShowHideSidebarButton() {
    if (!this._showHideSidebarButton)
      return;
    const sidebarHidden = this._showMode === UI.SplitWidget.ShowMode.OnlyMain;
    let glyph = '';
    if (sidebarHidden) {
      glyph = this.isVertical() ?
          (this.isSidebarSecond() ? 'largeicon-show-right-sidebar' : 'largeicon-show-left-sidebar') :
          (this.isSidebarSecond() ? 'largeicon-show-bottom-sidebar' : 'largeicon-show-top-sidebar');
    } else {
      glyph = this.isVertical() ?
          (this.isSidebarSecond() ? 'largeicon-hide-right-sidebar' : 'largeicon-hide-left-sidebar') :
          (this.isSidebarSecond() ? 'largeicon-hide-bottom-sidebar' : 'largeicon-hide-top-sidebar');
    }
    this._showHideSidebarButton.setGlyph(glyph);
    this._showHideSidebarButton.setTitle(
        sidebarHidden ? Common.UIString('Show %s', this._showHideSidebarButtonTitle) :
                        Common.UIString('Hide %s', this._showHideSidebarButtonTitle));
  }
};

/** @typedef {{showMode: string, size: number}} */
UI.SplitWidget.SettingForOrientation;

UI.SplitWidget.ShowMode = {
  Both: 'Both',
  OnlyMain: 'OnlyMain',
  OnlySidebar: 'OnlySidebar'
};

/** @enum {symbol} */
UI.SplitWidget.Events = {
  SidebarSizeChanged: Symbol('SidebarSizeChanged'),
  ShowModeChanged: Symbol('ShowModeChanged')
};

UI.SplitWidget.MinPadding = 20;
