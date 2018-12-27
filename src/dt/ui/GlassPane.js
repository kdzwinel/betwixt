// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

UI.GlassPane = class {
  constructor() {
    this._widget = new UI.Widget(true);
    this._widget.markAsRoot();
    this.element = this._widget.element;
    this.contentElement = this._widget.contentElement;
    this._arrowElement = UI.Icon.create('', 'arrow hidden');
    this.element.shadowRoot.appendChild(this._arrowElement);

    this.registerRequiredCSS('ui/glassPane.css');
    this.setPointerEventsBehavior(UI.GlassPane.PointerEventsBehavior.PierceGlassPane);

    this._onMouseDownBound = this._onMouseDown.bind(this);
    /** @type {?function(!Event)} */
    this._onClickOutsideCallback = null;
    /** @type {?UI.Size} */
    this._maxSize = null;
    /** @type {?number} */
    this._positionX = null;
    /** @type {?number} */
    this._positionY = null;
    /** @type {?AnchorBox} */
    this._anchorBox = null;
    this._anchorBehavior = UI.GlassPane.AnchorBehavior.PreferTop;
    this._sizeBehavior = UI.GlassPane.SizeBehavior.SetExactSize;
    this._marginBehavior = UI.GlassPane.MarginBehavior.DefaultMargin;
  }

  /**
   * @return {boolean}
   */
  isShowing() {
    return this._widget.isShowing();
  }

  /**
   * @param {string} cssFile
   */
  registerRequiredCSS(cssFile) {
    this._widget.registerRequiredCSS(cssFile);
  }

  /**
   * @param {?Element} element
   */
  setDefaultFocusedElement(element) {
    this._widget.setDefaultFocusedElement(element);
  }

  /**
   * @param {boolean} dimmed
   */
  setDimmed(dimmed) {
    this.element.classList.toggle('dimmed-pane', dimmed);
  }

  /**
   * @param {!UI.GlassPane.PointerEventsBehavior} pointerEventsBehavior
   */
  setPointerEventsBehavior(pointerEventsBehavior) {
    this.element.classList.toggle(
        'no-pointer-events', pointerEventsBehavior !== UI.GlassPane.PointerEventsBehavior.BlockedByGlassPane);
    this.contentElement.classList.toggle(
        'no-pointer-events', pointerEventsBehavior === UI.GlassPane.PointerEventsBehavior.PierceContents);
  }

  /**
   * @param {?function(!Event)} callback
   */
  setOutsideClickCallback(callback) {
    this._onClickOutsideCallback = callback;
  }

  /**
   * @param {?UI.Size} size
   */
  setMaxContentSize(size) {
    this._maxSize = size;
    this._positionContent();
  }

  /**
   * @param {!UI.GlassPane.SizeBehavior} sizeBehavior
   */
  setSizeBehavior(sizeBehavior) {
    this._sizeBehavior = sizeBehavior;
    this._positionContent();
  }

  /**
   * @param {?number} x
   * @param {?number} y
   * Position is relative to root element.
   */
  setContentPosition(x, y) {
    this._positionX = x;
    this._positionY = y;
    this._positionContent();
  }

  /**
   * @param {?AnchorBox} anchorBox
   * Anchor box is relative to the document.
   */
  setContentAnchorBox(anchorBox) {
    this._anchorBox = anchorBox;
    this._positionContent();
  }

  /**
   * @param {!UI.GlassPane.AnchorBehavior} behavior
   */
  setAnchorBehavior(behavior) {
    this._anchorBehavior = behavior;
  }

  /**
   * @param {boolean} behavior
   */
  setMarginBehavior(behavior) {
    this._marginBehavior = behavior;
    this._arrowElement.classList.toggle('hidden', behavior !== UI.GlassPane.MarginBehavior.Arrow);
  }

  /**
   * @param {!Document} document
   */
  show(document) {
    if (this.isShowing())
      return;
    // Deliberately starts with 3000 to hide other z-indexed elements below.
    this.element.style.zIndex = 3000 + 1000 * UI.GlassPane._panes.size;
    document.body.addEventListener('mousedown', this._onMouseDownBound, true);
    this._widget.show(document.body);
    UI.GlassPane._panes.add(this);
    this._positionContent();
  }

  hide() {
    if (!this.isShowing())
      return;
    UI.GlassPane._panes.delete(this);
    this.element.ownerDocument.body.removeEventListener('mousedown', this._onMouseDownBound, true);
    this._widget.detach();
  }

  /**
   * @param {!Event} event
   */
  _onMouseDown(event) {
    if (!this._onClickOutsideCallback)
      return;
    const node = event.deepElementFromPoint();
    if (!node || this.contentElement.isSelfOrAncestor(node))
      return;
    this._onClickOutsideCallback.call(null, event);
  }

  _positionContent() {
    if (!this.isShowing())
      return;

    const showArrow = this._marginBehavior === UI.GlassPane.MarginBehavior.Arrow;
    const gutterSize = showArrow ? 8 : (this._marginBehavior === UI.GlassPane.MarginBehavior.NoMargin ? 0 : 3);
    const scrollbarSize = UI.measuredScrollbarWidth(this.element.ownerDocument);
    const arrowSize = 10;

    const container = UI.GlassPane._containers.get(/** @type {!Document} */ (this.element.ownerDocument));
    if (this._sizeBehavior === UI.GlassPane.SizeBehavior.MeasureContent) {
      this.contentElement.positionAt(0, 0);
      this.contentElement.style.width = '';
      this.contentElement.style.maxWidth = '';
      this.contentElement.style.height = '';
      this.contentElement.style.maxHeight = '';
    }

    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;

    let width = containerWidth - gutterSize * 2;
    let height = containerHeight - gutterSize * 2;
    let positionX = gutterSize;
    let positionY = gutterSize;

    if (this._maxSize) {
      width = Math.min(width, this._maxSize.width);
      height = Math.min(height, this._maxSize.height);
    }

    if (this._sizeBehavior === UI.GlassPane.SizeBehavior.MeasureContent) {
      const measuredRect = this.contentElement.getBoundingClientRect();
      const widthOverflow = height < measuredRect.height ? scrollbarSize : 0;
      const heightOverflow = width < measuredRect.width ? scrollbarSize : 0;
      width = Math.min(width, measuredRect.width + widthOverflow);
      height = Math.min(height, measuredRect.height + heightOverflow);
    }

    if (this._anchorBox) {
      const anchorBox = this._anchorBox.relativeToElement(container);
      let behavior = this._anchorBehavior;
      this._arrowElement.classList.remove('arrow-none', 'arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');

      if (behavior === UI.GlassPane.AnchorBehavior.PreferTop || behavior === UI.GlassPane.AnchorBehavior.PreferBottom) {
        const top = anchorBox.y - 2 * gutterSize;
        const bottom = containerHeight - anchorBox.y - anchorBox.height - 2 * gutterSize;
        if (behavior === UI.GlassPane.AnchorBehavior.PreferTop && top < height && bottom > top)
          behavior = UI.GlassPane.AnchorBehavior.PreferBottom;
        if (behavior === UI.GlassPane.AnchorBehavior.PreferBottom && bottom < height && top > bottom)
          behavior = UI.GlassPane.AnchorBehavior.PreferTop;

        let arrowY;
        let enoughHeight = true;
        if (behavior === UI.GlassPane.AnchorBehavior.PreferTop) {
          positionY = Math.max(gutterSize, anchorBox.y - height - gutterSize);
          const spaceTop = anchorBox.y - positionY - gutterSize;
          if (this._sizeBehavior === UI.GlassPane.SizeBehavior.MeasureContent) {
            if (height > spaceTop) {
              this._arrowElement.classList.add('arrow-none');
              enoughHeight = false;
            }
          } else {
            height = Math.min(height, spaceTop);
          }
          this._arrowElement.setIconType('mediumicon-arrow-bottom');
          this._arrowElement.classList.add('arrow-bottom');
          arrowY = anchorBox.y - gutterSize;
        } else {
          positionY = anchorBox.y + anchorBox.height + gutterSize;
          const spaceBottom = containerHeight - positionY - gutterSize;
          if (this._sizeBehavior === UI.GlassPane.SizeBehavior.MeasureContent) {
            if (height > spaceBottom) {
              this._arrowElement.classList.add('arrow-none');
              positionY = containerHeight - gutterSize - height;
              enoughHeight = false;
            }
          } else {
            height = Math.min(height, spaceBottom);
          }
          this._arrowElement.setIconType('mediumicon-arrow-top');
          this._arrowElement.classList.add('arrow-top');
          arrowY = anchorBox.y + anchorBox.height + gutterSize;
        }

        positionX = Math.max(gutterSize, Math.min(anchorBox.x, containerWidth - width - gutterSize));
        if (!enoughHeight)
          positionX = Math.min(positionX + arrowSize, containerWidth - width - gutterSize);
        else if (showArrow && positionX - arrowSize >= gutterSize)
          positionX -= arrowSize;
        width = Math.min(width, containerWidth - positionX - gutterSize);
        if (2 * arrowSize >= width) {
          this._arrowElement.classList.add('arrow-none');
        } else {
          let arrowX = anchorBox.x + Math.min(50, Math.floor(anchorBox.width / 2));
          arrowX = Number.constrain(arrowX, positionX + arrowSize, positionX + width - arrowSize);
          this._arrowElement.positionAt(arrowX, arrowY, container);
        }
      } else {
        const left = anchorBox.x - 2 * gutterSize;
        const right = containerWidth - anchorBox.x - anchorBox.width - 2 * gutterSize;
        if (behavior === UI.GlassPane.AnchorBehavior.PreferLeft && left < width && right > left)
          behavior = UI.GlassPane.AnchorBehavior.PreferRight;
        if (behavior === UI.GlassPane.AnchorBehavior.PreferRight && right < width && left > right)
          behavior = UI.GlassPane.AnchorBehavior.PreferLeft;

        let arrowX;
        let enoughWidth = true;
        if (behavior === UI.GlassPane.AnchorBehavior.PreferLeft) {
          positionX = Math.max(gutterSize, anchorBox.x - width - gutterSize);
          const spaceLeft = anchorBox.x - positionX - gutterSize;
          if (this._sizeBehavior === UI.GlassPane.SizeBehavior.MeasureContent) {
            if (width > spaceLeft) {
              this._arrowElement.classList.add('arrow-none');
              enoughWidth = false;
            }
          } else {
            width = Math.min(width, spaceLeft);
          }
          this._arrowElement.setIconType('mediumicon-arrow-right');
          this._arrowElement.classList.add('arrow-right');
          arrowX = anchorBox.x - gutterSize;
        } else {
          positionX = anchorBox.x + anchorBox.width + gutterSize;
          const spaceRight = containerWidth - positionX - gutterSize;
          if (this._sizeBehavior === UI.GlassPane.SizeBehavior.MeasureContent) {
            if (width > spaceRight) {
              this._arrowElement.classList.add('arrow-none');
              positionX = containerWidth - gutterSize - width;
              enoughWidth = false;
            }
          } else {
            width = Math.min(width, spaceRight);
          }
          this._arrowElement.setIconType('mediumicon-arrow-left');
          this._arrowElement.classList.add('arrow-left');
          arrowX = anchorBox.x + anchorBox.width + gutterSize;
        }

        positionY = Math.max(gutterSize, Math.min(anchorBox.y, containerHeight - height - gutterSize));
        if (!enoughWidth)
          positionY = Math.min(positionY + arrowSize, containerHeight - height - gutterSize);
        else if (showArrow && positionY - arrowSize >= gutterSize)
          positionY -= arrowSize;
        height = Math.min(height, containerHeight - positionY - gutterSize);
        if (2 * arrowSize >= height) {
          this._arrowElement.classList.add('arrow-none');
        } else {
          let arrowY = anchorBox.y + Math.min(50, Math.floor(anchorBox.height / 2));
          arrowY = Number.constrain(arrowY, positionY + arrowSize, positionY + height - arrowSize);
          this._arrowElement.positionAt(arrowX, arrowY, container);
        }
      }
    } else {
      positionX = this._positionX !== null ? this._positionX : (containerWidth - width) / 2;
      positionY = this._positionY !== null ? this._positionY : (containerHeight - height) / 2;
      width = Math.min(width, containerWidth - positionX - gutterSize);
      height = Math.min(height, containerHeight - positionY - gutterSize);
      this._arrowElement.classList.add('arrow-none');
    }

    this.contentElement.style.width = width + 'px';
    if (this._sizeBehavior === UI.GlassPane.SizeBehavior.SetExactWidthMaxHeight)
      this.contentElement.style.maxHeight = height + 'px';
    else
      this.contentElement.style.height = height + 'px';

    this.contentElement.positionAt(positionX, positionY, container);
    this._widget.doResize();
  }

  /**
   * @protected
   * @return {!UI.Widget}
   */
  widget() {
    return this._widget;
  }

  /**
   * @param {!Element} element
   */
  static setContainer(element) {
    UI.GlassPane._containers.set(/** @type {!Document} */ (element.ownerDocument), element);
    UI.GlassPane.containerMoved(element);
  }

  /**
   * @param {!Document} document
   * @return {!Element}
   */
  static container(document) {
    return UI.GlassPane._containers.get(document);
  }

  /**
   * @param {!Element} element
   */
  static containerMoved(element) {
    for (const pane of UI.GlassPane._panes) {
      if (pane.isShowing() && pane.element.ownerDocument === element.ownerDocument)
        pane._positionContent();
    }
  }
};

/** @enum {symbol} */
UI.GlassPane.PointerEventsBehavior = {
  BlockedByGlassPane: Symbol('BlockedByGlassPane'),
  PierceGlassPane: Symbol('PierceGlassPane'),
  PierceContents: Symbol('PierceContents')
};

/** @enum {symbol} */
UI.GlassPane.AnchorBehavior = {
  PreferTop: Symbol('PreferTop'),
  PreferBottom: Symbol('PreferBottom'),
  PreferLeft: Symbol('PreferLeft'),
  PreferRight: Symbol('PreferRight'),
};

/** @enum {symbol} */
UI.GlassPane.SizeBehavior = {
  SetExactSize: Symbol('SetExactSize'),
  SetExactWidthMaxHeight: Symbol('SetExactWidthMaxHeight'),
  MeasureContent: Symbol('MeasureContent')
};

/** @enum {symbol} */
UI.GlassPane.MarginBehavior = {
  Arrow: Symbol('Arrow'),
  DefaultMargin: Symbol('DefaultMargin'),
  NoMargin: Symbol('NoMargin')
};

/** @type {!Map<!Document, !Element>} */
UI.GlassPane._containers = new Map();
/** @type {!Set<!UI.GlassPane>} */
UI.GlassPane._panes = new Set();
