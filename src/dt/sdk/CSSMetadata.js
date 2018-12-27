/*
 * Copyright (C) 2010 Nikita Vasilyev. All rights reserved.
 * Copyright (C) 2010 Joseph Pecoraro. All rights reserved.
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 * @unrestricted
 */
SDK.CSSMetadata = class {
  /**
   * @param {!Array.<!{name: string, longhands: !Array.<string>, inherited: boolean, svg: boolean}>} properties
   */
  constructor(properties) {
    this._values = /** !Array.<string> */ ([]);
    /** @type {!Map<string, !Array<string>>} */
    this._longhands = new Map();
    /** @type {!Map<string, !Array<string>>} */
    this._shorthands = new Map();
    /** @type {!Set<string>} */
    this._inherited = new Set();
    /** @type {!Set<string>} */
    this._svgProperties = new Set();
    for (let i = 0; i < properties.length; ++i) {
      const property = properties[i];
      const propertyName = property.name;
      if (!CSS.supports(propertyName, 'initial'))
        continue;
      this._values.push(propertyName);

      if (property.inherited)
        this._inherited.add(propertyName);
      if (property.svg)
        this._svgProperties.add(propertyName);

      const longhands = properties[i].longhands;
      if (longhands) {
        this._longhands.set(propertyName, longhands);
        for (let j = 0; j < longhands.length; ++j) {
          const longhandName = longhands[j];
          let shorthands = this._shorthands.get(longhandName);
          if (!shorthands) {
            shorthands = [];
            this._shorthands.set(longhandName, shorthands);
          }
          shorthands.push(propertyName);
        }
      }
    }
    this._values.sort();
    this._valuesSet = new Set(this._values);
  }

  /**
   * @return {!Array<string>}
   */
  allProperties() {
    return this._values;
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  isSVGProperty(name) {
    name = name.toLowerCase();
    return this._svgProperties.has(name);
  }

  /**
   * @param {string} shorthand
   * @return {?Array.<string>}
   */
  longhands(shorthand) {
    return this._longhands.get(shorthand) || null;
  }

  /**
   * @param {string} longhand
   * @return {?Array.<string>}
   */
  shorthands(longhand) {
    return this._shorthands.get(longhand) || null;
  }

  /**
   * @param {string} propertyName
   * @return {boolean}
   */
  isColorAwareProperty(propertyName) {
    return !!SDK.CSSMetadata._colorAwareProperties.has(propertyName.toLowerCase()) ||
        this.isCustomProperty(propertyName.toLowerCase());
  }

  /**
   * @param {string} propertyName
   * @return {boolean}
   */
  isLengthProperty(propertyName) {
    propertyName = propertyName.toLowerCase();
    if (propertyName === 'line-height')
      return false;
    return SDK.CSSMetadata._distanceProperties.has(propertyName) || propertyName.startsWith('margin') ||
        propertyName.startsWith('padding') || propertyName.indexOf('width') !== -1 ||
        propertyName.indexOf('height') !== -1;
  }

  /**
   * @param {string} propertyName
   * @return {boolean}
   */
  isBezierAwareProperty(propertyName) {
    propertyName = propertyName.toLowerCase();
    return !!SDK.CSSMetadata._bezierAwareProperties.has(propertyName) || this.isCustomProperty(propertyName);
  }

  /**
   * @param {string} propertyName
   * @return {boolean}
   */
  isCustomProperty(propertyName) {
    return propertyName.startsWith('--');
  }

  /**
   * @param {string} name
   * @return {string}
   */
  canonicalPropertyName(name) {
    name = name.toLowerCase();
    if (!name || name.length < 9 || name.charAt(0) !== '-')
      return name;
    const match = name.match(/(?:-webkit-)(.+)/);
    if (!match || !this._valuesSet.has(match[1]))
      return name;
    return match[1];
  }

  /**
   * @param {string} propertyName
   * @return {boolean}
   */
  isCSSPropertyName(propertyName) {
    propertyName = propertyName.toLowerCase();
    if (propertyName.startsWith('-moz-') || propertyName.startsWith('-o-') || propertyName.startsWith('-webkit-') ||
        propertyName.startsWith('-ms-'))
      return true;
    return this._valuesSet.has(propertyName);
  }

  /**
   * @param {string} propertyName
   * @return {boolean}
   */
  isPropertyInherited(propertyName) {
    propertyName = propertyName.toLowerCase();
    return propertyName.startsWith('--') || this._inherited.has(this.canonicalPropertyName(propertyName)) ||
        this._inherited.has(propertyName);
  }

  /**
   * @param {string} propertyName
   * @return {!Array<string>}
   */
  propertyValues(propertyName) {
    const acceptedKeywords = ['inherit', 'initial', 'unset'];
    propertyName = propertyName.toLowerCase();
    const unprefixedName = propertyName.replace(/^-webkit-/, '');
    const entry = SDK.CSSMetadata._propertyDataMap[propertyName] || SDK.CSSMetadata._propertyDataMap[unprefixedName];
    if (entry && entry.values)
      acceptedKeywords.pushAll(entry.values);
    const commonKeywords = ['auto', 'none'];
    for (const commonKeyword of commonKeywords) {
      if (CSS.supports(propertyName, commonKeyword))
        acceptedKeywords.push(commonKeyword);
    }
    if (this.isColorAwareProperty(propertyName)) {
      acceptedKeywords.push('currentColor');
      for (const color in Common.Color.Nicknames)
        acceptedKeywords.push(color);
    }
    return acceptedKeywords.sort();
  }

  /**
   * @param {string} property
   * @return {number}
   */
  propertyUsageWeight(property) {
    return SDK.CSSMetadata.Weight[property] || SDK.CSSMetadata.Weight[this.canonicalPropertyName(property)] || 0;
  }
};

SDK.CSSMetadata.VariableRegex = /(var\(--.*?\))/g;
SDK.CSSMetadata.URLRegex = /url\(\s*('.+?'|".+?"|[^)]+)\s*\)/g;

