// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {HTMLSpanElement}
 */
UI.Icon = class extends HTMLSpanElement {
  constructor() {
    super();
    throw new Error('icon must be created via factory method.');
  }

  /**
   * @param {string=} iconType
   * @param {string=} className
   * @return {!UI.Icon}
   */
  static create(iconType, className) {
    if (!UI.Icon._constructor)
      UI.Icon._constructor = UI.registerCustomElement('span', 'ui-icon', UI.Icon.prototype);

    const icon = /** @type {!UI.Icon} */ (new UI.Icon._constructor());
    if (className)
      icon.className = className;
    if (iconType)
      icon.setIconType(iconType);
    return icon;
  }

  /**
   * @override
   */
  createdCallback() {
    /** @type {?UI.Icon.Descriptor} */
    this._descriptor = null;
    /** @type {?UI.Icon.SpriteSheet} */
    this._spriteSheet = null;
    /** @type {string} */
    this._iconType = '';
  }

  /**
   * @param {string} iconType
   */
  setIconType(iconType) {
    if (this._descriptor) {
      this.style.removeProperty('--spritesheet-position');
      this.style.removeProperty('width');
      this.style.removeProperty('height');
      this._toggleClasses(false);
      this._iconType = '';
      this._descriptor = null;
      this._spriteSheet = null;
    }
    const descriptor = UI.Icon.Descriptors[iconType] || null;
    if (descriptor) {
      this._iconType = iconType;
      this._descriptor = descriptor;
      this._spriteSheet = UI.Icon.SpriteSheets[this._descriptor.spritesheet];
      console.assert(
          this._spriteSheet, `ERROR: icon ${this._iconType} has unknown spritesheet: ${this._descriptor.spritesheet}`);

      this.style.setProperty('--spritesheet-position', this._propertyValue());
      this.style.setProperty('width', this._spriteSheet.cellWidth + 'px');
      this.style.setProperty('height', this._spriteSheet.cellHeight + 'px');
      this._toggleClasses(true);
    } else if (iconType) {
      throw new Error(`ERROR: failed to find icon descriptor for type: ${iconType}`);
    }
  }

  /**
   * @param {boolean} value
   */
  _toggleClasses(value) {
    this.classList.toggle('spritesheet-' + this._descriptor.spritesheet, value);
    this.classList.toggle(this._iconType, value);
    this.classList.toggle('icon-mask', value && !!this._descriptor.isMask);
    this.classList.toggle('icon-invert', value && !!this._descriptor.invert);
  }

  /**
   * @return {string}
   */
  _propertyValue() {
    if (!this._descriptor.coordinates) {
      if (!this._descriptor.position || !UI.Icon._positionRegex.test(this._descriptor.position))
        throw new Error(`ERROR: icon '${this._iconType}' has malformed position: '${this._descriptor.position}'`);
      const column = this._descriptor.position[0].toLowerCase().charCodeAt(0) - 97;
      const row = parseInt(this._descriptor.position.substring(1), 10) - 1;
      this._descriptor.coordinates = {
        x: -(this._spriteSheet.cellWidth + this._spriteSheet.padding) * column,
        y: (this._spriteSheet.cellHeight + this._spriteSheet.padding) * (row + 1) - this._spriteSheet.padding
      };
    }
    return `${this._descriptor.coordinates.x}px ${this._descriptor.coordinates.y}px`;
  }
};

UI.Icon._positionRegex = /^[a-z][1-9][0-9]*$/;

/** @typedef {{position: string, spritesheet: string, isMask: (boolean|undefined)}} */
UI.Icon.Descriptor;

/** @typedef {{cellWidth: number, cellHeight: number, padding: number}} */
UI.Icon.SpriteSheet;

/** @enum {!UI.Icon.SpriteSheet} */
UI.Icon.SpriteSheets = {
  'smallicons': {cellWidth: 10, cellHeight: 10, padding: 10},
  'mediumicons': {cellWidth: 16, cellHeight: 16, padding: 0},
  'largeicons': {cellWidth: 28, cellHeight: 24, padding: 0},
  'arrowicons': {cellWidth: 19, cellHeight: 19, padding: 0}
};

