/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
UI.Geometry = {};

/**
 * @type {number}
 */
UI.Geometry._Eps = 1e-5;

/**
 * @unrestricted
 */
UI.Geometry.Vector = class {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * @return {number}
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  normalize() {
    const length = this.length();
    if (length <= UI.Geometry._Eps)
      return;

    this.x /= length;
    this.y /= length;
    this.z /= length;
  }
};

/**
 * @unrestricted
 */
UI.Geometry.Point = class {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
   * @param {!UI.Geometry.Point} p
   * @return {number}
   */
  distanceTo(p) {
    return Math.sqrt(Math.pow(p.x - this.x, 2) + Math.pow(p.y - this.y, 2));
  }

  /**
   * @param {!UI.Geometry.Point} line
   * @return {!UI.Geometry.Point}
   */
  projectOn(line) {
    if (line.x === 0 && line.y === 0)
      return new UI.Geometry.Point(0, 0);
    return line.scale((this.x * line.x + this.y * line.y) / (Math.pow(line.x, 2) + Math.pow(line.y, 2)));
  }

  /**
   * @param {number} scalar
   * @return {!UI.Geometry.Point}
   */
  scale(scalar) {
    return new UI.Geometry.Point(this.x * scalar, this.y * scalar);
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return Math.round(this.x * 100) / 100 + ', ' + Math.round(this.y * 100) / 100;
  }
};

/**
 * @unrestricted
 */
UI.Geometry.CubicBezier = class {
  /**
   * @param {!UI.Geometry.Point} point1
   * @param {!UI.Geometry.Point} point2
   */
  constructor(point1, point2) {
    this.controlPoints = [point1, point2];
  }

  /**
   * @param {string} text
   * @return {?UI.Geometry.CubicBezier}
   */
  static parse(text) {
    const keywordValues = UI.Geometry.CubicBezier.KeywordValues;
    const value = text.toLowerCase().replace(/\s+/g, '');
    if (Object.keys(keywordValues).indexOf(value) !== -1)
      return UI.Geometry.CubicBezier.parse(keywordValues[value]);
    const bezierRegex = /^cubic-bezier\(([^,]+),([^,]+),([^,]+),([^,]+)\)$/;
    const match = value.match(bezierRegex);
    if (match) {
      const control1 = new UI.Geometry.Point(parseFloat(match[1]), parseFloat(match[2]));
      const control2 = new UI.Geometry.Point(parseFloat(match[3]), parseFloat(match[4]));
      return new UI.Geometry.CubicBezier(control1, control2);
    }
    return null;
  }

  /**
   * @param {number} t
   * @return {!UI.Geometry.Point}
   */
  evaluateAt(t) {
    /**
     * @param {number} v1
     * @param {number} v2
     * @param {number} t
     */
    function evaluate(v1, v2, t) {
      return 3 * (1 - t) * (1 - t) * t * v1 + 3 * (1 - t) * t * t * v2 + Math.pow(t, 3);
    }

    const x = evaluate(this.controlPoints[0].x, this.controlPoints[1].x, t);
    const y = evaluate(this.controlPoints[0].y, this.controlPoints[1].y, t);
    return new UI.Geometry.Point(x, y);
  }

  /**
   * @return {string}
   */
  asCSSText() {
    const raw = 'cubic-bezier(' + this.controlPoints.join(', ') + ')';
    const keywordValues = UI.Geometry.CubicBezier.KeywordValues;
    for (const keyword in keywordValues) {
      if (raw === keywordValues[keyword])
        return keyword;
    }
    return raw;
  }
};

/** @type {!RegExp} */
UI.Geometry.CubicBezier.Regex = /((cubic-bezier\([^)]+\))|\b(linear|ease-in-out|ease-in|ease-out|ease)\b)/g;