/**
 * @return {!SDK.CSSMetadata}
 */
SDK.cssMetadata = function() {
  if (!SDK.CSSMetadata._instance)
    SDK.CSSMetadata._instance = new SDK.CSSMetadata(SDK.CSSMetadata._generatedProperties || []);
  return SDK.CSSMetadata._instance;
};

SDK.CSSMetadata._distanceProperties = new Set([
  'background-position', 'border-spacing', 'bottom', 'font-size', 'height', 'left', 'letter-spacing', 'max-height',
  'max-width', 'min-height', 'min-width', 'right', 'text-indent', 'top', 'width', 'word-spacing', 'grid-row-gap',
  'grid-column-gap', 'row-gap'
]);

SDK.CSSMetadata._bezierAwareProperties = new Set([
  'animation', 'animation-timing-function', 'transition', 'transition-timing-function', '-webkit-animation',
  '-webkit-animation-timing-function', '-webkit-transition', '-webkit-transition-timing-function'
]);

SDK.CSSMetadata._colorAwareProperties = new Set([
  'backdrop-filter',
  'background',
  'background-color',
  'background-image',
  'border',
  'border-color',
  'border-image',
  'border-image-source',
  'border-bottom',
  'border-bottom-color',
  'border-left',
  'border-left-color',
  'border-right',
  'border-right-color',
  'border-top',
  'border-top-color',
  'box-shadow',
  'caret-color',
  'color',
  'column-rule',
  'column-rule-color',
  'fill',
  'list-style',
  'list-style-image',
  'outline',
  'outline-color',
  'stroke',
  'text-decoration-color',
  'text-shadow',
  '-webkit-border-after',
  '-webkit-border-after-color',
  '-webkit-border-before',
  '-webkit-border-before-color',
  '-webkit-border-end',
  '-webkit-border-end-color',
  '-webkit-border-start',
  '-webkit-border-start-color',
  '-webkit-box-reflect',
  '-webkit-box-shadow',
  '-webkit-column-rule-color',
  '-webkit-filter',
  '-webkit-mask',
  '-webkit-mask-box-image',
  '-webkit-mask-box-image-source',
  '-webkit-mask-image',
  '-webkit-tap-highlight-color',
  '-webkit-text-decoration-color',
  '-webkit-text-emphasis',
  '-webkit-text-emphasis-color',
  '-webkit-text-fill-color',
  '-webkit-text-stroke',
  '-webkit-text-stroke-color'
]);