/** @enum {!UI.Icon.Descriptor} */
UI.Icon.Descriptors = {
  'smallicon-bezier': {position: 'a5', spritesheet: 'smallicons', isMask: true},
  'smallicon-checkmark': {position: 'b5', spritesheet: 'smallicons'},
  'smallicon-checkmark-square': {position: 'b6', spritesheet: 'smallicons', isMask: true},
  'smallicon-checkmark-behind': {position: 'd6', spritesheet: 'smallicons', isMask: true},
  'smallicon-command-result': {position: 'a4', spritesheet: 'smallicons'},
  'smallicon-contrast-ratio': {position: 'a6', spritesheet: 'smallicons', isMask: true},
  'smallicon-cross': {position: 'b4', spritesheet: 'smallicons'},
  'smallicon-device': {position: 'c5', spritesheet: 'smallicons'},
  'smallicon-error': {position: 'c4', spritesheet: 'smallicons'},
  'smallicon-expand-less': {position: 'f5', spritesheet: 'smallicons', isMask: true},
  'smallicon-expand-more': {position: 'e6', spritesheet: 'smallicons', isMask: true},
  'smallicon-green-arrow': {position: 'a3', spritesheet: 'smallicons'},
  'smallicon-green-ball': {position: 'b3', spritesheet: 'smallicons'},
  'smallicon-info': {position: 'c3', spritesheet: 'smallicons'},
  'smallicon-inline-breakpoint-conditional': {position: 'd4', spritesheet: 'smallicons'},
  'smallicon-inline-breakpoint': {position: 'd5', spritesheet: 'smallicons'},
  'smallicon-no': {position: 'c6', spritesheet: 'smallicons', isMask: true},
  'smallicon-orange-ball': {position: 'd3', spritesheet: 'smallicons'},
  'smallicon-red-ball': {position: 'a2', spritesheet: 'smallicons'},
  'smallicon-shadow': {position: 'b2', spritesheet: 'smallicons', isMask: true},
  'smallicon-step-in': {position: 'c2', spritesheet: 'smallicons'},
  'smallicon-step-out': {position: 'd2', spritesheet: 'smallicons'},
  'smallicon-text-prompt': {position: 'e5', spritesheet: 'smallicons'},
  'smallicon-thick-left-arrow': {position: 'e4', spritesheet: 'smallicons'},
  'smallicon-thick-right-arrow': {position: 'e3', spritesheet: 'smallicons'},
  'smallicon-triangle-down': {position: 'e2', spritesheet: 'smallicons', isMask: true},
  'smallicon-triangle-right': {position: 'a1', spritesheet: 'smallicons', isMask: true},
  'smallicon-triangle-up': {position: 'b1', spritesheet: 'smallicons', isMask: true},
  'smallicon-user-command': {position: 'c1', spritesheet: 'smallicons'},
  'smallicon-warning': {position: 'd1', spritesheet: 'smallicons'},
  'smallicon-network-product': {position: 'e1', spritesheet: 'smallicons'},
  'smallicon-clear-warning': {position: 'f1', spritesheet: 'smallicons', isMask: true},
  'smallicon-clear-info': {position: 'f2', spritesheet: 'smallicons'},
  'smallicon-clear-error': {position: 'f3', spritesheet: 'smallicons'},
  'smallicon-account-circle': {position: 'f4', spritesheet: 'smallicons'},

  'mediumicon-clear-storage': {position: 'a4', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-cookie': {position: 'b4', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-database': {position: 'c4', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-info': {position: 'c1', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-manifest': {position: 'd4', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-service-worker': {position: 'a3', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-table': {position: 'b3', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-arrow-in-circle': {position: 'c3', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-file-sync': {position: 'd3', spritesheet: 'mediumicons', invert: true},
  'mediumicon-file': {position: 'a2', spritesheet: 'mediumicons', invert: true},
  'mediumicon-gray-cross-active': {position: 'b2', spritesheet: 'mediumicons'},
  'mediumicon-gray-cross-hover': {position: 'c2', spritesheet: 'mediumicons'},
  'mediumicon-red-cross-active': {position: 'd2', spritesheet: 'mediumicons'},
  'mediumicon-red-cross-hover': {position: 'a1', spritesheet: 'mediumicons'},
  'mediumicon-search': {position: 'b1', spritesheet: 'mediumicons'},
  'mediumicon-replace': {position: 'c5', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-account-circle': {position: 'e4', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-warning-triangle': {position: 'e1', spritesheet: 'mediumicons'},
  'mediumicon-error-circle': {position: 'e3', spritesheet: 'mediumicons'},
  'mediumicon-info-circle': {position: 'e2', spritesheet: 'mediumicons'},
  'mediumicon-bug': {position: 'd1', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-list': {position: 'e5', spritesheet: 'mediumicons', isMask: true},
  'mediumicon-warning': {position: 'd5', spritesheet: 'mediumicons', isMask: true},

  'badge-navigator-file-sync': {position: 'a9', spritesheet: 'largeicons'},
  'largeicon-activate-breakpoints': {position: 'b9', spritesheet: 'largeicons', isMask: true},
  'largeicon-add': {position: 'a8', spritesheet: 'largeicons', isMask: true},
  'largeicon-background-color': {position: 'b8', spritesheet: 'largeicons', isMask: true},
  'largeicon-box-shadow': {position: 'a7', spritesheet: 'largeicons', isMask: true},
  'largeicon-camera': {position: 'b7', spritesheet: 'largeicons', isMask: true},
  'largeicon-center': {position: 'c9', spritesheet: 'largeicons', isMask: true},
  'largeicon-checkmark': {position: 'c8', spritesheet: 'largeicons', isMask: true},
  'largeicon-chevron': {position: 'c7', spritesheet: 'largeicons', isMask: true},
  'largeicon-clear': {position: 'a6', spritesheet: 'largeicons', isMask: true},
  'largeicon-copy': {position: 'b6', spritesheet: 'largeicons', isMask: true},
  'largeicon-deactivate-breakpoints': {position: 'c6', spritesheet: 'largeicons', isMask: true},
  'largeicon-delete': {position: 'd9', spritesheet: 'largeicons', isMask: true},
  'largeicon-dock-to-bottom': {position: 'd8', spritesheet: 'largeicons', isMask: true},
  'largeicon-dock-to-left': {position: 'd7', spritesheet: 'largeicons', isMask: true},
  'largeicon-dock-to-right': {position: 'd6', spritesheet: 'largeicons', isMask: true},
  'largeicon-download': {position: 'h6', spritesheet: 'largeicons', isMask: true},
  'largeicon-edit': {position: 'a5', spritesheet: 'largeicons', isMask: true},
  'largeicon-eyedropper': {position: 'b5', spritesheet: 'largeicons', isMask: true},
  'largeicon-filter': {position: 'c5', spritesheet: 'largeicons', isMask: true},
  'largeicon-foreground-color': {position: 'd5', spritesheet: 'largeicons', isMask: true},
  'largeicon-hide-bottom-sidebar': {position: 'e9', spritesheet: 'largeicons', isMask: true},
  'largeicon-hide-left-sidebar': {position: 'e8', spritesheet: 'largeicons', isMask: true},
  'largeicon-hide-right-sidebar': {position: 'e7', spritesheet: 'largeicons', isMask: true},
  'largeicon-hide-top-sidebar': {position: 'e6', spritesheet: 'largeicons', isMask: true},
  'largeicon-large-list': {position: 'e5', spritesheet: 'largeicons', isMask: true},
  'largeicon-layout-editor': {position: 'a4', spritesheet: 'largeicons', isMask: true},
  'largeicon-load': {position: 'h5', spritesheet: 'largeicons', isMask: true},
  'largeicon-longclick-triangle': {position: 'b4', spritesheet: 'largeicons', isMask: true},
  'largeicon-menu': {position: 'c4', spritesheet: 'largeicons', isMask: true},
  'largeicon-navigator-domain': {position: 'd4', spritesheet: 'largeicons', isMask: true},
  'largeicon-navigator-file': {position: 'e4', spritesheet: 'largeicons', isMask: true},
  'largeicon-navigator-file-sync': {position: 'f9', spritesheet: 'largeicons', isMask: true},
  'largeicon-navigator-folder': {position: 'f8', spritesheet: 'largeicons', isMask: true},
  'largeicon-navigator-frame': {position: 'f7', spritesheet: 'largeicons', isMask: true},
  'largeicon-navigator-snippet': {position: 'f6', spritesheet: 'largeicons', isMask: true},
  'largeicon-navigator-worker': {position: 'f5', spritesheet: 'largeicons', isMask: true},
  'largeicon-node-search': {position: 'f4', spritesheet: 'largeicons', isMask: true},
  'largeicon-pan': {position: 'a3', spritesheet: 'largeicons', isMask: true},
  'largeicon-pause-animation': {position: 'b3', spritesheet: 'largeicons', isMask: true},
  'largeicon-pause': {position: 'c3', spritesheet: 'largeicons', isMask: true},
  'largeicon-pause-on-exceptions': {position: 'd3', spritesheet: 'largeicons', isMask: true},
  'largeicon-phone': {position: 'e3', spritesheet: 'largeicons', isMask: true},
  'largeicon-play-animation': {position: 'f3', spritesheet: 'largeicons', isMask: true},
  'largeicon-play-back': {position: 'a2', spritesheet: 'largeicons', isMask: true},
  'largeicon-play': {position: 'b2', spritesheet: 'largeicons', isMask: true},
  'largeicon-pretty-print': {position: 'c2', spritesheet: 'largeicons', isMask: true},
  'largeicon-refresh': {position: 'd2', spritesheet: 'largeicons', isMask: true},
  'largeicon-replay-animation': {position: 'e2', spritesheet: 'largeicons', isMask: true},
  'largeicon-resume': {position: 'f2', spritesheet: 'largeicons', isMask: true},
  'largeicon-rotate': {position: 'g9', spritesheet: 'largeicons', isMask: true},
  'largeicon-rotate-screen': {position: 'g8', spritesheet: 'largeicons', isMask: true},
  'largeicon-search': {position: 'h4', spritesheet: 'largeicons', isMask: true},
  'largeicon-settings-gear': {position: 'g7', spritesheet: 'largeicons', isMask: true},
  'largeicon-show-bottom-sidebar': {position: 'g6', spritesheet: 'largeicons', isMask: true},
  'largeicon-show-left-sidebar': {position: 'g5', spritesheet: 'largeicons', isMask: true},
  'largeicon-show-right-sidebar': {position: 'g4', spritesheet: 'largeicons', isMask: true},
  'largeicon-show-top-sidebar': {position: 'g3', spritesheet: 'largeicons', isMask: true},
  'largeicon-start-recording': {position: 'g2', spritesheet: 'largeicons', isMask: true},
  'largeicon-step-into': {position: 'a1', spritesheet: 'largeicons', isMask: true},
  'largeicon-step-out': {position: 'b1', spritesheet: 'largeicons', isMask: true},
  'largeicon-step-over': {position: 'c1', spritesheet: 'largeicons', isMask: true},
  'largeicon-step': {position: 'h1', spritesheet: 'largeicons', isMask: true},
  'largeicon-stop-recording': {position: 'd1', spritesheet: 'largeicons', isMask: true},
  'largeicon-terminate-execution': {position: 'h2', spritesheet: 'largeicons', isMask: true},
  'largeicon-text-shadow': {position: 'e1', spritesheet: 'largeicons', isMask: true},
  'largeicon-trash-bin': {position: 'f1', spritesheet: 'largeicons', isMask: true},
  'largeicon-undo': {position: 'h7', spritesheet: 'largeicons', isMask: true},
  'largeicon-undock': {position: 'g1', spritesheet: 'largeicons', isMask: true},
  'largeicon-visibility': {position: 'h9', spritesheet: 'largeicons', isMask: true},
  'largeicon-waterfall': {position: 'h8', spritesheet: 'largeicons', isMask: true},

  'mediumicon-arrow-top': {position: 'a4', spritesheet: 'arrowicons'},
  'mediumicon-arrow-bottom': {position: 'a3', spritesheet: 'arrowicons'},
  'mediumicon-arrow-left': {position: 'a2', spritesheet: 'arrowicons'},
  'mediumicon-arrow-right': {position: 'a1', spritesheet: 'arrowicons'}
};
