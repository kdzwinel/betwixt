/*
 * Copyright (C) 2009 280 North Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
Profiler.TopDownProfileDataGridNode = class extends Profiler.ProfileDataGridNode {
  /**
   * @param {!SDK.ProfileNode} profileNode
   * @param {!Profiler.TopDownProfileDataGridTree} owningTree
   */
  constructor(profileNode, owningTree) {
    const hasChildren = !!(profileNode.children && profileNode.children.length);

    super(profileNode, owningTree, hasChildren);

    this._remainingChildren = profileNode.children;
  }

  /**
   * @param {!Profiler.TopDownProfileDataGridNode|!Profiler.TopDownProfileDataGridTree} container
   */
  static _sharedPopulate(container) {
    const children = container._remainingChildren;
    const childrenLength = children.length;

    for (let i = 0; i < childrenLength; ++i) {
      container.appendChild(new Profiler.TopDownProfileDataGridNode(
          children[i], /** @type {!Profiler.TopDownProfileDataGridTree} */ (container.tree)));
    }

    container._remainingChildren = null;
  }

  /**
   * @param {!Profiler.TopDownProfileDataGridNode|!Profiler.TopDownProfileDataGridTree} container
   * @param {string} aCallUID
   */
  static _excludeRecursively(container, aCallUID) {
    if (container._remainingChildren)
      container.populate();

    container.save();

    const children = container.children;
    let index = container.children.length;

    while (index--)
      Profiler.TopDownProfileDataGridNode._excludeRecursively(children[index], aCallUID);

    const child = container.childrenByCallUID.get(aCallUID);

    if (child)
      Profiler.ProfileDataGridNode.merge(container, child, true);
  }

  /**
   * @override
   */
  populateChildren() {
    Profiler.TopDownProfileDataGridNode._sharedPopulate(this);
  }
};


/**
 * @unrestricted
 */
Profiler.TopDownProfileDataGridTree = class extends Profiler.ProfileDataGridTree {
  /**
   * @param {!Profiler.ProfileDataGridNode.Formatter} formatter
   * @param {!UI.SearchableView} searchableView
   * @param {!SDK.ProfileNode} rootProfileNode
   * @param {number} total
   */
  constructor(formatter, searchableView, rootProfileNode, total) {
    super(formatter, searchableView, total);
    this._remainingChildren = rootProfileNode.children;
    Profiler.ProfileDataGridNode.populate(this);
  }

  /**
   * @param {!Profiler.ProfileDataGridNode} profileDataGridNode
   */
  focus(profileDataGridNode) {
    if (!profileDataGridNode)
      return;

    this.save();
    profileDataGridNode.savePosition();

    this.children = [profileDataGridNode];
    this.total = profileDataGridNode.total;
  }

  /**
   * @param {!Profiler.ProfileDataGridNode} profileDataGridNode
   */
  exclude(profileDataGridNode) {
    if (!profileDataGridNode)
      return;

    this.save();

    Profiler.TopDownProfileDataGridNode._excludeRecursively(this, profileDataGridNode.callUID);

    if (this.lastComparator)
      this.sort(this.lastComparator, true);
  }

  /**
   * @override
   */
  restore() {
    if (!this._savedChildren)
      return;

    this.children[0].restorePosition();

    super.restore();
  }

  /**
   * @override
   */
  populateChildren() {
    Profiler.TopDownProfileDataGridNode._sharedPopulate(this);
  }
};