UI.Geometry.CubicBezier.KeywordValues = {
  'linear': 'cubic-bezier(0, 0, 1, 1)',
  'ease': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  'ease-in': 'cubic-bezier(0.42, 0, 1, 1)',
  'ease-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
  'ease-out': 'cubic-bezier(0, 0, 0.58, 1)'
};


/**
 * @unrestricted
 */
UI.Geometry.EulerAngles = class {
  /**
   * @param {number} alpha
   * @param {number} beta
   * @param {number} gamma
   */
  constructor(alpha, beta, gamma) {
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;
  }

  /**
   * @param {!CSSMatrix} rotationMatrix
   * @return {!UI.Geometry.EulerAngles}
   */
  static fromRotationMatrix(rotationMatrix) {
    const beta = Math.atan2(rotationMatrix.m23, rotationMatrix.m33);
    const gamma = Math.atan2(
        -rotationMatrix.m13,
        Math.sqrt(rotationMatrix.m11 * rotationMatrix.m11 + rotationMatrix.m12 * rotationMatrix.m12));
    const alpha = Math.atan2(rotationMatrix.m12, rotationMatrix.m11);
    return new UI.Geometry.EulerAngles(
        UI.Geometry.radiansToDegrees(alpha), UI.Geometry.radiansToDegrees(beta), UI.Geometry.radiansToDegrees(gamma));
  }

  /**
   * @return {string}
   */
  toRotate3DString() {
    const gammaAxisY = -Math.sin(UI.Geometry.degreesToRadians(this.beta));
    const gammaAxisZ = Math.cos(UI.Geometry.degreesToRadians(this.beta));
    const axis = {alpha: [0, 1, 0], beta: [-1, 0, 0], gamma: [0, gammaAxisY, gammaAxisZ]};
    return 'rotate3d(' + axis.alpha.join(',') + ',' + this.alpha + 'deg) ' +
        'rotate3d(' + axis.beta.join(',') + ',' + this.beta + 'deg) ' +
        'rotate3d(' + axis.gamma.join(',') + ',' + this.gamma + 'deg)';
  }
};


/**
 * @param {!UI.Geometry.Vector} u
 * @param {!UI.Geometry.Vector} v
 * @return {number}
 */
UI.Geometry.scalarProduct = function(u, v) {
  return u.x * v.x + u.y * v.y + u.z * v.z;
};

/**
 * @param {!UI.Geometry.Vector} u
 * @param {!UI.Geometry.Vector} v
 * @return {!UI.Geometry.Vector}
 */
UI.Geometry.crossProduct = function(u, v) {
  const x = u.y * v.z - u.z * v.y;
  const y = u.z * v.x - u.x * v.z;
  const z = u.x * v.y - u.y * v.x;
  return new UI.Geometry.Vector(x, y, z);
};

/**
 * @param {!UI.Geometry.Vector} u
 * @param {!UI.Geometry.Vector} v
 * @return {!UI.Geometry.Vector}
 */
UI.Geometry.subtract = function(u, v) {
  const x = u.x - v.x;
  const y = u.y - v.y;
  const z = u.z - v.z;
  return new UI.Geometry.Vector(x, y, z);
};

/**
 * @param {!UI.Geometry.Vector} v
 * @param {!CSSMatrix} m
 * @return {!UI.Geometry.Vector}
 */
UI.Geometry.multiplyVectorByMatrixAndNormalize = function(v, m) {
  const t = v.x * m.m14 + v.y * m.m24 + v.z * m.m34 + m.m44;
  const x = (v.x * m.m11 + v.y * m.m21 + v.z * m.m31 + m.m41) / t;
  const y = (v.x * m.m12 + v.y * m.m22 + v.z * m.m32 + m.m42) / t;
  const z = (v.x * m.m13 + v.y * m.m23 + v.z * m.m33 + m.m43) / t;
  return new UI.Geometry.Vector(x, y, z);
};

/**
 * @param {!UI.Geometry.Vector} u
 * @param {!UI.Geometry.Vector} v
 * @return {number}
 */