SDK.CSSMetadata._propertyDataMap = {
  'table-layout': {values: ['fixed']},
  'visibility': {values: ['hidden', 'visible', 'collapse']},
  'background-repeat': {values: ['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round']},
  'content': {values: ['normal', 'close-quote', 'no-close-quote', 'no-open-quote', 'open-quote']},
  'clear': {values: ['left', 'right', 'both']},
  'overflow-x': {values: ['hidden', 'visible', 'overlay', 'scroll', '-webkit-paged-x', '-webkit-paged-y']},
  'stroke-linejoin': {values: ['round', 'miter', 'bevel']},
  'baseline-shift': {values: ['baseline', 'sub', 'super']},
  'border-bottom-width': {values: ['medium', 'thick', 'thin']},
  'margin-top-collapse': {values: ['collapse', 'separate', 'discard']},
  'max-height': {values: ['min-content', 'max-content', '-webkit-fill-available', 'fit-content']},
  'box-orient': {
    values: ['horizontal', 'vertical', 'inline-axis', 'block-axis'],
  },
  'font-stretch': {
    values: [
      'normal', 'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'semi-expanded', 'expanded',
      'extra-expanded', 'ultra-expanded'
    ]
  },
  'border-left-width': {values: ['medium', 'thick', 'thin']},
  'box-shadow': {values: ['inset']},
  '-webkit-writing-mode': {values: ['horizontal-tb', 'vertical-rl', 'vertical-lr']},
  'writing-mode':
      {values: ['lr', 'rl', 'tb', 'lr-tb', 'rl-tb', 'tb-rl', 'horizontal-tb', 'vertical-rl', 'vertical-lr']},
  'border-collapse': {values: ['collapse', 'separate']},
  'page-break-inside': {values: ['avoid']},
  'border-top-width': {values: ['medium', 'thick', 'thin']},
  'outline-style': {values: ['inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double', 'hidden']},
  'cursor': {
    values: [
      'copy',
      'crosshair',
      'default',
      'grab',
      'grabbing',
      'pointer',
      'move',
      'vertical-text',
      'cell',
      'context-menu',
      'alias',
      'progress',
      'no-drop',
      'not-allowed',
      '-webkit-zoom-in',
      '-webkit-zoom-out',
      'e-resize',
      'ne-resize',
      'nw-resize',
      'n-resize',
      'se-resize',
      'sw-resize',
      's-resize',
      'w-resize',
      'ew-resize',
      'ns-resize',
      'nesw-resize',
      'nwse-resize',
      'col-resize',
      'row-resize',
      'text',
      'wait',
      'help',
      'all-scroll',
      'zoom-in',
      'zoom-out',
      '-webkit-grab',
      '-webkit-grabbing'
    ]
  },
  'border-width': {values: ['medium', 'thick', 'thin']},
  'border-style': {values: ['hidden', 'inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double']},
  'size': {values: ['a3', 'a4', 'a5', 'b4', 'b5', 'landscape', 'ledger', 'legal', 'letter', 'portrait']},
  'background-size': {values: ['contain', 'cover']},
  'direction': {values: ['ltr', 'rtl']},
  'enable-background': {values: ['accumulate', 'new']},
  'float': {values: ['left', 'right']},
  'overflow-y': {values: ['hidden', 'visible', 'overlay', 'scroll', '-webkit-paged-x', '-webkit-paged-y']},
  'margin-bottom-collapse': {values: ['collapse', 'separate', 'discard']},
  'box-reflect': {values: ['left', 'right', 'above', 'below']},
  'overflow': {values: ['hidden', 'visible', 'overlay', 'scroll', '-webkit-paged-x', '-webkit-paged-y']},
  'overscroll-behavior': {values: ['contain']},
  'overscroll-behavior-x': {values: ['contain']},
  'overscroll-behavior-y': {values: ['contain']},
  'contain': {values: ['strict', 'content', 'size', 'layout', 'style', 'paint']},
  'text-rendering': {values: ['optimizeSpeed', 'optimizeLegibility', 'geometricPrecision']},
  'text-align': {
    values: [
      '-webkit-auto', 'start', 'end', 'left', 'right', 'center', 'justify', '-webkit-left', '-webkit-right',
      '-webkit-center', '-webkit-match-parent'
    ]
  },
  'list-style-position': {values: ['outside', 'inside']},
  'color-interpolation': {values: ['sRGB', 'linearRGB']},
  'background-origin': {values: ['border-box', 'content-box', 'padding-box']},
  'word-wrap': {values: ['normal', 'break-word']},
  'font-weight':
      {values: ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900']},
  'margin-before-collapse': {values: ['collapse', 'separate', 'discard']},
  'text-transform': {values: ['capitalize', 'uppercase', 'lowercase']},
  'border-right-style':
      {values: ['hidden', 'inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double']},
  'border-left-style':
      {values: ['hidden', 'inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double']},
  '-webkit-text-emphasis': {values: ['circle', 'filled', 'open', 'dot', 'double-circle', 'triangle', 'sesame']},
  'font-style': {values: ['italic', 'oblique', 'normal']},
  'speak': {values: ['normal', 'spell-out', 'digits', 'literal-punctuation', 'no-punctuation']},
  'color-rendering': {values: ['optimizeSpeed', 'optimizeQuality']},
  'list-style-type': {
    values: [
      'disc',
      'circle',
      'square',
      'decimal',
      'decimal-leading-zero',
      'arabic-indic',
      'bengali',
      'cambodian',
      'khmer',
      'devanagari',
      'gujarati',
      'gurmukhi',
      'kannada',
      'lao',
      'malayalam',
      'mongolian',
      'myanmar',
      'oriya',
      'persian',
      'urdu',
      'telugu',
      'tibetan',
      'thai',
      'lower-roman',
      'upper-roman',
      'lower-greek',
      'lower-alpha',
      'lower-latin',
      'upper-alpha',
      'upper-latin',
      'ethiopic-halehame',
      'ethiopic-halehame-am',
      'ethiopic-halehame-ti-er',
      'ethiopic-halehame-ti-et',
      'cjk-earthly-branch',
      'cjk-heavenly-stem',
      'hangul-consonant',
      'hangul',
      'korean-hangul-formal',
      'korean-hanja-formal',
      'korean-hanja-informal',
      'simp-chinese-formal',
      'simp-chinese-informal',
      'trad-chinese-formal',
      'trad-chinese-informal',
      'hebrew',
      'armenian',
      'lower-armenian',
      'upper-armenian',
      'georgian',
      'cjk-ideographic',
      'hiragana',
      'katakana',
      'hiragana-iroha',
      'katakana-iroha'
    ]
  },
  'text-combine-upright': {values: ['all']},
  '-webkit-text-combine': {values: ['horizontal']},
  'text-orientation': {values: ['mixed', 'upright', 'sideways', 'sideways-right']},
  'outline': {
    values: ['inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin']
  },
  'font': {
    values: [
      'caption',
      'icon',
      'menu',
      'message-box',
      'small-caption',
      '-webkit-mini-control',
      '-webkit-small-control',
      '-webkit-control',
      'status-bar',
      'italic',
      'oblique',
      'small-caps',
      'normal',
      'bold',
      'bolder',
      'lighter',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      'xx-small',
      'x-small',
      'small',
      'medium',
      'large',
      'x-large',
      'xx-large',
      '-webkit-xxx-large',
      'smaller',
      'larger',
      'serif',
      'sans-serif',
      'cursive',
      'fantasy',
      'monospace',
      '-webkit-body',
      '-webkit-pictograph'
    ]
  },
  'dominant-baseline': {
    values: [
      'middle', 'central', 'text-before-edge', 'text-after-edge', 'ideographic', 'alphabetic', 'hanging',
      'mathematical', 'use-script', 'no-change', 'reset-size'
    ]
  },
  'display': {
    values: [
      'inline',
      'block',
      'flow-root',
      'list-item',
      'inline-block',
      'table',
      'inline-table',
      'table-row-group',
      'table-header-group',
      'table-footer-group',
      'table-row',
      'table-column-group',
      'table-column',
      'table-cell',
      'table-caption',
      '-webkit-box',
      '-webkit-inline-box',
      'flex',
      'inline-flex',
      'grid',
      'inline-grid',
      'contents'
    ]
  },
  '-webkit-text-emphasis-position': {values: ['over', 'under']},
  'image-rendering': {values: ['pixelated', '-webkit-optimize-contrast', 'optimizeSpeed', 'optimizeQuality']},
  'alignment-baseline': {
    values: [
      'baseline', 'middle', 'before-edge', 'after-edge', 'central', 'text-before-edge', 'text-after-edge',
      'ideographic', 'alphabetic', 'hanging', 'mathematical'
    ]
  },
  'outline-width': {values: ['medium', 'thick', 'thin']},
  'box-align': {values: ['baseline', 'center', 'stretch', 'start', 'end']},
  'border-right-width': {values: ['medium', 'thick', 'thin']},
  'border-top-style': {values: ['hidden', 'inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double']},
  'line-height': {values: ['normal']},
  'text-overflow': {values: ['clip', 'ellipsis']},
  'overflow-wrap': {values: ['normal', 'break-word']},
  'box-direction': {values: ['normal', 'reverse']},
  'margin-after-collapse': {values: ['collapse', 'separate', 'discard']},
  'page-break-before': {values: ['left', 'right', 'always', 'avoid']},
  'border-image': {values: ['repeat', 'stretch', 'space', 'round']},
  'text-decoration':
      {values: ['blink', 'line-through', 'overline', 'underline', 'wavy', 'double', 'solid', 'dashed', 'dotted']},
  'position': {values: ['absolute', 'fixed', 'relative', 'static', 'sticky']},
  'font-family':
      {values: ['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace', '-webkit-body', '-webkit-pictograph']},
  'border-bottom-style':
      {values: ['hidden', 'inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double']},
  'unicode-bidi': {values: ['normal', 'bidi-override', 'embed', 'isolate', 'isolate-override', 'plaintext']},
  'clip-rule': {values: ['nonzero', 'evenodd']},
  'zoom': {values: ['normal']},
  'max-width': {values: ['min-content', 'max-content', '-webkit-fill-available', 'fit-content']},
  'caption-side': {values: ['top', 'bottom']},
  'empty-cells': {values: ['hide', 'show']},
  'pointer-events': {
    values: [
      'all', 'visible', 'visiblepainted', 'visiblefill', 'visiblestroke', 'painted', 'fill', 'stroke', 'bounding-box'
    ]
  },
  'letter-spacing': {values: ['normal']},
  'background-clip': {values: ['border-box', 'content-box', 'padding-box']},
  '-webkit-font-smoothing': {values: ['antialiased', 'subpixel-antialiased']},
  'border': {
    values: [
      'hidden', 'inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  'font-size': {
    values: [
      'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', '-webkit-xxx-large', 'smaller', 'larger'
    ]
  },
  'font-variant': {
    values: [
      'small-caps',
      'normal',
      'common-ligatures',
      'no-common-ligatures',
      'discretionary-ligatures',
      'no-discretionary-ligatures',
      'historical-ligatures',
      'no-historical-ligatures',
      'contextual',
      'no-contextual',
      'all-small-caps',
      'petite-caps',
      'all-petite-caps',
      'unicase',
      'titling-caps',
      'lining-nums',
      'oldstyle-nums',
      'proportional-nums',
      'tabular-nums',
      'diagonal-fractions',
      'stacked-fractions',
      'ordinal',
      'slashed-zero',
      'jis78',
      'jis83',
      'jis90',
      'jis04',
      'simplified',
      'traditional',
      'full-width',
      'proportional-width',
      'ruby'
    ]
  },
  'vertical-align': {
    values:
        ['baseline', 'middle', 'sub', 'super', 'text-top', 'text-bottom', 'top', 'bottom', '-webkit-baseline-middle']
  },
  'white-space': {values: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap']},
  'page-break-after': {values: ['left', 'right', 'always', 'avoid']},
  'word-break': {values: ['normal', 'break-all', 'break-word', 'keep-all']},
  'word-spacing': {values: ['normal']},
  '-webkit-text-emphasis-style': {values: ['circle', 'filled', 'open', 'dot', 'double-circle', 'triangle', 'sesame']},
  'transform': {
    values: [
      'scale',      'scaleX',     'scaleY',      'scale3d', 'rotate',   'rotateX',    'rotateY',
      'rotateZ',    'rotate3d',   'skew',        'skewX',   'skewY',    'translate',  'translateX',
      'translateY', 'translateZ', 'translate3d', 'matrix',  'matrix3d', 'perspective'
    ]
  },
  'box-sizing': {values: ['content-box', 'border-box']},
  'resize': {values: ['both', 'horizontal', 'vertical']},
  'align-content': {
    values: [
      'normal', 'baseline', 'space-between', 'space-around', 'space-evenly', 'stretch', 'unsafe', 'safe', 'center',
      'start', 'end', 'flex-start', 'flex-end', 'left', 'right'
    ]
  },
  'justify-content': {
    values: [
      'normal', 'space-between', 'space-around', 'space-evenly', 'stretch', 'unsafe', 'safe', 'center', 'start', 'end',
      'flex-start', 'flex-end', 'left', 'right', 'baseline'
    ]
  },
  'place-content': {
    values: [
      'normal', 'space-between', 'space-around', 'space-evenly', 'stretch', 'unsafe', 'safe', 'center', 'start', 'end',
      'flex-start', 'flex-end', 'left', 'right', 'baseline'
    ]
  },
  'align-items': {
    values: [
      'normal', 'stretch', 'baseline', 'unsafe', 'safe', 'center', 'start', 'end', 'self-start', 'self-end',
      'flex-start', 'flex-end', 'left', 'right'
    ]
  },
  'justify-items': {
    values: [
      'normal', 'stretch', 'baseline', 'unsafe', 'safe', 'center', 'start', 'end', 'self-start', 'self-end',
      'flex-start', 'flex-end', 'left', 'right', 'legacy'
    ]
  },
  'place-items': {
    values: [
      'normal', 'stretch', 'baseline', 'unsafe', 'safe', 'center', 'start', 'end', 'self-start', 'self-end',
      'flex-start', 'flex-end', 'left', 'right'
    ]
  },
  'align-self': {
    values: [
      'normal', 'stretch', 'baseline', 'unsafe', 'safe', 'center', 'start', 'end', 'self-start', 'self-end',
      'flex-start', 'flex-end', 'left', 'right'
    ]
  },
  'justify-self': {
    values: [
      'normal', 'stretch', 'baseline', 'unsafe', 'safe', 'center', 'start', 'end', 'self-start', 'self-end',
      'flex-start', 'flex-end', 'left', 'right'
    ]
  },
  'place-self': {
    values: [
      'normal', 'stretch', 'baseline', 'unsafe', 'safe', 'center', 'start', 'end', 'self-start', 'self-end',
      'flex-start', 'flex-end', 'left', 'right'
    ]
  },
  'flex-direction': {values: ['row', 'row-reverse', 'column', 'column-reverse']},
  'flex-wrap': {values: ['nowrap', 'wrap', 'wrap-reverse']},
  'perspective-origin': {values: ['left', 'center', 'right', 'top', 'bottom']},
  'transform-origin': {values: ['left', 'center', 'right', 'top', 'bottom']},
  'transform-style': {values: ['flat', 'preserve-3d']},
  'transition-timing-function': {
    values: [
      'ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'steps', 'frames',
      'cubic-bezier', 'step-middle'
    ]
  },
  'animation-timing-function': {
    values: [
      'ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'steps', 'frames',
      'cubic-bezier', 'step-middle'
    ]
  },
  'animation-direction': {values: ['normal', 'reverse', 'alternate', 'alternate-reverse']},
  'animation-play-state': {values: ['running', 'paused']},
  'animation-fill-mode': {values: ['forwards', 'backwards', 'both']},
  '-webkit-backface-visibility': {values: ['visible', 'hidden']},
  '-webkit-box-decoration-break': {values: ['slice', 'clone']},
  '-webkit-column-break-after':
      {values: ['always', 'avoid', 'left', 'right', 'page', 'column', 'avoid-page', 'avoid-column']},
  '-webkit-column-break-before':
      {values: ['always', 'avoid', 'left', 'right', 'page', 'column', 'avoid-page', 'avoid-column']},
  '-webkit-column-break-inside': {values: ['avoid', 'avoid-page', 'avoid-column']},
  '-webkit-column-span': {values: ['all']},
  '-webkit-column-gap': {values: ['normal']},
  'filter': {
    values: [
      'url', 'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale', 'hue-rotate', 'invert', 'opacity',
      'saturate', 'sepia'
    ]
  },
  'line-break': {values: ['loose', 'normal', 'strict', 'after-white-space']},
  'user-select': {values: ['text', 'all']},
  '-webkit-user-modify': {values: ['read-only', 'read-write', 'read-write-plaintext-only']},
  'text-align-last': {values: ['start', 'end', 'left', 'right', 'center', 'justify']},
  '-webkit-text-decoration-line': {values: ['underline', 'overline', 'line-through', 'blink']},
  '-webkit-text-decoration-style': {values: ['solid', 'double', 'dotted', 'dashed', 'wavy']},
  'mix-blend-mode': {
    values: [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
      'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'unset'
    ]
  },
  'background-blend-mode': {
    values: [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
      'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'unset'
    ]
  },
  'grid-template-columns': {values: ['min-content', 'max-content']},
  'grid-template-rows': {values: ['min-content', 'max-content']},
  'grid-auto-columns': {values: ['min-content', 'max-content']},
  'grid-auto-rows': {values: ['min-content', 'max-content']},
  'grid-auto-flow': {values: ['row', 'column', 'dense']},
  'row-gap': {values: ['normal']},
  'animation-iteration-count': {values: ['infinite']},
  'font-feature-settings': {values: ['normal']},
  'font-kerning': {values: ['normal']},
  'font-variant-caps':
      {values: ['small-caps', 'all-small-caps', 'petite-caps', 'all-petite-caps', 'unicase', 'titling-caps', 'normal']},
  'font-variant-east-asian': {
    values: [
      'jis78', 'jis83', 'jis90', 'jis04', 'simplified', 'traditional', 'full-width', 'proportional-width', 'ruby',
      'normal'
    ]
  },
  'font-variant-ligatures': {
    values: [
      'common-ligatures', 'no-common-ligatures', 'discretionary-ligatures', 'no-discretionary-ligatures',
      'historical-ligatures', 'no-historical-ligatures', 'contextual', 'no-contextual', 'normal'
    ]
  },
  'font-variant-numeric': {
    values: [
      'lining-nums', 'oldstyle-nums', 'proportional-nums', 'tabular-nums', 'diagonal-fractions', 'stacked-fractions',
      'ordinal', 'slashed-zero', 'normal'
    ]
  },
  'font-variation-settings': {values: ['normal']},
  'backface-visibility': {values: ['hidden', 'visible']},
  'background': {
    values: [
      'repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'top', 'bottom', 'left', 'right', 'center', 'fixed', 'local',
      'scroll', 'space', 'round', 'border-box', 'content-box', 'padding-box'
    ]
  },
  'background-attachment': {values: ['fixed', 'local', 'scroll']},
  'background-position': {values: ['top', 'bottom', 'left', 'right', 'center']},
  'background-position-x': {values: ['left', 'right', 'center']},
  'background-position-y': {values: ['top', 'bottom', 'center']},
  'background-repeat-x': {values: ['repeat', 'no-repeat']},
  'background-repeat-y': {values: ['repeat', 'no-repeat']},
  'border-bottom': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  'border-image-repeat': {values: ['repeat', 'stretch', 'space', 'round']},
  'border-left': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  'border-right': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  'border-top': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  'break-after': {values: ['left', 'right', 'avoid', 'column', 'avoid-page', 'page', 'recto', 'verso', 'avoid-column']},
  'break-before':
      {values: ['left', 'right', 'avoid', 'column', 'avoid-page', 'page', 'recto', 'verso', 'avoid-column']},
  'break-inside': {values: ['avoid', 'avoid-page', 'avoid-column']},
  'buffered-rendering': {values: ['static', 'dynamic']},
  'color-interpolation-filters': {values: ['srgb', 'linearrgb']},
  'column-fill': {values: ['balance']},
  'column-gap': {values: ['normal']},
  'column-rule': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  'column-rule-style':
      {values: ['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']},
  'column-rule-width': {values: ['medium', 'thick', 'thin']},
  'column-span': {values: ['all']},
  'fill-rule': {values: ['nonzero', 'evenodd']},
  'flex-flow': {values: ['nowrap', 'row', 'row-reverse', 'column', 'column-reverse', 'wrap', 'wrap-reverse']},
  'height': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'hyphens': {values: ['manual']},
  'inline-size': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'isolation': {values: ['isolate']},
  'list-style': {
    values: [
      'outside',
      'inside',
      'disc',
      'circle',
      'square',
      'decimal',
      'decimal-leading-zero',
      'arabic-indic',
      'bengali',
      'cambodian',
      'khmer',
      'devanagari',
      'gujarati',
      'gurmukhi',
      'kannada',
      'lao',
      'malayalam',
      'mongolian',
      'myanmar',
      'oriya',
      'persian',
      'urdu',
      'telugu',
      'tibetan',
      'thai',
      'lower-roman',
      'upper-roman',
      'lower-greek',
      'lower-alpha',
      'lower-latin',
      'upper-alpha',
      'upper-latin',
      'cjk-earthly-branch',
      'cjk-heavenly-stem',
      'ethiopic-halehame',
      'ethiopic-halehame-am',
      'ethiopic-halehame-ti-er',
      'ethiopic-halehame-ti-et',
      'hangul',
      'hangul-consonant',
      'korean-hangul-formal',
      'korean-hanja-formal',
      'korean-hanja-informal',
      'hebrew',
      'armenian',
      'lower-armenian',
      'upper-armenian',
      'georgian',
      'cjk-ideographic',
      'simp-chinese-formal',
      'simp-chinese-informal',
      'trad-chinese-formal',
      'trad-chinese-informal',
      'hiragana',
      'katakana',
      'hiragana-iroha',
      'katakana-iroha'
    ]
  },
  'mask-source-type': {values: ['alpha', 'luminance']},
  'mask-type': {values: ['alpha', 'luminance']},
  'max-block-size': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'max-inline-size': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'min-block-size': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'min-height': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'min-inline-size': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'min-width': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  'object-fit': {values: ['contain', 'cover', 'fill', 'scale-down']},
  'object-position': {values: ['top', 'bottom', 'left', 'right', 'center']},
  'offset-anchor': {values: ['top', 'bottom', 'left', 'right', 'center']},
  'offset-position': {values: ['top', 'bottom', 'left', 'right', 'center']},
  'offset-rotate': {values: ['reverse']},
  'overflow-anchor': {values: ['visible']},
  'paint-order': {values: ['normal', 'fill', 'stroke', 'markers']},
  'scroll-behavior': {values: ['smooth']},
  'scroll-customization': {
    values: [
      'pan-x',
      'pan-y',
      'pan-left',
      'pan-right',
      'pan-up',
      'pan-down',
    ]
  },
  'scroll-snap-align': {values: ['start', 'end', 'center']},
  'scroll-snap-stop': {values: ['normal', 'always']},
  'scroll-snap-type': {values: ['x', 'y', 'block', 'inline', 'both', 'mandatory', 'proximity']},
  'shape-outside': {values: ['border-box', 'content-box', 'padding-box', 'margin-box']},
  'shape-rendering': {values: ['optimizespeed', 'geometricprecision', 'crispedges']},
  'stroke-linecap': {values: ['square', 'round', 'butt']},
  'text-anchor': {values: ['middle', 'start', 'end']},
  'text-decoration-line': {values: ['blink', 'line-through', 'overline', 'underline']},
  'text-decoration-style': {values: ['dotted', 'dashed', 'solid', 'double', 'wavy']},
  'text-justify': {values: ['inter-word', 'distribute']},
  'text-underline-position': {values: ['under']},
  'touch-action':
      {values: ['pan-x', 'pan-y', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'manipulation', 'pinch-zoom']},
  'transform-box': {values: ['border-box', 'fill-box', 'view-box']},
  'vector-effect': {values: ['non-scaling-stroke']},
  '-webkit-app-region': {values: ['drag', 'no-drag']},
  '-webkit-appearance': {
    values: [
      'checkbox',
      'radio',
      'push-button',
      'square-button',
      'button',
      'button-bevel',
      'inner-spin-button',
      'listbox',
      'listitem',
      'media-enter-fullscreen-button',
      'media-exit-fullscreen-button',
      'media-mute-button',
      'media-play-button',
      'media-overlay-play-button',
      'media-toggle-closed-captions-button',
      'media-slider',
      'media-sliderthumb',
      'media-volume-slider-container',
      'media-volume-slider',
      'media-volume-sliderthumb',
      'media-controls-background',
      'media-controls-fullscreen-background',
      'media-current-time-display',
      'media-time-remaining-display',
      'menulist',
      'menulist-button',
      'menulist-text',
      'menulist-textfield',
      'meter',
      'progress-bar',
      'progress-bar-value',
      'slider-horizontal',
      'slider-vertical',
      'sliderthumb-horizontal',
      'sliderthumb-vertical',
      'caret',
      'searchfield',
      'searchfield-cancel-button',
      'textfield',
      'textarea'
    ]
  },
  '-webkit-border-after': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  '-webkit-border-after-style':
      {values: ['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']},
  '-webkit-border-after-width': {values: ['medium', 'thick', 'thin']},
  '-webkit-border-before': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  '-webkit-border-before-style':
      {values: ['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']},
  '-webkit-border-before-width': {values: ['medium', 'thick', 'thin']},
  '-webkit-border-end': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  '-webkit-border-end-style':
      {values: ['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']},
  '-webkit-border-end-width': {values: ['medium', 'thick', 'thin']},
  '-webkit-border-start': {
    values: [
      'hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin'
    ]
  },
  '-webkit-border-start-style':
      {values: ['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']},
  '-webkit-border-start-width': {values: ['medium', 'thick', 'thin']},
  '-webkit-box-pack': {values: ['center', 'justify', 'start', 'end']},
  '-webkit-logical-height': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  '-webkit-logical-width': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  '-webkit-margin-collapse': {values: ['collapse', 'separate', 'discard']},
  '-webkit-mask-box-image': {values: ['repeat', 'stretch', 'space', 'round']},
  '-webkit-mask-box-image-repeat': {values: ['repeat', 'stretch', 'space', 'round']},
  '-webkit-mask-clip': {values: ['text', 'border', 'border-box', 'content', 'content-box', 'padding', 'padding-box']},
  '-webkit-mask-composite': {
    values: [
      'clear', 'copy', 'source-over', 'source-in', 'source-out', 'source-atop', 'destination-over', 'destination-in',
      'destination-out', 'destination-atop', 'xor', 'plus-lighter'
    ]
  },
  '-webkit-mask-origin': {values: ['border', 'border-box', 'content', 'content-box', 'padding', 'padding-box']},
  '-webkit-mask-position': {values: ['top', 'bottom', 'left', 'right', 'center']},
  '-webkit-mask-position-x': {values: ['left', 'right', 'center']},
  '-webkit-mask-position-y': {values: ['top', 'bottom', 'center']},
  '-webkit-mask-repeat': {values: ['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round']},
  '-webkit-mask-size': {values: ['contain', 'cover']},
  '-webkit-max-logical-height': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  '-webkit-max-logical-width': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  '-webkit-min-logical-height': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  '-webkit-min-logical-width': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
  '-webkit-perspective-origin-x': {values: ['left', 'right', 'center']},
  '-webkit-perspective-origin-y': {values: ['top', 'bottom', 'center']},
  '-webkit-print-color-adjust': {values: ['economy', 'exact']},
  '-webkit-rtl-ordering': {values: ['logical', 'visual']},
  '-webkit-ruby-position': {values: ['after', 'before']},
  '-webkit-text-decorations-in-effect': {values: ['blink', 'line-through', 'overline', 'underline']},
  '-webkit-text-security': {values: ['disc', 'circle', 'square']},
  '-webkit-text-stroke': {values: ['medium', 'thick', 'thin']},
  '-webkit-text-stroke-width': {values: ['medium', 'thick', 'thin']},
  '-webkit-transform-origin-x': {values: ['left', 'right', 'center']},
  '-webkit-transform-origin-y': {values: ['top', 'bottom', 'center']},
  '-webkit-user-drag': {values: ['element']},
  'width': {values: ['-webkit-fill-available', 'min-content', 'max-content', 'fit-content']},
};

// Weight of CSS properties based on their usage from https://www.chromestatus.com/metrics/css/popularity
SDK.CSSMetadata.Weight = {
  'align-content': 57,
  'align-items': 129,
  'align-self': 55,
  'animation': 175,
  'animation-delay': 114,
  'animation-direction': 113,
  'animation-duration': 137,
  'animation-fill-mode': 132,
  'animation-iteration-count': 124,
  'animation-name': 139,
  'animation-play-state': 104,
  'animation-timing-function': 141,
  'backface-visibility': 123,
  'background': 260,
  'background-attachment': 119,
  'background-clip': 165,
  'background-color': 259,
  'background-image': 246,
  'background-origin': 107,
  'background-position': 237,
  'background-position-x': 108,
  'background-position-y': 93,
  'background-repeat': 234,
  'background-size': 203,
  'border': 263,
  'border-bottom': 233,
  'border-bottom-color': 190,
  'border-bottom-left-radius': 186,
  'border-bottom-right-radius': 185,
  'border-bottom-style': 150,
  'border-bottom-width': 179,
  'border-collapse': 209,
  'border-color': 226,
  'border-image': 89,
  'border-image-outset': 50,
  'border-image-repeat': 49,
  'border-image-slice': 58,
  'border-image-source': 32,
  'border-image-width': 52,
  'border-left': 221,
  'border-left-color': 174,
  'border-left-style': 142,
  'border-left-width': 172,
  'border-radius': 224,
  'border-right': 223,
  'border-right-color': 182,
  'border-right-style': 130,
  'border-right-width': 178,
  'border-spacing': 198,
  'border-style': 206,
  'border-top': 231,
  'border-top-color': 192,
  'border-top-left-radius': 187,
  'border-top-right-radius': 189,
  'border-top-style': 152,
  'border-top-width': 180,
  'border-width': 214,
  'bottom': 227,
  'box-shadow': 213,
  'box-sizing': 216,
  'caption-side': 96,
  'clear': 229,
  'clip': 173,
  'clip-rule': 5,
  'color': 256,
  'content': 219,
  'counter-increment': 111,
  'counter-reset': 110,
  'cursor': 250,
  'direction': 176,
  'display': 262,
  'empty-cells': 99,
  'fill': 140,
  'fill-opacity': 82,
  'fill-rule': 22,
  'filter': 160,
  'flex': 133,
  'flex-basis': 66,
  'flex-direction': 85,
  'flex-flow': 94,
  'flex-grow': 112,
  'flex-shrink': 61,
  'flex-wrap': 68,
  'float': 252,
  'font': 211,
  'font-family': 254,
  'font-kerning': 18,
  'font-size': 264,
  'font-stretch': 77,
  'font-style': 220,
  'font-variant': 161,
  'font-weight': 257,
  'height': 266,
  'image-rendering': 90,
  'justify-content': 127,
  'left': 248,
  'letter-spacing': 188,
  'line-height': 244,
  'list-style': 215,
  'list-style-image': 145,
  'list-style-position': 149,
  'list-style-type': 199,
  'margin': 267,
  'margin-bottom': 241,
  'margin-left': 243,
  'margin-right': 238,
  'margin-top': 253,
  'mask': 20,
  'max-height': 205,
  'max-width': 225,
  'min-height': 217,
  'min-width': 218,
  'object-fit': 33,
  'opacity': 251,
  'order': 117,
  'orphans': 146,
  'outline': 222,
  'outline-color': 153,
  'outline-offset': 147,
  'outline-style': 151,
  'outline-width': 148,
  'overflow': 255,
  'overflow-wrap': 105,
  'overflow-x': 184,
  'overflow-y': 196,
  'padding': 265,
  'padding-bottom': 230,
  'padding-left': 235,
  'padding-right': 232,
  'padding-top': 240,
  'page': 8,
  'page-break-after': 120,
  'page-break-before': 69,
  'page-break-inside': 121,
  'perspective': 92,
  'perspective-origin': 103,
  'pointer-events': 183,
  'position': 261,
  'quotes': 158,
  'resize': 168,
  'right': 245,
  'shape-rendering': 38,
  'size': 64,
  'speak': 118,
  'src': 170,
  'stop-color': 42,
  'stop-opacity': 31,
  'stroke': 98,
  'stroke-dasharray': 36,
  'stroke-dashoffset': 3,
  'stroke-linecap': 30,
  'stroke-linejoin': 21,
  'stroke-miterlimit': 12,
  'stroke-opacity': 34,
  'stroke-width': 87,
  'table-layout': 171,
  'tab-size': 46,
  'text-align': 260,
  'text-anchor': 35,
  'text-decoration': 247,
  'text-indent': 207,
  'text-overflow': 204,
  'text-rendering': 155,
  'text-shadow': 208,
  'text-transform': 202,
  'top': 258,
  'touch-action': 80,
  'transform': 181,
  'transform-origin': 162,
  'transform-style': 86,
  'transition': 193,
  'transition-delay': 134,
  'transition-duration': 135,
  'transition-property': 131,
  'transition-timing-function': 122,
  'unicode-bidi': 156,
  'unicode-range': 136,
  'vertical-align': 236,
  'visibility': 242,
  '-webkit-appearance': 191,
  '-webkit-backface-visibility': 154,
  '-webkit-background-clip': 164,
  '-webkit-background-origin': 40,
  '-webkit-background-size': 163,
  '-webkit-border-end': 9,
  '-webkit-border-horizontal-spacing': 81,
  '-webkit-border-image': 75,
  '-webkit-border-radius': 212,
  '-webkit-border-start': 10,
  '-webkit-border-start-color': 16,
  '-webkit-border-start-width': 13,
  '-webkit-border-vertical-spacing': 43,
  '-webkit-box-align': 101,
  '-webkit-box-direction': 51,
  '-webkit-box-flex': 128,
  '-webkit-box-ordinal-group': 91,
  '-webkit-box-orient': 144,
  '-webkit-box-pack': 106,
  '-webkit-box-reflect': 39,
  '-webkit-box-shadow': 210,
  '-webkit-column-break-inside': 60,
  '-webkit-column-count': 84,
  '-webkit-column-gap': 76,
  '-webkit-column-rule': 25,
  '-webkit-column-rule-color': 23,
  '-webkit-columns': 44,
  '-webkit-column-span': 29,
  '-webkit-column-width': 47,
  '-webkit-filter': 159,
  '-webkit-font-feature-settings': 59,
  '-webkit-font-smoothing': 177,
  '-webkit-highlight': 1,
  '-webkit-line-break': 45,
  '-webkit-line-clamp': 126,
  '-webkit-margin-after': 67,
  '-webkit-margin-before': 70,
  '-webkit-margin-collapse': 14,
  '-webkit-margin-end': 65,
  '-webkit-margin-start': 100,
  '-webkit-margin-top-collapse': 78,
  '-webkit-mask': 19,
  '-webkit-mask-box-image': 72,
  '-webkit-mask-image': 88,
  '-webkit-mask-position': 54,
  '-webkit-mask-repeat': 63,
  '-webkit-mask-size': 79,
  '-webkit-padding-after': 15,
  '-webkit-padding-before': 28,
  '-webkit-padding-end': 48,
  '-webkit-padding-start': 73,
  '-webkit-print-color-adjust': 83,
  '-webkit-rtl-ordering': 7,
  '-webkit-tap-highlight-color': 169,
  '-webkit-text-emphasis-color': 11,
  '-webkit-text-fill-color': 71,
  '-webkit-text-security': 17,
  '-webkit-text-stroke': 56,
  '-webkit-text-stroke-color': 37,
  '-webkit-text-stroke-width': 53,
  '-webkit-user-drag': 95,
  '-webkit-user-modify': 62,
  '-webkit-user-select': 194,
  '-webkit-writing-mode': 4,
  'white-space': 228,
  'widows': 115,
  'width': 268,
  'will-change': 74,
  'word-break': 166,
  'word-spacing': 157,
  'word-wrap': 197,
  'writing-mode': 41,
  'z-index': 239,
  'zoom': 200
};
