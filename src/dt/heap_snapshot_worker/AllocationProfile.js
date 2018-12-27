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

/**
 * @unrestricted
 */
HeapSnapshotWorker.AllocationProfile = class {
  constructor(profile, liveObjectStats) {
    this._strings = profile.strings;
    this._liveObjectStats = liveObjectStats;

    this._nextNodeId = 1;
    this._functionInfos = [];
    this._idToNode = {};
    this._idToTopDownNode = {};
    this._collapsedTopNodeIdToFunctionInfo = {};

    this._traceTops = null;

    this._buildFunctionAllocationInfos(profile);
    this._traceTree = this._buildAllocationTree(profile, liveObjectStats);
  }

  _buildFunctionAllocationInfos(profile) {
    const strings = this._strings;

    const functionInfoFields = profile.snapshot.meta.trace_function_info_fields;
    const functionNameOffset = functionInfoFields.indexOf('name');
    const scriptNameOffset = functionInfoFields.indexOf('script_name');
    const scriptIdOffset = functionInfoFields.indexOf('script_id');
    const lineOffset = functionInfoFields.indexOf('line');
    const columnOffset = functionInfoFields.indexOf('column');
    const functionInfoFieldCount = functionInfoFields.length;

    const rawInfos = profile.trace_function_infos;
    const infoLength = rawInfos.length;
    const functionInfos = this._functionInfos = new Array(infoLength / functionInfoFieldCount);
    let index = 0;
    for (let i = 0; i < infoLength; i += functionInfoFieldCount) {
      functionInfos[index++] = new HeapSnapshotWorker.FunctionAllocationInfo(
          strings[rawInfos[i + functionNameOffset]], strings[rawInfos[i + scriptNameOffset]],
          rawInfos[i + scriptIdOffset], rawInfos[i + lineOffset], rawInfos[i + columnOffset]);
    }
  }

  _buildAllocationTree(profile, liveObjectStats) {
    const traceTreeRaw = profile.trace_tree;
    const functionInfos = this._functionInfos;
    const idToTopDownNode = this._idToTopDownNode;

    const traceNodeFields = profile.snapshot.meta.trace_node_fields;
    const nodeIdOffset = traceNodeFields.indexOf('id');
    const functionInfoIndexOffset = traceNodeFields.indexOf('function_info_index');
    const allocationCountOffset = traceNodeFields.indexOf('count');
    const allocationSizeOffset = traceNodeFields.indexOf('size');
    const childrenOffset = traceNodeFields.indexOf('children');
    const nodeFieldCount = traceNodeFields.length;

    function traverseNode(rawNodeArray, nodeOffset, parent) {
      const functionInfo = functionInfos[rawNodeArray[nodeOffset + functionInfoIndexOffset]];
      const id = rawNodeArray[nodeOffset + nodeIdOffset];
      const stats = liveObjectStats[id];
      const liveCount = stats ? stats.count : 0;
      const liveSize = stats ? stats.size : 0;
      const result = new HeapSnapshotWorker.TopDownAllocationNode(
          id, functionInfo, rawNodeArray[nodeOffset + allocationCountOffset],
          rawNodeArray[nodeOffset + allocationSizeOffset], liveCount, liveSize, parent);
      idToTopDownNode[id] = result;
      functionInfo.addTraceTopNode(result);

      const rawChildren = rawNodeArray[nodeOffset + childrenOffset];
      for (let i = 0; i < rawChildren.length; i += nodeFieldCount)
        result.children.push(traverseNode(rawChildren, i, result));

      return result;
    }

    return traverseNode(traceTreeRaw, 0, null);
  }

  /**
   * @return {!Array.<!HeapSnapshotModel.SerializedAllocationNode>}
   */
  serializeTraceTops() {
    if (this._traceTops)
      return this._traceTops;
    const result = this._traceTops = [];
    const functionInfos = this._functionInfos;
    for (let i = 0; i < functionInfos.length; i++) {
      const info = functionInfos[i];
      if (info.totalCount === 0)
        continue;
      const nodeId = this._nextNodeId++;
      const isRoot = i === 0;
      result.push(this._serializeNode(
          nodeId, info, info.totalCount, info.totalSize, info.totalLiveCount, info.totalLiveSize, !isRoot));
      this._collapsedTopNodeIdToFunctionInfo[nodeId] = info;
    }
    result.sort(function(a, b) {
      return b.size - a.size;
    });
    return result;
  }

  /**
   * @param {number} nodeId
   * @return {!HeapSnapshotModel.AllocationNodeCallers}
   */
  serializeCallers(nodeId) {
    let node = this._ensureBottomUpNode(nodeId);
    const nodesWithSingleCaller = [];
    while (node.callers().length === 1) {
      node = node.callers()[0];
      nodesWithSingleCaller.push(this._serializeCaller(node));
    }

    const branchingCallers = [];
    const callers = node.callers();
    for (let i = 0; i < callers.length; i++)
      branchingCallers.push(this._serializeCaller(callers[i]));

    return new HeapSnapshotModel.AllocationNodeCallers(nodesWithSingleCaller, branchingCallers);
  }

  /**
   * @param {number} traceNodeId
   * @return {!Array.<!HeapSnapshotModel.AllocationStackFrame>}
   */
  serializeAllocationStack(traceNodeId) {
    let node = this._idToTopDownNode[traceNodeId];
    const result = [];
    while (node) {
      const functionInfo = node.functionInfo;
      result.push(new HeapSnapshotModel.AllocationStackFrame(
          functionInfo.functionName, functionInfo.scriptName, functionInfo.scriptId, functionInfo.line,
          functionInfo.column));
      node = node.parent;
    }
    return result;
  }

  /**
   * @param {number} allocationNodeId
   * @return {!Array.<number>}
   */
  traceIds(allocationNodeId) {
    return this._ensureBottomUpNode(allocationNodeId).traceTopIds;
  }

  /**
   * @param {number} nodeId
   * @return {!HeapSnapshotWorker.BottomUpAllocationNode}
   */
  _ensureBottomUpNode(nodeId) {
    let node = this._idToNode[nodeId];
    if (!node) {
      const functionInfo = this._collapsedTopNodeIdToFunctionInfo[nodeId];
      node = functionInfo.bottomUpRoot();
      delete this._collapsedTopNodeIdToFunctionInfo[nodeId];
      this._idToNode[nodeId] = node;
    }
    return node;
  }

  /**
   * @param {!HeapSnapshotWorker.BottomUpAllocationNode} node
   * @return {!HeapSnapshotModel.SerializedAllocationNode}
   */
  _serializeCaller(node) {
    const callerId = this._nextNodeId++;
    this._idToNode[callerId] = node;
    return this._serializeNode(
        callerId, node.functionInfo, node.allocationCount, node.allocationSize, node.liveCount, node.liveSize,
        node.hasCallers());
  }

  /**
   * @param {number} nodeId
   * @param {!HeapSnapshotWorker.FunctionAllocationInfo} functionInfo
   * @param {number} count
   * @param {number} size
   * @param {number} liveCount
   * @param {number} liveSize
   * @param {boolean} hasChildren
   * @return {!HeapSnapshotModel.SerializedAllocationNode}
   */
  _serializeNode(nodeId, functionInfo, count, size, liveCount, liveSize, hasChildren) {
    return new HeapSnapshotModel.SerializedAllocationNode(
        nodeId, functionInfo.functionName, functionInfo.scriptName, functionInfo.scriptId, functionInfo.line,
        functionInfo.column, count, size, liveCount, liveSize, hasChildren);
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.TopDownAllocationNode = class {
  /**
   * @param {number} id
   * @param {!HeapSnapshotWorker.FunctionAllocationInfo} functionInfo
   * @param {number} count
   * @param {number} size
   * @param {number} liveCount
   * @param {number} liveSize
   * @param {?HeapSnapshotWorker.TopDownAllocationNode} parent
   */
  constructor(id, functionInfo, count, size, liveCount, liveSize, parent) {
    this.id = id;
    this.functionInfo = functionInfo;
    this.allocationCount = count;
    this.allocationSize = size;
    this.liveCount = liveCount;
    this.liveSize = liveSize;
    this.parent = parent;
    this.children = [];
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.BottomUpAllocationNode = class {
  /**
   * @param {!HeapSnapshotWorker.FunctionAllocationInfo} functionInfo
   */
  constructor(functionInfo) {
    this.functionInfo = functionInfo;
    this.allocationCount = 0;
    this.allocationSize = 0;
    this.liveCount = 0;
    this.liveSize = 0;
    this.traceTopIds = [];
    this._callers = [];
  }

  /**
   * @param {!HeapSnapshotWorker.TopDownAllocationNode} traceNode
   * @return {!HeapSnapshotWorker.BottomUpAllocationNode}
   */
  addCaller(traceNode) {
    const functionInfo = traceNode.functionInfo;
    let result;
    for (let i = 0; i < this._callers.length; i++) {
      const caller = this._callers[i];
      if (caller.functionInfo === functionInfo) {
        result = caller;
        break;
      }
    }
    if (!result) {
      result = new HeapSnapshotWorker.BottomUpAllocationNode(functionInfo);
      this._callers.push(result);
    }
    return result;
  }

  /**
   * @return {!Array.<!HeapSnapshotWorker.BottomUpAllocationNode>}
   */
  callers() {
    return this._callers;
  }

  /**
   * @return {boolean}
   */
  hasCallers() {
    return this._callers.length > 0;
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.FunctionAllocationInfo = class {
  /**
   * @param {string} functionName
   * @param {string} scriptName
   * @param {number} scriptId
   * @param {number} line
   * @param {number} column
   */
  constructor(functionName, scriptName, scriptId, line, column) {
    this.functionName = functionName;
    this.scriptName = scriptName;
    this.scriptId = scriptId;
    this.line = line;
    this.column = column;
    this.totalCount = 0;
    this.totalSize = 0;
    this.totalLiveCount = 0;
    this.totalLiveSize = 0;
    this._traceTops = [];
  }

  /**
   * @param {!HeapSnapshotWorker.TopDownAllocationNode} node
   */
  addTraceTopNode(node) {
    if (node.allocationCount === 0)
      return;
    this._traceTops.push(node);
    this.totalCount += node.allocationCount;
    this.totalSize += node.allocationSize;
    this.totalLiveCount += node.liveCount;
    this.totalLiveSize += node.liveSize;
  }

  /**
   * @return {?HeapSnapshotWorker.BottomUpAllocationNode}
   */
  bottomUpRoot() {
    if (!this._traceTops.length)
      return null;
    if (!this._bottomUpTree)
      this._buildAllocationTraceTree();
    return this._bottomUpTree;
  }

  _buildAllocationTraceTree() {
    this._bottomUpTree = new HeapSnapshotWorker.BottomUpAllocationNode(this);

    for (let i = 0; i < this._traceTops.length; i++) {
      let node = this._traceTops[i];
      let bottomUpNode = this._bottomUpTree;
      const count = node.allocationCount;
      const size = node.allocationSize;
      const liveCount = node.liveCount;
      const liveSize = node.liveSize;
      const traceId = node.id;
      while (true) {
        bottomUpNode.allocationCount += count;
        bottomUpNode.allocationSize += size;
        bottomUpNode.liveCount += liveCount;
        bottomUpNode.liveSize += liveSize;
        bottomUpNode.traceTopIds.push(traceId);
        node = node.parent;
        if (node === null)
          break;

        bottomUpNode = bottomUpNode.addCaller(node);
      }
    }
  }
};