UI.Geometry.calculateAngle = function(u, v) {
  const uLength = u.length();
  const vLength = v.length();
  if (uLength <= UI.Geometry._Eps || vLength <= UI.Geometry._Eps)
    return 0;
  const cos = UI.Geometry.scalarProduct(u, v) / uLength / vLength;
  if (Math.abs(cos) > 1)
    return 0;
  return UI.Geometry.radiansToDegrees(Math.acos(cos));
};

/**
 * @param {number} deg
 * @return {number}
 */
UI.Geometry.degreesToRadians = function(deg) {
  return deg * Math.PI / 180;
};

/**
 * @param {number} rad
 * @return {number}
 */
UI.Geometry.radiansToDegrees = function(rad) {
  return rad * 180 / Math.PI;
};

/**
 * @param {!CSSMatrix} matrix
 * @param {!Array.<number>} points
 * @param {{minX: number, maxX: number, minY: number, maxY: number}=} aggregateBounds
 * @return {!{minX: number, maxX: number, minY: number, maxY: number}}
 */
UI.Geometry.boundsForTransformedPoints = function(matrix, points, aggregateBounds) {
  if (!aggregateBounds)
    aggregateBounds = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity};
  if (points.length % 3)
    console.assert('Invalid size of points array');
  for (let p = 0; p < points.length; p += 3) {
    let vector = new UI.Geometry.Vector(points[p], points[p + 1], points[p + 2]);
    vector = UI.Geometry.multiplyVectorByMatrixAndNormalize(vector, matrix);
    aggregateBounds.minX = Math.min(aggregateBounds.minX, vector.x);
    aggregateBounds.maxX = Math.max(aggregateBounds.maxX, vector.x);
    aggregateBounds.minY = Math.min(aggregateBounds.minY, vector.y);
    aggregateBounds.maxY = Math.max(aggregateBounds.maxY, vector.y);
  }
  return aggregateBounds;
};

/**
 * @unrestricted
 */
UI.Size = class {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * @param {?UI.Size} size
   * @return {!UI.Size}
   */
  clipTo(size) {
    if (!size)
      return this;
    return new UI.Size(Math.min(this.width, size.width), Math.min(this.height, size.height));
  }

  /**
   * @param {number} scale
   * @return {!UI.Size}
   */
  scale(scale) {
    return new UI.Size(this.width * scale, this.height * scale);
  }
};

/**
 * @param {?UI.Size} size
 * @return {boolean}
 */
UI.Size.prototype.isEqual = function(size) {
  return !!size && this.width === size.width && this.height === size.height;
};

/**
 * @param {!UI.Size|number} size
 * @return {!UI.Size}
 */
UI.Size.prototype.widthToMax = function(size) {
  return new UI.Size(Math.max(this.width, (typeof size === 'number' ? size : size.width)), this.height);
};

/**
 * @param {!UI.Size|number} size
 * @return {!UI.Size}
 */
UI.Size.prototype.addWidth = function(size) {
  return new UI.Size(this.width + (typeof size === 'number' ? size : size.width), this.height);
};

/**
 * @param {!UI.Size|number} size
 * @return {!UI.Size}
 */
UI.Size.prototype.heightToMax = function(size) {
  return new UI.Size(this.width, Math.max(this.height, (typeof size === 'number' ? size : size.height)));
};

/**
 * @param {!UI.Size|number} size
 * @return {!UI.Size}
 */
UI.Size.prototype.addHeight = function(size) {
  return new UI.Size(this.width, this.height + (typeof size === 'number' ? size : size.height));
};

/**
 * @unrestricted
 */
UI.Insets = class {
  /**
   * @param {number} left
   * @param {number} top
   * @param {number} right
   * @param {number} bottom
   */
  constructor(left, top, right, bottom) {
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
  }

  /**
   * @param {?UI.Insets} insets
   * @return {boolean}
   */
  isEqual(insets) {
    return !!insets && this.left === insets.left && this.top === insets.top && this.right === insets.right &&
        this.bottom === insets.bottom;
  }
};

/**
 * @unrestricted
 */
UI.Rect = class {
  /**
   * @param {number} left
   * @param {number} top
   * @param {number} width
   * @param {number} height
   */
  constructor(left, top, width, height) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
  }

  /**
   * @param {?UI.Rect} rect
   * @return {boolean}
   */
  isEqual(rect) {
    return !!rect && this.left === rect.left && this.top === rect.top && this.width === rect.width &&
        this.height === rect.height;
  }

  /**
   * @param {number} scale
   * @return {!UI.Rect}
   */
  scale(scale) {
    return new UI.Rect(this.left * scale, this.top * scale, this.width * scale, this.height * scale);
  }

  /**
   * @return {!UI.Size}
   */
  size() {
    return new UI.Size(this.width, this.height);
  }

  /**
   * @param {!UI.Rect} origin
   * @return {!UI.Rect}
   */
  relativeTo(origin) {
    return new UI.Rect(this.left - origin.left, this.top - origin.top, this.width, this.height);
  }

  /**
   * @param {!UI.Rect} origin
   * @return {!UI.Rect}
   */
  rebaseTo(origin) {
    return new UI.Rect(this.left + origin.left, this.top + origin.top, this.width, this.height);
  }
};

/**
 * @unrestricted
 */
UI.Constraints = class {
  /**
   * @param {!UI.Size=} minimum
   * @param {?UI.Size=} preferred
   */
  constructor(minimum, preferred) {
    /**
     * @type {!UI.Size}
     */
    this.minimum = minimum || new UI.Size(0, 0);

    /**
     * @type {!UI.Size}
     */
    this.preferred = preferred || this.minimum;

    if (this.minimum.width > this.preferred.width || this.minimum.height > this.preferred.height)
      throw new Error('Minimum size is greater than preferred.');
  }
};

/**
 * @param {?UI.Constraints} constraints
 * @return {boolean}
 */
UI.Constraints.prototype.isEqual = function(constraints) {
  return !!constraints && this.minimum.isEqual(constraints.minimum) && this.preferred.isEqual(constraints.preferred);
};

/**
 * @param {!UI.Constraints|number} value
 * @return {!UI.Constraints}
 */
UI.Constraints.prototype.widthToMax = function(value) {
  if (typeof value === 'number')
    return new UI.Constraints(this.minimum.widthToMax(value), this.preferred.widthToMax(value));
  return new UI.Constraints(this.minimum.widthToMax(value.minimum), this.preferred.widthToMax(value.preferred));
};

/**
 * @param {!UI.Constraints|number} value
 * @return {!UI.Constraints}
 */
UI.Constraints.prototype.addWidth = function(value) {
  if (typeof value === 'number')
    return new UI.Constraints(this.minimum.addWidth(value), this.preferred.addWidth(value));
  return new UI.Constraints(this.minimum.addWidth(value.minimum), this.preferred.addWidth(value.preferred));
};

/**
 * @param {!UI.Constraints|number} value
 * @return {!UI.Constraints}
 */
UI.Constraints.prototype.heightToMax = function(value) {
  if (typeof value === 'number')
    return new UI.Constraints(this.minimum.heightToMax(value), this.preferred.heightToMax(value));
  return new UI.Constraints(this.minimum.heightToMax(value.minimum), this.preferred.heightToMax(value.preferred));
};

/**
 * @param {!UI.Constraints|number} value
 * @return {!UI.Constraints}
 */
UI.Constraints.prototype.addHeight = function(value) {
  if (typeof value === 'number')
    return new UI.Constraints(this.minimum.addHeight(value), this.preferred.addHeight(value));
  return new UI.Constraints(this.minimum.addHeight(value.minimum), this.preferred.addHeight(value.preferred));
};
