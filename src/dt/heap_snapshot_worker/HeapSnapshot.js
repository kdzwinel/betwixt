/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @interface
 */
HeapSnapshotWorker.HeapSnapshotItem = function() {};

HeapSnapshotWorker.HeapSnapshotItem.prototype = {
  /**
   * @return {number}
   */
  itemIndex() {},

  /**
   * @return {!Object}
   */
  serialize() {}
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItem}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotEdge = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   * @param {number=} edgeIndex
   */
  constructor(snapshot, edgeIndex) {
    this._snapshot = snapshot;
    this._edges = snapshot.containmentEdges;
    this.edgeIndex = edgeIndex || 0;
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotEdge}
   */
  clone() {
    return new HeapSnapshotWorker.HeapSnapshotEdge(this._snapshot, this.edgeIndex);
  }

  /**
   * @return {boolean}
   */
  hasStringName() {
    throw new Error('Not implemented');
  }

  /**
   * @return {string}
   */
  name() {
    throw new Error('Not implemented');
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotNode}
   */
  node() {
    return this._snapshot.createNode(this.nodeIndex());
  }

  /**
   * @return {number}
   */
  nodeIndex() {
    return this._edges[this.edgeIndex + this._snapshot._edgeToNodeOffset];
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return 'HeapSnapshotEdge: ' + this.name();
  }

  /**
   * @return {string}
   */
  type() {
    return this._snapshot._edgeTypes[this.rawType()];
  }

  /**
   * @override
   * @return {number}
   */
  itemIndex() {
    return this.edgeIndex;
  }

  /**
   * @override
   * @return {!HeapSnapshotModel.Edge}
   */
  serialize() {
    return new HeapSnapshotModel.Edge(this.name(), this.node().serialize(), this.type(), this.edgeIndex);
  }

  /**
   * @protected
   * @return {number}
   */
  rawType() {
    return this._edges[this.edgeIndex + this._snapshot._edgeTypeOffset];
  }
};

/**
 * @interface
 */
HeapSnapshotWorker.HeapSnapshotItemIterator = function() {};

HeapSnapshotWorker.HeapSnapshotItemIterator.prototype = {
  /**
   * @return {boolean}
   */
  hasNext() {},

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotItem}
   */
  item() {},

  next() {}
};

/**
 * @interface
 */
HeapSnapshotWorker.HeapSnapshotItemIndexProvider = function() {};

HeapSnapshotWorker.HeapSnapshotItemIndexProvider.prototype = {
  /**
   * @param {number} newIndex
   * @return {!HeapSnapshotWorker.HeapSnapshotItem}
   */
  itemForIndex(newIndex) {},
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIndexProvider}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotNodeIndexProvider = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   */
  constructor(snapshot) {
    this._node = snapshot.createNode();
  }

  /**
   * @override
   * @param {number} index
   * @return {!HeapSnapshotWorker.HeapSnapshotNode}
   */
  itemForIndex(index) {
    this._node.nodeIndex = index;
    return this._node;
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIndexProvider}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotEdgeIndexProvider = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   */
  constructor(snapshot) {
    this._edge = snapshot.createEdge(0);
  }

  /**
   * @override
   * @param {number} index
   * @return {!HeapSnapshotWorker.HeapSnapshotEdge}
   */
  itemForIndex(index) {
    this._edge.edgeIndex = index;
    return this._edge;
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIndexProvider}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotRetainerEdgeIndexProvider = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   */
  constructor(snapshot) {
    this._retainerEdge = snapshot.createRetainingEdge(0);
  }

  /**
   * @override
   * @param {number} index
   * @return {!HeapSnapshotWorker.HeapSnapshotRetainerEdge}
   */
  itemForIndex(index) {
    this._retainerEdge.setRetainerIndex(index);
    return this._retainerEdge;
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIterator}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotEdgeIterator = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
   */
  constructor(node) {
    this._sourceNode = node;
    this.edge = node._snapshot.createEdge(node.edgeIndexesStart());
  }

  /**
   * @override
   * @return {boolean}
   */
  hasNext() {
    return this.edge.edgeIndex < this._sourceNode.edgeIndexesEnd();
  }

  /**
   * @override
   * @return {!HeapSnapshotWorker.HeapSnapshotEdge}
   */
  item() {
    return this.edge;
  }

  /**
   * @override
   */
  next() {
    this.edge.edgeIndex += this.edge._snapshot._edgeFieldsCount;
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItem}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotRetainerEdge = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   * @param {number} retainerIndex
   */
  constructor(snapshot, retainerIndex) {
    this._snapshot = snapshot;
    this.setRetainerIndex(retainerIndex);
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotRetainerEdge}
   */
  clone() {
    return new HeapSnapshotWorker.HeapSnapshotRetainerEdge(this._snapshot, this.retainerIndex());
  }

  /**
   * @return {boolean}
   */
  hasStringName() {
    return this._edge().hasStringName();
  }

  /**
   * @return {string}
   */
  name() {
    return this._edge().name();
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotNode}
   */
  node() {
    return this._node();
  }

  /**
   * @return {number}
   */
  nodeIndex() {
    return this._retainingNodeIndex;
  }

  /**
   * @return {number}
   */
  retainerIndex() {
    return this._retainerIndex;
  }

  /**
   * @param {number} retainerIndex
   */
  setRetainerIndex(retainerIndex) {
    if (retainerIndex === this._retainerIndex)
      return;
    this._retainerIndex = retainerIndex;
    this._globalEdgeIndex = this._snapshot._retainingEdges[retainerIndex];
    this._retainingNodeIndex = this._snapshot._retainingNodes[retainerIndex];
    this._edgeInstance = null;
    this._nodeInstance = null;
  }

  /**
   * @param {number} edgeIndex
   */
  set edgeIndex(edgeIndex) {
    this.setRetainerIndex(edgeIndex);
  }

  _node() {
    if (!this._nodeInstance)
      this._nodeInstance = this._snapshot.createNode(this._retainingNodeIndex);
    return this._nodeInstance;
  }

  _edge() {
    if (!this._edgeInstance)
      this._edgeInstance = this._snapshot.createEdge(this._globalEdgeIndex);
    return this._edgeInstance;
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return this._edge().toString();
  }

  /**
   * @override
   * @return {number}
   */
  itemIndex() {
    return this._retainerIndex;
  }

  /**
   * @override
   * @return {!HeapSnapshotModel.Edge}
   */
  serialize() {
    return new HeapSnapshotModel.Edge(this.name(), this.node().serialize(), this.type(), this._globalEdgeIndex);
  }

  /**
   * @return {string}
   */
  type() {
    return this._edge().type();
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIterator}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotRetainerEdgeIterator = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotNode} retainedNode
   */
  constructor(retainedNode) {
    const snapshot = retainedNode._snapshot;
    const retainedNodeOrdinal = retainedNode.ordinal();
    const retainerIndex = snapshot._firstRetainerIndex[retainedNodeOrdinal];
    this._retainersEnd = snapshot._firstRetainerIndex[retainedNodeOrdinal + 1];
    this.retainer = snapshot.createRetainingEdge(retainerIndex);
  }

  /**
   * @override
   * @return {boolean}
   */
  hasNext() {
    return this.retainer.retainerIndex() < this._retainersEnd;
  }

  /**
   * @override
   * @return {!HeapSnapshotWorker.HeapSnapshotRetainerEdge}
   */
  item() {
    return this.retainer;
  }

  /**
   * @override
   */
  next() {
    this.retainer.setRetainerIndex(this.retainer.retainerIndex() + 1);
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItem}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotNode = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   * @param {number=} nodeIndex
   */
  constructor(snapshot, nodeIndex) {
    this._snapshot = snapshot;
    this.nodeIndex = nodeIndex || 0;
  }

  /**
   * @return {number}
   */
  distance() {
    return this._snapshot._nodeDistances[this.nodeIndex / this._snapshot._nodeFieldCount];
  }

  /**
   * @return {string}
   */
  className() {
    throw new Error('Not implemented');
  }

  /**
   * @return {number}
   */
  classIndex() {
    throw new Error('Not implemented');
  }

  /**
   * @return {number}
   */
  dominatorIndex() {
    const nodeFieldCount = this._snapshot._nodeFieldCount;
    return this._snapshot._dominatorsTree[this.nodeIndex / this._snapshot._nodeFieldCount] * nodeFieldCount;
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotEdgeIterator}
   */
  edges() {
    return new HeapSnapshotWorker.HeapSnapshotEdgeIterator(this);
  }

  /**
   * @return {number}
   */
  edgesCount() {
    return (this.edgeIndexesEnd() - this.edgeIndexesStart()) / this._snapshot._edgeFieldsCount;
  }

  /**
   * @return {number}
   */
  id() {
    throw new Error('Not implemented');
  }

  /**
   * @return {boolean}
   */
  isRoot() {
    return this.nodeIndex === this._snapshot._rootNodeIndex;
  }

  /**
   * @return {string}
   */
  name() {
    return this._snapshot.strings[this._name()];
  }

  /**
   * @return {number}
   */
  retainedSize() {
    return this._snapshot._retainedSizes[this.ordinal()];
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotRetainerEdgeIterator}
   */
  retainers() {
    return new HeapSnapshotWorker.HeapSnapshotRetainerEdgeIterator(this);
  }

  /**
   * @return {number}
   */
  retainersCount() {
    const snapshot = this._snapshot;
    const ordinal = this.ordinal();
    return snapshot._firstRetainerIndex[ordinal + 1] - snapshot._firstRetainerIndex[ordinal];
  }

  /**
   * @return {number}
   */
  selfSize() {
    const snapshot = this._snapshot;
    return snapshot.nodes[this.nodeIndex + snapshot._nodeSelfSizeOffset];
  }

  /**
   * @return {string}
   */
  type() {
    return this._snapshot._nodeTypes[this.rawType()];
  }

  /**
   * @return {number}
   */
  traceNodeId() {
    const snapshot = this._snapshot;
    return snapshot.nodes[this.nodeIndex + snapshot._nodeTraceNodeIdOffset];
  }

  /**
   * @override
   * @return {number}
   */
  itemIndex() {
    return this.nodeIndex;
  }

  /**
   * @override
   * @return {!HeapSnapshotModel.Node}
   */
  serialize() {
    return new HeapSnapshotModel.Node(
        this.id(), this.name(), this.distance(), this.nodeIndex, this.retainedSize(), this.selfSize(), this.type());
  }

  /**
   * @return {number}
   */
  _name() {
    const snapshot = this._snapshot;
    return snapshot.nodes[this.nodeIndex + snapshot._nodeNameOffset];
  }

  /**
   * @return {number}
   */
  edgeIndexesStart() {
    return this._snapshot._firstEdgeIndexes[this.ordinal()];
  }

  /**
   * @return {number}
   */
  edgeIndexesEnd() {
    return this._snapshot._firstEdgeIndexes[this.ordinal() + 1];
  }

  /**
   * @return {number}
   */
  ordinal() {
    return this.nodeIndex / this._snapshot._nodeFieldCount;
  }

  /**
   * @return {number}
   */
  _nextNodeIndex() {
    return this.nodeIndex + this._snapshot._nodeFieldCount;
  }

  /**
   * @protected
   * @return {number}
   */
  rawType() {
    const snapshot = this._snapshot;
    return snapshot.nodes[this.nodeIndex + snapshot._nodeTypeOffset];
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIterator}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotNodeIterator = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
   */
  constructor(node) {
    this.node = node;
    this._nodesLength = node._snapshot.nodes.length;
  }

  /**
   * @override
   * @return {boolean}
   */
  hasNext() {
    return this.node.nodeIndex < this._nodesLength;
  }

  /**
   * @override
   * @return {!HeapSnapshotWorker.HeapSnapshotNode}
   */
  item() {
    return this.node;
  }

  /**
   * @override
   */
  next() {
    this.node.nodeIndex = this.node._nextNodeIndex();
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIterator}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotIndexRangeIterator = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotItemIndexProvider} itemProvider
   * @param {!Array.<number>|!Uint32Array} indexes
   */
  constructor(itemProvider, indexes) {
    this._itemProvider = itemProvider;
    this._indexes = indexes;
    this._position = 0;
  }

  /**
   * @override
   * @return {boolean}
   */
  hasNext() {
    return this._position < this._indexes.length;
  }

  /**
   * @override
   * @return {!HeapSnapshotWorker.HeapSnapshotItem}
   */
  item() {
    const index = this._indexes[this._position];
    return this._itemProvider.itemForIndex(index);
  }

  /**
   * @override
   */
  next() {
    ++this._position;
  }
};

/**
 * @implements {HeapSnapshotWorker.HeapSnapshotItemIterator}
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotFilteredIterator = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotItemIterator} iterator
   * @param {function(!HeapSnapshotWorker.HeapSnapshotItem):boolean=} filter
   */
  constructor(iterator, filter) {
    this._iterator = iterator;
    this._filter = filter;
    this._skipFilteredItems();
  }

  /**
   * @override
   * @return {boolean}
   */
  hasNext() {
    return this._iterator.hasNext();
  }

  /**
   * @override
   * @return {!HeapSnapshotWorker.HeapSnapshotItem}
   */
  item() {
    return this._iterator.item();
  }

  /**
   * @override
   */
  next() {
    this._iterator.next();
    this._skipFilteredItems();
  }

  _skipFilteredItems() {
    while (this._iterator.hasNext() && !this._filter(this._iterator.item()))
      this._iterator.next();
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotProgress = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotWorkerDispatcher=} dispatcher
   */
  constructor(dispatcher) {
    this._dispatcher = dispatcher;
  }

  /**
   * @param {string} status
   */
  updateStatus(status) {
    this._sendUpdateEvent(Common.UIString(status));
  }

  /**
   * @param {string} title
   * @param {number} value
   * @param {number} total
   */
  updateProgress(title, value, total) {
    const percentValue = ((total ? (value / total) : 0) * 100).toFixed(0);
    this._sendUpdateEvent(Common.UIString(title, percentValue));
  }

  /**
   * @param {string} error
   */
  reportProblem(error) {
    // May be undefined in tests.
    if (this._dispatcher)
      this._dispatcher.sendEvent(HeapSnapshotModel.HeapSnapshotProgressEvent.BrokenSnapshot, error);
  }

  /**
   * @param {string} text
   */
  _sendUpdateEvent(text) {
    // May be undefined in tests.
    if (this._dispatcher)
      this._dispatcher.sendEvent(HeapSnapshotModel.HeapSnapshotProgressEvent.Update, text);
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotProblemReport = class {
  /**
   * @param {string} title
   */
  constructor(title) {
    this._errors = [title];
  }

  /**
   * @param {string} error
   */
  addError(error) {
    if (this._errors.length > 100)
      return;
    this._errors.push(error);
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return this._errors.join('\n  ');
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshot = class {
  /**
   * @param {!Object} profile
   * @param {!HeapSnapshotWorker.HeapSnapshotProgress} progress
   */
  constructor(profile, progress) {
    /** @type {!Uint32Array} */
    this.nodes = profile.nodes;
    /** @type {!Uint32Array} */
    this.containmentEdges = profile.edges;
    /** @type {!HeapSnapshotMetainfo} */
    this._metaNode = profile.snapshot.meta;
    /** @type {!Array.<number>} */
    this._rawSamples = profile.samples;
    /** @type {?HeapSnapshotModel.Samples} */
    this._samples = null;
    /** @type {!Array.<string>} */
    this.strings = profile.strings;
    /** @type {!Array.<number>} */
    this._locations = profile.locations;
    this._progress = progress;

    this._noDistance = -5;
    this._rootNodeIndex = 0;
    if (profile.snapshot.root_index)
      this._rootNodeIndex = profile.snapshot.root_index;

    this._snapshotDiffs = {};
    this._aggregatesForDiff = null;
    this._aggregates = {};
    this._aggregatesSortedFlags = {};
    this._profile = profile;
  }

  /**
   * @protected
   */
  initialize() {
    const meta = this._metaNode;

    this._nodeTypeOffset = meta.node_fields.indexOf('type');
    this._nodeNameOffset = meta.node_fields.indexOf('name');
    this._nodeIdOffset = meta.node_fields.indexOf('id');
    this._nodeSelfSizeOffset = meta.node_fields.indexOf('self_size');
    this._nodeEdgeCountOffset = meta.node_fields.indexOf('edge_count');
    this._nodeTraceNodeIdOffset = meta.node_fields.indexOf('trace_node_id');
    this._nodeFieldCount = meta.node_fields.length;

    this._nodeTypes = meta.node_types[this._nodeTypeOffset];
    this._nodeArrayType = this._nodeTypes.indexOf('array');
    this._nodeHiddenType = this._nodeTypes.indexOf('hidden');
    this._nodeObjectType = this._nodeTypes.indexOf('object');
    this._nodeNativeType = this._nodeTypes.indexOf('native');
    this._nodeConsStringType = this._nodeTypes.indexOf('concatenated string');
    this._nodeSlicedStringType = this._nodeTypes.indexOf('sliced string');
    this._nodeCodeType = this._nodeTypes.indexOf('code');
    this._nodeSyntheticType = this._nodeTypes.indexOf('synthetic');

    this._edgeFieldsCount = meta.edge_fields.length;
    this._edgeTypeOffset = meta.edge_fields.indexOf('type');
    this._edgeNameOffset = meta.edge_fields.indexOf('name_or_index');
    this._edgeToNodeOffset = meta.edge_fields.indexOf('to_node');

    this._edgeTypes = meta.edge_types[this._edgeTypeOffset];
    this._edgeTypes.push('invisible');
    this._edgeElementType = this._edgeTypes.indexOf('element');
    this._edgeHiddenType = this._edgeTypes.indexOf('hidden');
    this._edgeInternalType = this._edgeTypes.indexOf('internal');
    this._edgeShortcutType = this._edgeTypes.indexOf('shortcut');
    this._edgeWeakType = this._edgeTypes.indexOf('weak');
    this._edgeInvisibleType = this._edgeTypes.indexOf('invisible');

    const location_fields = meta.location_fields || [];

    this._locationIndexOffset = location_fields.indexOf('object_index');
    this._locationScriptIdOffset = location_fields.indexOf('script_id');
    this._locationLineOffset = location_fields.indexOf('line');
    this._locationColumnOffset = location_fields.indexOf('column');
    this._locationFieldCount = location_fields.length;

    this.nodeCount = this.nodes.length / this._nodeFieldCount;
    this._edgeCount = this.containmentEdges.length / this._edgeFieldsCount;

    this._retainedSizes = new Float64Array(this.nodeCount);
    this._firstEdgeIndexes = new Uint32Array(this.nodeCount + 1);
    this._retainingNodes = new Uint32Array(this._edgeCount);
    this._retainingEdges = new Uint32Array(this._edgeCount);
    this._firstRetainerIndex = new Uint32Array(this.nodeCount + 1);
    this._nodeDistances = new Int32Array(this.nodeCount);
    this._firstDominatedNodeIndex = new Uint32Array(this.nodeCount + 1);
    this._dominatedNodes = new Uint32Array(this.nodeCount - 1);

    this._progress.updateStatus('Building edge indexes\u2026');
    this._buildEdgeIndexes();
    this._progress.updateStatus('Building retainers\u2026');
    this._buildRetainers();
    this._progress.updateStatus('Calculating node flags\u2026');
    this.calculateFlags();
    this._progress.updateStatus('Calculating distances\u2026');
    this.calculateDistances();
    this._progress.updateStatus('Building postorder index\u2026');
    const result = this._buildPostOrderIndex();
    // Actually it is array that maps node ordinal number to dominator node ordinal number.
    this._progress.updateStatus('Building dominator tree\u2026');
    this._dominatorsTree =
        this._buildDominatorTree(result.postOrderIndex2NodeOrdinal, result.nodeOrdinal2PostOrderIndex);
    this._progress.updateStatus('Calculating retained sizes\u2026');
    this._calculateRetainedSizes(result.postOrderIndex2NodeOrdinal);
    this._progress.updateStatus('Building dominated nodes\u2026');
    this._buildDominatedNodes();
    this._progress.updateStatus('Calculating statistics\u2026');
    this.calculateStatistics();
    this._progress.updateStatus('Calculating samples\u2026');
    this._buildSamples();
    this._progress.updateStatus('Building locations\u2026');
    this._buildLocationMap();
    this._progress.updateStatus('Finished processing.');

    if (this._profile.snapshot.trace_function_count) {
      this._progress.updateStatus('Building allocation statistics\u2026');
      const nodes = this.nodes;
      const nodesLength = nodes.length;
      const nodeFieldCount = this._nodeFieldCount;
      const node = this.rootNode();
      const liveObjects = {};
      for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
        node.nodeIndex = nodeIndex;
        const traceNodeId = node.traceNodeId();
        let stats = liveObjects[traceNodeId];
        if (!stats)
          liveObjects[traceNodeId] = stats = {count: 0, size: 0, ids: []};
        stats.count++;
        stats.size += node.selfSize();
        stats.ids.push(node.id());
      }
      this._allocationProfile = new HeapSnapshotWorker.AllocationProfile(this._profile, liveObjects);
      this._progress.updateStatus('Done');
    }
  }

  _buildEdgeIndexes() {
    const nodes = this.nodes;
    const nodeCount = this.nodeCount;
    const firstEdgeIndexes = this._firstEdgeIndexes;
    const nodeFieldCount = this._nodeFieldCount;
    const edgeFieldsCount = this._edgeFieldsCount;
    const nodeEdgeCountOffset = this._nodeEdgeCountOffset;
    firstEdgeIndexes[nodeCount] = this.containmentEdges.length;
    for (let nodeOrdinal = 0, edgeIndex = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
      firstEdgeIndexes[nodeOrdinal] = edgeIndex;
      edgeIndex += nodes[nodeOrdinal * nodeFieldCount + nodeEdgeCountOffset] * edgeFieldsCount;
    }
  }

  _buildRetainers() {
    const retainingNodes = this._retainingNodes;
    const retainingEdges = this._retainingEdges;
    // Index of the first retainer in the _retainingNodes and _retainingEdges
    // arrays. Addressed by retained node index.
    const firstRetainerIndex = this._firstRetainerIndex;

    const containmentEdges = this.containmentEdges;
    const edgeFieldsCount = this._edgeFieldsCount;
    const nodeFieldCount = this._nodeFieldCount;
    const edgeToNodeOffset = this._edgeToNodeOffset;
    const firstEdgeIndexes = this._firstEdgeIndexes;
    const nodeCount = this.nodeCount;

    for (let toNodeFieldIndex = edgeToNodeOffset, l = containmentEdges.length; toNodeFieldIndex < l;
         toNodeFieldIndex += edgeFieldsCount) {
      const toNodeIndex = containmentEdges[toNodeFieldIndex];
      if (toNodeIndex % nodeFieldCount)
        throw new Error('Invalid toNodeIndex ' + toNodeIndex);
      ++firstRetainerIndex[toNodeIndex / nodeFieldCount];
    }
    for (let i = 0, firstUnusedRetainerSlot = 0; i < nodeCount; i++) {
      const retainersCount = firstRetainerIndex[i];
      firstRetainerIndex[i] = firstUnusedRetainerSlot;
      retainingNodes[firstUnusedRetainerSlot] = retainersCount;
      firstUnusedRetainerSlot += retainersCount;
    }
    firstRetainerIndex[nodeCount] = retainingNodes.length;

    let nextNodeFirstEdgeIndex = firstEdgeIndexes[0];
    for (let srcNodeOrdinal = 0; srcNodeOrdinal < nodeCount; ++srcNodeOrdinal) {
      const firstEdgeIndex = nextNodeFirstEdgeIndex;
      nextNodeFirstEdgeIndex = firstEdgeIndexes[srcNodeOrdinal + 1];
      const srcNodeIndex = srcNodeOrdinal * nodeFieldCount;
      for (let edgeIndex = firstEdgeIndex; edgeIndex < nextNodeFirstEdgeIndex; edgeIndex += edgeFieldsCount) {
        const toNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
        if (toNodeIndex % nodeFieldCount)
          throw new Error('Invalid toNodeIndex ' + toNodeIndex);
        const firstRetainerSlotIndex = firstRetainerIndex[toNodeIndex / nodeFieldCount];
        const nextUnusedRetainerSlotIndex = firstRetainerSlotIndex + (--retainingNodes[firstRetainerSlotIndex]);
        retainingNodes[nextUnusedRetainerSlotIndex] = srcNodeIndex;
        retainingEdges[nextUnusedRetainerSlotIndex] = edgeIndex;
      }
    }
  }

  /**
   * @param {number=} nodeIndex
   */
  createNode(nodeIndex) {
    throw new Error('Not implemented');
  }

  /**
   * @param {number} edgeIndex
   * @return {!HeapSnapshotWorker.JSHeapSnapshotEdge}
   */
  createEdge(edgeIndex) {
    throw new Error('Not implemented');
  }

  /**
   * @param {number} retainerIndex
   * @return {!HeapSnapshotWorker.JSHeapSnapshotRetainerEdge}
   */
  createRetainingEdge(retainerIndex) {
    throw new Error('Not implemented');
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotNodeIterator}
   */
  _allNodes() {
    return new HeapSnapshotWorker.HeapSnapshotNodeIterator(this.rootNode());
  }

  /**
   * @return {!HeapSnapshotWorker.HeapSnapshotNode}
   */
  rootNode() {
    return this.createNode(this._rootNodeIndex);
  }

  /**
   * @return {number}
   */
  get rootNodeIndex() {
    return this._rootNodeIndex;
  }

  /**
   * @return {number}
   */
  get totalSize() {
    return this.rootNode().retainedSize();
  }

  /**
   * @param {number} nodeIndex
   * @return {number}
   */
  _getDominatedIndex(nodeIndex) {
    if (nodeIndex % this._nodeFieldCount)
      throw new Error('Invalid nodeIndex: ' + nodeIndex);
    return this._firstDominatedNodeIndex[nodeIndex / this._nodeFieldCount];
  }

  /**
   * @param {!HeapSnapshotModel.NodeFilter} nodeFilter
   * @return {undefined|function(!HeapSnapshotWorker.HeapSnapshotNode):boolean}
   */
  _createFilter(nodeFilter) {
    const minNodeId = nodeFilter.minNodeId;
    const maxNodeId = nodeFilter.maxNodeId;
    const allocationNodeId = nodeFilter.allocationNodeId;
    let filter;
    if (typeof allocationNodeId === 'number') {
      filter = this._createAllocationStackFilter(allocationNodeId);
      filter.key = 'AllocationNodeId: ' + allocationNodeId;
    } else if (typeof minNodeId === 'number' && typeof maxNodeId === 'number') {
      filter = this._createNodeIdFilter(minNodeId, maxNodeId);
      filter.key = 'NodeIdRange: ' + minNodeId + '..' + maxNodeId;
    }
    return filter;
  }

  /**
   * @param {!HeapSnapshotModel.SearchConfig} searchConfig
   * @param {!HeapSnapshotModel.NodeFilter} nodeFilter
   * @return {!Array.<number>}
   */
  search(searchConfig, nodeFilter) {
    const query = searchConfig.query;

    function filterString(matchedStringIndexes, string, index) {
      if (string.indexOf(query) !== -1)
        matchedStringIndexes.add(index);
      return matchedStringIndexes;
    }

    const regexp = searchConfig.isRegex ? new RegExp(query) : createPlainTextSearchRegex(query, 'i');
    function filterRegexp(matchedStringIndexes, string, index) {
      if (regexp.test(string))
        matchedStringIndexes.add(index);
      return matchedStringIndexes;
    }

    const stringFilter = (searchConfig.isRegex || !searchConfig.caseSensitive) ? filterRegexp : filterString;
    const stringIndexes = this.strings.reduce(stringFilter, new Set());

    if (!stringIndexes.size)
      return [];

    const filter = this._createFilter(nodeFilter);
    const nodeIds = [];
    const nodesLength = this.nodes.length;
    const nodes = this.nodes;
    const nodeNameOffset = this._nodeNameOffset;
    const nodeIdOffset = this._nodeIdOffset;
    const nodeFieldCount = this._nodeFieldCount;
    const node = this.rootNode();

    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      if (filter && !filter(node))
        continue;
      if (stringIndexes.has(nodes[nodeIndex + nodeNameOffset]))
        nodeIds.push(nodes[nodeIndex + nodeIdOffset]);
    }
    return nodeIds;
  }

  /**
   * @param {!HeapSnapshotModel.NodeFilter} nodeFilter
   * @return {!Object.<string, !HeapSnapshotModel.Aggregate>}
   */
  aggregatesWithFilter(nodeFilter) {
    const filter = this._createFilter(nodeFilter);
    const key = filter ? filter.key : 'allObjects';
    return this.aggregates(false, key, filter);
  }

  /**
   * @param {number} minNodeId
   * @param {number} maxNodeId
   * @return {function(!HeapSnapshotWorker.HeapSnapshotNode):boolean}
   */
  _createNodeIdFilter(minNodeId, maxNodeId) {
    /**
     * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
     * @return {boolean}
     */
    function nodeIdFilter(node) {
      const id = node.id();
      return id > minNodeId && id <= maxNodeId;
    }
    return nodeIdFilter;
  }

  /**
   * @param {number} bottomUpAllocationNodeId
   * @return {function(!HeapSnapshotWorker.HeapSnapshotNode):boolean|undefined}
   */
  _createAllocationStackFilter(bottomUpAllocationNodeId) {
    const traceIds = this._allocationProfile.traceIds(bottomUpAllocationNodeId);
    if (!traceIds.length)
      return undefined;
    const set = {};
    for (let i = 0; i < traceIds.length; i++)
      set[traceIds[i]] = true;
    /**
     * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
     * @return {boolean}
     */
    function traceIdFilter(node) {
      return !!set[node.traceNodeId()];
    }
    return traceIdFilter;
  }

  /**
   * @param {boolean} sortedIndexes
   * @param {string=} key
   * @param {function(!HeapSnapshotWorker.HeapSnapshotNode):boolean=} filter
   * @return {!Object.<string, !HeapSnapshotModel.Aggregate>}
   */
  aggregates(sortedIndexes, key, filter) {
    let aggregatesByClassName = key && this._aggregates[key];
    if (!aggregatesByClassName) {
      const aggregates = this._buildAggregates(filter);
      this._calculateClassesRetainedSize(aggregates.aggregatesByClassIndex, filter);
      aggregatesByClassName = aggregates.aggregatesByClassName;
      if (key)
        this._aggregates[key] = aggregatesByClassName;
    }

    if (sortedIndexes && (!key || !this._aggregatesSortedFlags[key])) {
      this._sortAggregateIndexes(aggregatesByClassName);
      if (key)
        this._aggregatesSortedFlags[key] = sortedIndexes;
    }
    return aggregatesByClassName;
  }

  /**
   * @return {!Array.<!HeapSnapshotModel.SerializedAllocationNode>}
   */
  allocationTracesTops() {
    return this._allocationProfile.serializeTraceTops();
  }

  /**
   * @param {number} nodeId
   * @return {!HeapSnapshotModel.AllocationNodeCallers}
   */
  allocationNodeCallers(nodeId) {
    return this._allocationProfile.serializeCallers(nodeId);
  }

  /**
   * @param {number} nodeIndex
   * @return {?Array.<!HeapSnapshotModel.AllocationStackFrame>}
   */
  allocationStack(nodeIndex) {
    const node = this.createNode(nodeIndex);
    const allocationNodeId = node.traceNodeId();
    if (!allocationNodeId)
      return null;
    return this._allocationProfile.serializeAllocationStack(allocationNodeId);
  }

  /**
   * @return {!Object.<string, !HeapSnapshotModel.AggregateForDiff>}
   */
  aggregatesForDiff() {
    if (this._aggregatesForDiff)
      return this._aggregatesForDiff;

    const aggregatesByClassName = this.aggregates(true, 'allObjects');
    this._aggregatesForDiff = {};

    const node = this.createNode();
    for (const className in aggregatesByClassName) {
      const aggregate = aggregatesByClassName[className];
      const indexes = aggregate.idxs;
      const ids = new Array(indexes.length);
      const selfSizes = new Array(indexes.length);
      for (let i = 0; i < indexes.length; i++) {
        node.nodeIndex = indexes[i];
        ids[i] = node.id();
        selfSizes[i] = node.selfSize();
      }

      this._aggregatesForDiff[className] = {indexes: indexes, ids: ids, selfSizes: selfSizes};
    }
    return this._aggregatesForDiff;
  }

  /**
   * @protected
   * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
   * @return {boolean}
   */
  isUserRoot(node) {
    return true;
  }

  /**
   * @param {function(!HeapSnapshotWorker.HeapSnapshotNode,!HeapSnapshotWorker.HeapSnapshotEdge):boolean=} filter
   */
  calculateDistances(filter) {
    const nodeCount = this.nodeCount;
    const distances = this._nodeDistances;
    const noDistance = this._noDistance;
    for (let i = 0; i < nodeCount; ++i)
      distances[i] = noDistance;

    const nodesToVisit = new Uint32Array(this.nodeCount);
    let nodesToVisitLength = 0;

    // BFS for user root objects.
    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      const node = iter.edge.node();
      if (this.isUserRoot(node)) {
        distances[node.ordinal()] = 1;
        nodesToVisit[nodesToVisitLength++] = node.nodeIndex;
      }
    }
    this._bfs(nodesToVisit, nodesToVisitLength, distances, filter);

    // BFS for objects not reached from user roots.
    distances[this.rootNode().ordinal()] = HeapSnapshotModel.baseSystemDistance;
    nodesToVisit[0] = this.rootNode().nodeIndex;
    nodesToVisitLength = 1;
    this._bfs(nodesToVisit, nodesToVisitLength, distances, filter);
  }

  /**
   * @param {!Uint32Array} nodesToVisit
   * @param {number} nodesToVisitLength
   * @param {!Int32Array} distances
   * @param {function(!HeapSnapshotWorker.HeapSnapshotNode,!HeapSnapshotWorker.HeapSnapshotEdge):boolean=} filter
   */
  _bfs(nodesToVisit, nodesToVisitLength, distances, filter) {
    // Preload fields into local variables for better performance.
    const edgeFieldsCount = this._edgeFieldsCount;
    const nodeFieldCount = this._nodeFieldCount;
    const containmentEdges = this.containmentEdges;
    const firstEdgeIndexes = this._firstEdgeIndexes;
    const edgeToNodeOffset = this._edgeToNodeOffset;
    const edgeTypeOffset = this._edgeTypeOffset;
    const nodeCount = this.nodeCount;
    const edgeWeakType = this._edgeWeakType;
    const noDistance = this._noDistance;

    let index = 0;
    const edge = this.createEdge(0);
    const node = this.createNode(0);
    while (index < nodesToVisitLength) {
      const nodeIndex = nodesToVisit[index++];  // shift generates too much garbage.
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const distance = distances[nodeOrdinal] + 1;
      const firstEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];
      node.nodeIndex = nodeIndex;
      for (let edgeIndex = firstEdgeIndex; edgeIndex < edgesEnd; edgeIndex += edgeFieldsCount) {
        const edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
        if (edgeType === edgeWeakType)
          continue;
        const childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (distances[childNodeOrdinal] !== noDistance)
          continue;
        edge.edgeIndex = edgeIndex;
        if (filter && !filter(node, edge))
          continue;
        distances[childNodeOrdinal] = distance;
        nodesToVisit[nodesToVisitLength++] = childNodeIndex;
      }
    }
    if (nodesToVisitLength > nodeCount) {
      throw new Error(
          'BFS failed. Nodes to visit (' + nodesToVisitLength + ') is more than nodes count (' + nodeCount + ')');
    }
  }

  /**
   * @param {function(!HeapSnapshotWorker.HeapSnapshotNode):boolean=} filter
   * @return {!{aggregatesByClassName: !Object<string, !HeapSnapshotWorker.HeapSnapshot.AggregatedInfo>,
   *     aggregatesByClassIndex: !Object<number, !HeapSnapshotWorker.HeapSnapshot.AggregatedInfo>}}
   */
  _buildAggregates(filter) {
    const aggregates = {};
    const aggregatesByClassName = {};
    const classIndexes = [];
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeNativeType = this._nodeNativeType;
    const nodeFieldCount = this._nodeFieldCount;
    const selfSizeOffset = this._nodeSelfSizeOffset;
    const nodeTypeOffset = this._nodeTypeOffset;
    const node = this.rootNode();
    const nodeDistances = this._nodeDistances;

    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      if (filter && !filter(node))
        continue;
      const selfSize = nodes[nodeIndex + selfSizeOffset];
      if (!selfSize && nodes[nodeIndex + nodeTypeOffset] !== nodeNativeType)
        continue;
      const classIndex = node.classIndex();
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const distance = nodeDistances[nodeOrdinal];
      if (!(classIndex in aggregates)) {
        const nodeType = node.type();
        const nameMatters = nodeType === 'object' || nodeType === 'native';
        const value = {
          count: 1,
          distance: distance,
          self: selfSize,
          maxRet: 0,
          type: nodeType,
          name: nameMatters ? node.name() : null,
          idxs: [nodeIndex]
        };
        aggregates[classIndex] = value;
        classIndexes.push(classIndex);
        aggregatesByClassName[node.className()] = value;
      } else {
        const clss = aggregates[classIndex];
        clss.distance = Math.min(clss.distance, distance);
        ++clss.count;
        clss.self += selfSize;
        clss.idxs.push(nodeIndex);
      }
    }

    // Shave off provisionally allocated space.
    for (let i = 0, l = classIndexes.length; i < l; ++i) {
      const classIndex = classIndexes[i];
      aggregates[classIndex].idxs = aggregates[classIndex].idxs.slice();
    }
    return {aggregatesByClassName: aggregatesByClassName, aggregatesByClassIndex: aggregates};
  }

  /**
   * @param {!Object<number, !HeapSnapshotWorker.HeapSnapshot.AggregatedInfo>} aggregates
   * @param {function(!HeapSnapshotWorker.HeapSnapshotNode):boolean=} filter
   */
  _calculateClassesRetainedSize(aggregates, filter) {
    const rootNodeIndex = this._rootNodeIndex;
    const node = this.createNode(rootNodeIndex);
    const list = [rootNodeIndex];
    const sizes = [-1];
    const classes = [];
    const seenClassNameIndexes = {};
    const nodeFieldCount = this._nodeFieldCount;
    const nodeTypeOffset = this._nodeTypeOffset;
    const nodeNativeType = this._nodeNativeType;
    const dominatedNodes = this._dominatedNodes;
    const nodes = this.nodes;
    const firstDominatedNodeIndex = this._firstDominatedNodeIndex;

    while (list.length) {
      const nodeIndex = list.pop();
      node.nodeIndex = nodeIndex;
      let classIndex = node.classIndex();
      const seen = !!seenClassNameIndexes[classIndex];
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const dominatedIndexFrom = firstDominatedNodeIndex[nodeOrdinal];
      const dominatedIndexTo = firstDominatedNodeIndex[nodeOrdinal + 1];

      if (!seen && (!filter || filter(node)) &&
          (node.selfSize() || nodes[nodeIndex + nodeTypeOffset] === nodeNativeType)) {
        aggregates[classIndex].maxRet += node.retainedSize();
        if (dominatedIndexFrom !== dominatedIndexTo) {
          seenClassNameIndexes[classIndex] = true;
          sizes.push(list.length);
          classes.push(classIndex);
        }
      }
      for (let i = dominatedIndexFrom; i < dominatedIndexTo; i++)
        list.push(dominatedNodes[i]);

      const l = list.length;
      while (sizes[sizes.length - 1] === l) {
        sizes.pop();
        classIndex = classes.pop();
        seenClassNameIndexes[classIndex] = false;
      }
    }
  }

  /**
   * @param {!{aggregatesByClassName: !Object<string, !HeapSnapshotWorker.HeapSnapshot.AggregatedInfo>, aggregatesByClassIndex: !Object<number, !HeapSnapshotWorker.HeapSnapshot.AggregatedInfo>}} aggregates
   */
  _sortAggregateIndexes(aggregates) {
    const nodeA = this.createNode();
    const nodeB = this.createNode();
    for (const clss in aggregates) {
      aggregates[clss].idxs.sort((idxA, idxB) => {
        nodeA.nodeIndex = idxA;
        nodeB.nodeIndex = idxB;
        return nodeA.id() < nodeB.id() ? -1 : 1;
      });
    }
  }

  /**
   * The function checks is the edge should be considered during building
   * postorder iterator and dominator tree.
   *
   * @param {number} nodeIndex
   * @param {number} edgeType
   * @return {boolean}
   */
  _isEssentialEdge(nodeIndex, edgeType) {
    // Shortcuts at the root node have special meaning of marking user global objects.
    return edgeType !== this._edgeWeakType &&
        (edgeType !== this._edgeShortcutType || nodeIndex === this._rootNodeIndex);
  }

  _buildPostOrderIndex() {
    const nodeFieldCount = this._nodeFieldCount;
    const nodeCount = this.nodeCount;
    const rootNodeOrdinal = this._rootNodeIndex / nodeFieldCount;

    const edgeFieldsCount = this._edgeFieldsCount;
    const edgeTypeOffset = this._edgeTypeOffset;
    const edgeToNodeOffset = this._edgeToNodeOffset;
    const firstEdgeIndexes = this._firstEdgeIndexes;
    const containmentEdges = this.containmentEdges;

    const mapAndFlag = this.userObjectsMapAndFlag();
    const flags = mapAndFlag ? mapAndFlag.map : null;
    const flag = mapAndFlag ? mapAndFlag.flag : 0;

    const stackNodes = new Uint32Array(nodeCount);
    const stackCurrentEdge = new Uint32Array(nodeCount);
    const postOrderIndex2NodeOrdinal = new Uint32Array(nodeCount);
    const nodeOrdinal2PostOrderIndex = new Uint32Array(nodeCount);
    const visited = new Uint8Array(nodeCount);
    let postOrderIndex = 0;

    let stackTop = 0;
    stackNodes[0] = rootNodeOrdinal;
    stackCurrentEdge[0] = firstEdgeIndexes[rootNodeOrdinal];
    visited[rootNodeOrdinal] = 1;

    let iteration = 0;
    while (true) {
      ++iteration;
      while (stackTop >= 0) {
        const nodeOrdinal = stackNodes[stackTop];
        const edgeIndex = stackCurrentEdge[stackTop];
        const edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];

        if (edgeIndex < edgesEnd) {
          stackCurrentEdge[stackTop] += edgeFieldsCount;
          const edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
          if (!this._isEssentialEdge(nodeOrdinal * nodeFieldCount, edgeType))
            continue;
          const childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
          const childNodeOrdinal = childNodeIndex / nodeFieldCount;
          if (visited[childNodeOrdinal])
            continue;
          const nodeFlag = !flags || (flags[nodeOrdinal] & flag);
          const childNodeFlag = !flags || (flags[childNodeOrdinal] & flag);
          // We are skipping the edges from non-page-owned nodes to page-owned nodes.
          // Otherwise the dominators for the objects that also were retained by debugger would be affected.
          if (nodeOrdinal !== rootNodeOrdinal && childNodeFlag && !nodeFlag)
            continue;
          ++stackTop;
          stackNodes[stackTop] = childNodeOrdinal;
          stackCurrentEdge[stackTop] = firstEdgeIndexes[childNodeOrdinal];
          visited[childNodeOrdinal] = 1;
        } else {
          // Done with all the node children
          nodeOrdinal2PostOrderIndex[nodeOrdinal] = postOrderIndex;
          postOrderIndex2NodeOrdinal[postOrderIndex++] = nodeOrdinal;
          --stackTop;
        }
      }

      if (postOrderIndex === nodeCount || iteration > 1)
        break;
      const errors = new HeapSnapshotWorker.HeapSnapshotProblemReport(
          `Heap snapshot: ${
                            nodeCount - postOrderIndex
                          } nodes are unreachable from the root. Following nodes have only weak retainers:`);
      const dumpNode = this.rootNode();
      // Remove root from the result (last node in the array) and put it at the bottom of the stack so that it is
      // visited after all orphan nodes and their subgraphs.
      --postOrderIndex;
      stackTop = 0;
      stackNodes[0] = rootNodeOrdinal;
      stackCurrentEdge[0] = firstEdgeIndexes[rootNodeOrdinal + 1];  // no need to reiterate its edges
      for (let i = 0; i < nodeCount; ++i) {
        if (visited[i] || !this._hasOnlyWeakRetainers(i))
          continue;

        // Add all nodes that have only weak retainers to traverse their subgraphs.
        stackNodes[++stackTop] = i;
        stackCurrentEdge[stackTop] = firstEdgeIndexes[i];
        visited[i] = 1;

        dumpNode.nodeIndex = i * nodeFieldCount;
        const retainers = [];
        for (let it = dumpNode.retainers(); it.hasNext(); it.next())
          retainers.push(`${it.item().node().name()}@${it.item().node().id()}.${it.item().name()}`);
        errors.addError(`${dumpNode.name()} @${dumpNode.id()}  weak retainers: ${retainers.join(', ')}`);
      }
      console.warn(errors.toString());
    }

    // If we already processed all orphan nodes that have only weak retainers and still have some orphans...
    if (postOrderIndex !== nodeCount) {
      const errors = new HeapSnapshotWorker.HeapSnapshotProblemReport(
          'Still found ' + (nodeCount - postOrderIndex) + ' unreachable nodes in heap snapshot:');
      const dumpNode = this.rootNode();
      // Remove root from the result (last node in the array) and put it at the bottom of the stack so that it is
      // visited after all orphan nodes and their subgraphs.
      --postOrderIndex;
      for (let i = 0; i < nodeCount; ++i) {
        if (visited[i])
          continue;
        dumpNode.nodeIndex = i * nodeFieldCount;
        errors.addError(dumpNode.name() + ' @' + dumpNode.id());
        // Fix it by giving the node a postorder index anyway.
        nodeOrdinal2PostOrderIndex[i] = postOrderIndex;
        postOrderIndex2NodeOrdinal[postOrderIndex++] = i;
      }
      nodeOrdinal2PostOrderIndex[rootNodeOrdinal] = postOrderIndex;
      postOrderIndex2NodeOrdinal[postOrderIndex++] = rootNodeOrdinal;
      console.warn(errors.toString());
    }

    return {
      postOrderIndex2NodeOrdinal: postOrderIndex2NodeOrdinal,
      nodeOrdinal2PostOrderIndex: nodeOrdinal2PostOrderIndex
    };
  }

  /**
   * @param {number} nodeOrdinal
   * @return {boolean}
   */
  _hasOnlyWeakRetainers(nodeOrdinal) {
    const edgeTypeOffset = this._edgeTypeOffset;
    const edgeWeakType = this._edgeWeakType;
    const edgeShortcutType = this._edgeShortcutType;
    const containmentEdges = this.containmentEdges;
    const retainingEdges = this._retainingEdges;
    const beginRetainerIndex = this._firstRetainerIndex[nodeOrdinal];
    const endRetainerIndex = this._firstRetainerIndex[nodeOrdinal + 1];
    for (let retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
      const retainerEdgeIndex = retainingEdges[retainerIndex];
      const retainerEdgeType = containmentEdges[retainerEdgeIndex + edgeTypeOffset];
      if (retainerEdgeType !== edgeWeakType && retainerEdgeType !== edgeShortcutType)
        return false;
    }
    return true;
  }

  // The algorithm is based on the article:
  // K. Cooper, T. Harvey and K. Kennedy "A Simple, Fast Dominance Algorithm"
  // Softw. Pract. Exper. 4 (2001), pp. 1-10.
  /**
   * @param {!Array.<number>} postOrderIndex2NodeOrdinal
   * @param {!Array.<number>} nodeOrdinal2PostOrderIndex
   */
  _buildDominatorTree(postOrderIndex2NodeOrdinal, nodeOrdinal2PostOrderIndex) {
    const nodeFieldCount = this._nodeFieldCount;
    const firstRetainerIndex = this._firstRetainerIndex;
    const retainingNodes = this._retainingNodes;
    const retainingEdges = this._retainingEdges;
    const edgeFieldsCount = this._edgeFieldsCount;
    const edgeTypeOffset = this._edgeTypeOffset;
    const edgeToNodeOffset = this._edgeToNodeOffset;
    const firstEdgeIndexes = this._firstEdgeIndexes;
    const containmentEdges = this.containmentEdges;
    const rootNodeIndex = this._rootNodeIndex;

    const mapAndFlag = this.userObjectsMapAndFlag();
    const flags = mapAndFlag ? mapAndFlag.map : null;
    const flag = mapAndFlag ? mapAndFlag.flag : 0;

    const nodesCount = postOrderIndex2NodeOrdinal.length;
    const rootPostOrderedIndex = nodesCount - 1;
    const noEntry = nodesCount;
    const dominators = new Uint32Array(nodesCount);
    for (let i = 0; i < rootPostOrderedIndex; ++i)
      dominators[i] = noEntry;
    dominators[rootPostOrderedIndex] = rootPostOrderedIndex;

    // The affected array is used to mark entries which dominators
    // have to be racalculated because of changes in their retainers.
    const affected = new Uint8Array(nodesCount);
    let nodeOrdinal;

    {  // Mark the root direct children as affected.
      nodeOrdinal = this._rootNodeIndex / nodeFieldCount;
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = firstEdgeIndexes[nodeOrdinal]; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        const edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
        if (!this._isEssentialEdge(this._rootNodeIndex, edgeType))
          continue;
        const childNodeOrdinal = containmentEdges[edgeIndex + edgeToNodeOffset] / nodeFieldCount;
        affected[nodeOrdinal2PostOrderIndex[childNodeOrdinal]] = 1;
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (let postOrderIndex = rootPostOrderedIndex - 1; postOrderIndex >= 0; --postOrderIndex) {
        if (affected[postOrderIndex] === 0)
          continue;
        affected[postOrderIndex] = 0;
        // If dominator of the entry has already been set to root,
        // then it can't propagate any further.
        if (dominators[postOrderIndex] === rootPostOrderedIndex)
          continue;
        nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
        const nodeFlag = !flags || (flags[nodeOrdinal] & flag);
        let newDominatorIndex = noEntry;
        const beginRetainerIndex = firstRetainerIndex[nodeOrdinal];
        const endRetainerIndex = firstRetainerIndex[nodeOrdinal + 1];
        let orphanNode = true;
        for (let retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
          const retainerEdgeIndex = retainingEdges[retainerIndex];
          const retainerEdgeType = containmentEdges[retainerEdgeIndex + edgeTypeOffset];
          const retainerNodeIndex = retainingNodes[retainerIndex];
          if (!this._isEssentialEdge(retainerNodeIndex, retainerEdgeType))
            continue;
          orphanNode = false;
          const retainerNodeOrdinal = retainerNodeIndex / nodeFieldCount;
          const retainerNodeFlag = !flags || (flags[retainerNodeOrdinal] & flag);
          // We are skipping the edges from non-page-owned nodes to page-owned nodes.
          // Otherwise the dominators for the objects that also were retained by debugger would be affected.
          if (retainerNodeIndex !== rootNodeIndex && nodeFlag && !retainerNodeFlag)
            continue;
          let retanerPostOrderIndex = nodeOrdinal2PostOrderIndex[retainerNodeOrdinal];
          if (dominators[retanerPostOrderIndex] !== noEntry) {
            if (newDominatorIndex === noEntry) {
              newDominatorIndex = retanerPostOrderIndex;
            } else {
              while (retanerPostOrderIndex !== newDominatorIndex) {
                while (retanerPostOrderIndex < newDominatorIndex)
                  retanerPostOrderIndex = dominators[retanerPostOrderIndex];
                while (newDominatorIndex < retanerPostOrderIndex)
                  newDominatorIndex = dominators[newDominatorIndex];
              }
            }
            // If idom has already reached the root, it doesn't make sense
            // to check other retainers.
            if (newDominatorIndex === rootPostOrderedIndex)
              break;
          }
        }
        // Make root dominator of orphans.
        if (orphanNode)
          newDominatorIndex = rootPostOrderedIndex;
        if (newDominatorIndex !== noEntry && dominators[postOrderIndex] !== newDominatorIndex) {
          dominators[postOrderIndex] = newDominatorIndex;
          changed = true;
          nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
          const beginEdgeToNodeFieldIndex = firstEdgeIndexes[nodeOrdinal] + edgeToNodeOffset;
          const endEdgeToNodeFieldIndex = firstEdgeIndexes[nodeOrdinal + 1];
          for (let toNodeFieldIndex = beginEdgeToNodeFieldIndex; toNodeFieldIndex < endEdgeToNodeFieldIndex;
               toNodeFieldIndex += edgeFieldsCount) {
            const childNodeOrdinal = containmentEdges[toNodeFieldIndex] / nodeFieldCount;
            affected[nodeOrdinal2PostOrderIndex[childNodeOrdinal]] = 1;
          }
        }
      }
    }

    const dominatorsTree = new Uint32Array(nodesCount);
    for (let postOrderIndex = 0, l = dominators.length; postOrderIndex < l; ++postOrderIndex) {
      nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
      dominatorsTree[nodeOrdinal] = postOrderIndex2NodeOrdinal[dominators[postOrderIndex]];
    }
    return dominatorsTree;
  }

  /**
   * @param {!Array<number>} postOrderIndex2NodeOrdinal
   */
  _calculateRetainedSizes(postOrderIndex2NodeOrdinal) {
    const nodeCount = this.nodeCount;
    const nodes = this.nodes;
    const nodeSelfSizeOffset = this._nodeSelfSizeOffset;
    const nodeFieldCount = this._nodeFieldCount;
    const dominatorsTree = this._dominatorsTree;
    const retainedSizes = this._retainedSizes;

    for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal)
      retainedSizes[nodeOrdinal] = nodes[nodeOrdinal * nodeFieldCount + nodeSelfSizeOffset];

    // Propagate retained sizes for each node excluding root.
    for (let postOrderIndex = 0; postOrderIndex < nodeCount - 1; ++postOrderIndex) {
      const nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
      const dominatorOrdinal = dominatorsTree[nodeOrdinal];
      retainedSizes[dominatorOrdinal] += retainedSizes[nodeOrdinal];
    }
  }

  _buildDominatedNodes() {
    // Builds up two arrays:
    //  - "dominatedNodes" is a continuous array, where each node owns an
    //    interval (can be empty) with corresponding dominated nodes.
    //  - "indexArray" is an array of indexes in the "dominatedNodes"
    //    with the same positions as in the _nodeIndex.
    const indexArray = this._firstDominatedNodeIndex;
    // All nodes except the root have dominators.
    const dominatedNodes = this._dominatedNodes;

    // Count the number of dominated nodes for each node. Skip the root (node at
    // index 0) as it is the only node that dominates itself.
    const nodeFieldCount = this._nodeFieldCount;
    const dominatorsTree = this._dominatorsTree;

    let fromNodeOrdinal = 0;
    let toNodeOrdinal = this.nodeCount;
    const rootNodeOrdinal = this._rootNodeIndex / nodeFieldCount;
    if (rootNodeOrdinal === fromNodeOrdinal)
      fromNodeOrdinal = 1;
    else if (rootNodeOrdinal === toNodeOrdinal - 1)
      toNodeOrdinal = toNodeOrdinal - 1;
    else
      throw new Error('Root node is expected to be either first or last');
    for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal)
      ++indexArray[dominatorsTree[nodeOrdinal]];
    // Put in the first slot of each dominatedNodes slice the count of entries
    // that will be filled.
    let firstDominatedNodeIndex = 0;
    for (let i = 0, l = this.nodeCount; i < l; ++i) {
      const dominatedCount = dominatedNodes[firstDominatedNodeIndex] = indexArray[i];
      indexArray[i] = firstDominatedNodeIndex;
      firstDominatedNodeIndex += dominatedCount;
    }
    indexArray[this.nodeCount] = dominatedNodes.length;
    // Fill up the dominatedNodes array with indexes of dominated nodes. Skip the root (node at
    // index 0) as it is the only node that dominates itself.
    for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
      const dominatorOrdinal = dominatorsTree[nodeOrdinal];
      let dominatedRefIndex = indexArray[dominatorOrdinal];
      dominatedRefIndex += (--dominatedNodes[dominatedRefIndex]);
      dominatedNodes[dominatedRefIndex] = nodeOrdinal * nodeFieldCount;
    }
  }

  _buildSamples() {
    const samples = this._rawSamples;
    if (!samples || !samples.length)
      return;
    const sampleCount = samples.length / 2;
    const sizeForRange = new Array(sampleCount);
    const timestamps = new Array(sampleCount);
    const lastAssignedIds = new Array(sampleCount);

    const timestampOffset = this._metaNode.sample_fields.indexOf('timestamp_us');
    const lastAssignedIdOffset = this._metaNode.sample_fields.indexOf('last_assigned_id');
    for (let i = 0; i < sampleCount; i++) {
      sizeForRange[i] = 0;
      timestamps[i] = (samples[2 * i + timestampOffset]) / 1000;
      lastAssignedIds[i] = samples[2 * i + lastAssignedIdOffset];
    }

    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this._nodeFieldCount;
    const node = this.rootNode();
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;

      const nodeId = node.id();
      // JS objects have odd ids, skip native objects.
      if (nodeId % 2 === 0)
        continue;
      const rangeIndex = lastAssignedIds.lowerBound(nodeId);
      if (rangeIndex === sampleCount) {
        // TODO: make heap profiler not allocate while taking snapshot
        continue;
      }
      sizeForRange[rangeIndex] += node.selfSize();
    }
    this._samples = new HeapSnapshotModel.Samples(timestamps, lastAssignedIds, sizeForRange);
  }

  _buildLocationMap() {
    /** @type {!Map<number, !HeapSnapshotModel.Location>} */
    const map = new Map();
    const locations = this._locations;

    for (let i = 0; i < locations.length; i += this._locationFieldCount) {
      const nodeIndex = locations[i + this._locationIndexOffset];
      const scriptId = locations[i + this._locationScriptIdOffset];
      const line = locations[i + this._locationLineOffset];
      const col = locations[i + this._locationColumnOffset];
      map.set(nodeIndex, new HeapSnapshotModel.Location(scriptId, line, col));
    }

    this._locationMap = map;
  }

  /**
   * @param {number} nodeIndex
   * @return {?HeapSnapshotModel.Location}
   */
  getLocation(nodeIndex) {
    return this._locationMap.get(nodeIndex) || null;
  }

  /**
   * @return {?HeapSnapshotModel.Samples}
   */
  getSamples() {
    return this._samples;
  }

  /**
   * @protected
   */
  calculateFlags() {
    throw new Error('Not implemented');
  }

  /**
   * @protected
   */
  calculateStatistics() {
    throw new Error('Not implemented');
  }

  userObjectsMapAndFlag() {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} baseSnapshotId
   * @param {!Object.<string, !HeapSnapshotModel.AggregateForDiff>} baseSnapshotAggregates
   * @return {!Object.<string, !HeapSnapshotModel.Diff>}
   */
  calculateSnapshotDiff(baseSnapshotId, baseSnapshotAggregates) {
    let snapshotDiff = this._snapshotDiffs[baseSnapshotId];
    if (snapshotDiff)
      return snapshotDiff;
    snapshotDiff = {};

    const aggregates = this.aggregates(true, 'allObjects');
    for (const className in baseSnapshotAggregates) {
      const baseAggregate = baseSnapshotAggregates[className];
      const diff = this._calculateDiffForClass(baseAggregate, aggregates[className]);
      if (diff)
        snapshotDiff[className] = diff;
    }
    const emptyBaseAggregate = new HeapSnapshotModel.AggregateForDiff();
    for (const className in aggregates) {
      if (className in baseSnapshotAggregates)
        continue;
      snapshotDiff[className] = this._calculateDiffForClass(emptyBaseAggregate, aggregates[className]);
    }

    this._snapshotDiffs[baseSnapshotId] = snapshotDiff;
    return snapshotDiff;
  }

  /**
   * @param {!HeapSnapshotModel.AggregateForDiff} baseAggregate
   * @param {!HeapSnapshotModel.Aggregate} aggregate
   * @return {?HeapSnapshotModel.Diff}
   */
  _calculateDiffForClass(baseAggregate, aggregate) {
    const baseIds = baseAggregate.ids;
    const baseIndexes = baseAggregate.indexes;
    const baseSelfSizes = baseAggregate.selfSizes;

    const indexes = aggregate ? aggregate.idxs : [];

    let i = 0;
    let j = 0;
    const l = baseIds.length;
    const m = indexes.length;
    const diff = new HeapSnapshotModel.Diff();

    const nodeB = this.createNode(indexes[j]);
    while (i < l && j < m) {
      const nodeAId = baseIds[i];
      if (nodeAId < nodeB.id()) {
        diff.deletedIndexes.push(baseIndexes[i]);
        diff.removedCount++;
        diff.removedSize += baseSelfSizes[i];
        ++i;
      } else if (
          nodeAId >
          nodeB.id()) {  // Native nodes(e.g. dom groups) may have ids less than max JS object id in the base snapshot
        diff.addedIndexes.push(indexes[j]);
        diff.addedCount++;
        diff.addedSize += nodeB.selfSize();
        nodeB.nodeIndex = indexes[++j];
      } else {  // nodeAId === nodeB.id()
        ++i;
        nodeB.nodeIndex = indexes[++j];
      }
    }
    while (i < l) {
      diff.deletedIndexes.push(baseIndexes[i]);
      diff.removedCount++;
      diff.removedSize += baseSelfSizes[i];
      ++i;
    }
    while (j < m) {
      diff.addedIndexes.push(indexes[j]);
      diff.addedCount++;
      diff.addedSize += nodeB.selfSize();
      nodeB.nodeIndex = indexes[++j];
    }
    diff.countDelta = diff.addedCount - diff.removedCount;
    diff.sizeDelta = diff.addedSize - diff.removedSize;
    if (!diff.addedCount && !diff.removedCount)
      return null;
    return diff;
  }

  _nodeForSnapshotObjectId(snapshotObjectId) {
    for (let it = this._allNodes(); it.hasNext(); it.next()) {
      if (it.node.id() === snapshotObjectId)
        return it.node;
    }
    return null;
  }

  /**
   * @param {string} snapshotObjectId
   * @return {?string}
   */
  nodeClassName(snapshotObjectId) {
    const node = this._nodeForSnapshotObjectId(snapshotObjectId);
    if (node)
      return node.className();
    return null;
  }

  /**
   * @param {string} name
   * @return {!Array.<number>}
   */
  idsOfObjectsWithName(name) {
    const ids = [];
    for (let it = this._allNodes(); it.hasNext(); it.next()) {
      if (it.item().name() === name)
        ids.push(it.item().id());
    }
    return ids;
  }

  /**
   * @param {number} nodeIndex
   * @return {!HeapSnapshotWorker.HeapSnapshotEdgesProvider}
   */
  createEdgesProvider(nodeIndex) {
    const node = this.createNode(nodeIndex);
    const filter = this.containmentEdgesFilter();
    const indexProvider = new HeapSnapshotWorker.HeapSnapshotEdgeIndexProvider(this);
    return new HeapSnapshotWorker.HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
  }

  /**
   * @param {number} nodeIndex
   * @param {?function(!HeapSnapshotWorker.HeapSnapshotEdge):boolean} filter
   * @return {!HeapSnapshotWorker.HeapSnapshotEdgesProvider}
   */
  createEdgesProviderForTest(nodeIndex, filter) {
    const node = this.createNode(nodeIndex);
    const indexProvider = new HeapSnapshotWorker.HeapSnapshotEdgeIndexProvider(this);
    return new HeapSnapshotWorker.HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
  }

  /**
   * @return {?function(!HeapSnapshotWorker.HeapSnapshotEdge):boolean}
   */
  retainingEdgesFilter() {
    return null;
  }

  /**
   * @return {?function(!HeapSnapshotWorker.HeapSnapshotEdge):boolean}
   */
  containmentEdgesFilter() {
    return null;
  }

  /**
   * @param {number} nodeIndex
   * @return {!HeapSnapshotWorker.HeapSnapshotEdgesProvider}
   */
  createRetainingEdgesProvider(nodeIndex) {
    const node = this.createNode(nodeIndex);
    const filter = this.retainingEdgesFilter();
    const indexProvider = new HeapSnapshotWorker.HeapSnapshotRetainerEdgeIndexProvider(this);
    return new HeapSnapshotWorker.HeapSnapshotEdgesProvider(this, filter, node.retainers(), indexProvider);
  }

  /**
   * @param {string} baseSnapshotId
   * @param {string} className
   * @return {!HeapSnapshotWorker.HeapSnapshotNodesProvider}
   */
  createAddedNodesProvider(baseSnapshotId, className) {
    const snapshotDiff = this._snapshotDiffs[baseSnapshotId];
    const diffForClass = snapshotDiff[className];
    return new HeapSnapshotWorker.HeapSnapshotNodesProvider(this, diffForClass.addedIndexes);
  }

  /**
   * @param {!Array.<number>} nodeIndexes
   * @return {!HeapSnapshotWorker.HeapSnapshotNodesProvider}
   */
  createDeletedNodesProvider(nodeIndexes) {
    return new HeapSnapshotWorker.HeapSnapshotNodesProvider(this, nodeIndexes);
  }

  /**
   * @param {string} className
   * @param {!HeapSnapshotModel.NodeFilter} nodeFilter
   * @return {!HeapSnapshotWorker.HeapSnapshotNodesProvider}
   */
  createNodesProviderForClass(className, nodeFilter) {
    return new HeapSnapshotWorker.HeapSnapshotNodesProvider(
        this, this.aggregatesWithFilter(nodeFilter)[className].idxs);
  }

  /**
   * @return {number}
   */
  _maxJsNodeId() {
    const nodeFieldCount = this._nodeFieldCount;
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    let id = 0;
    for (let nodeIndex = this._nodeIdOffset; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      const nextId = nodes[nodeIndex];
      // JS objects have odd ids, skip native objects.
      if (nextId % 2 === 0)
        continue;
      if (id < nextId)
        id = nextId;
    }
    return id;
  }

  /**
   * @return {!HeapSnapshotModel.StaticData}
   */
  updateStaticData() {
    return new HeapSnapshotModel.StaticData(this.nodeCount, this._rootNodeIndex, this.totalSize, this._maxJsNodeId());
  }
};

/**
 * @typedef {!{
 *   count: number,
 *   distance: number,
 *   self: number,
 *   maxRet: number,
 *   name: ?string,
 *   idxs: !Array<number>
 * }}
 */
HeapSnapshotWorker.HeapSnapshot.AggregatedInfo;

/**
 * @unrestricted
 */
const HeapSnapshotMetainfo = class {
  constructor() {
    // New format.
    this.node_fields = [];
    this.node_types = [];
    this.edge_fields = [];
    this.edge_types = [];
    this.trace_function_info_fields = [];
    this.trace_node_fields = [];
    this.sample_fields = [];
    this.type_strings = {};
  }
};

/**
 * @unrestricted
 */
const HeapSnapshotHeader = class {
  constructor() {
    // New format.
    this.title = '';
    this.meta = new HeapSnapshotMetainfo();
    this.node_count = 0;
    this.edge_count = 0;
    this.trace_function_count = 0;
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotItemProvider = class {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotItemIterator} iterator
   * @param {!HeapSnapshotWorker.HeapSnapshotItemIndexProvider} indexProvider
   */
  constructor(iterator, indexProvider) {
    this._iterator = iterator;
    this._indexProvider = indexProvider;
    this._isEmpty = !iterator.hasNext();
    /** @type {?Array.<number>} */
    this._iterationOrder = null;
    this._currentComparator = null;
    this._sortedPrefixLength = 0;
    this._sortedSuffixLength = 0;
  }

  _createIterationOrder() {
    if (this._iterationOrder)
      return;
    this._iterationOrder = [];
    for (let iterator = this._iterator; iterator.hasNext(); iterator.next())
      this._iterationOrder.push(iterator.item().itemIndex());
  }

  /**
   * @return {boolean}
   */
  isEmpty() {
    return this._isEmpty;
  }

  /**
   * @param {number} begin
   * @param {number} end
   * @return {!HeapSnapshotModel.ItemsRange}
   */
  serializeItemsRange(begin, end) {
    this._createIterationOrder();
    if (begin > end)
      throw new Error('Start position > end position: ' + begin + ' > ' + end);
    if (end > this._iterationOrder.length)
      end = this._iterationOrder.length;
    if (this._sortedPrefixLength < end && begin < this._iterationOrder.length - this._sortedSuffixLength) {
      this.sort(
          this._currentComparator, this._sortedPrefixLength, this._iterationOrder.length - 1 - this._sortedSuffixLength,
          begin, end - 1);
      if (begin <= this._sortedPrefixLength)
        this._sortedPrefixLength = end;
      if (end >= this._iterationOrder.length - this._sortedSuffixLength)
        this._sortedSuffixLength = this._iterationOrder.length - begin;
    }
    let position = begin;
    const count = end - begin;
    const result = new Array(count);
    for (let i = 0; i < count; ++i) {
      const itemIndex = this._iterationOrder[position++];
      const item = this._indexProvider.itemForIndex(itemIndex);
      result[i] = item.serialize();
    }
    return new HeapSnapshotModel.ItemsRange(begin, end, this._iterationOrder.length, result);
  }

  sortAndRewind(comparator) {
    this._currentComparator = comparator;
    this._sortedPrefixLength = 0;
    this._sortedSuffixLength = 0;
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotEdgesProvider = class extends HeapSnapshotWorker.HeapSnapshotItemProvider {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   * @param {?function(!HeapSnapshotWorker.HeapSnapshotEdge):boolean} filter
   * @param {!HeapSnapshotWorker.HeapSnapshotEdgeIterator} edgesIter
   * @param {!HeapSnapshotWorker.HeapSnapshotItemIndexProvider} indexProvider
   */
  constructor(snapshot, filter, edgesIter, indexProvider) {
    const iter = filter ?
        new HeapSnapshotWorker.HeapSnapshotFilteredIterator(
            edgesIter, /** @type {function(!HeapSnapshotWorker.HeapSnapshotItem):boolean} */ (filter)) :
        edgesIter;
    super(iter, indexProvider);
    this.snapshot = snapshot;
  }

  /**
   * @param {!HeapSnapshotModel.ComparatorConfig} comparator
   * @param {number} leftBound
   * @param {number} rightBound
   * @param {number} windowLeft
   * @param {number} windowRight
   */
  sort(comparator, leftBound, rightBound, windowLeft, windowRight) {
    const fieldName1 = comparator.fieldName1;
    const fieldName2 = comparator.fieldName2;
    const ascending1 = comparator.ascending1;
    const ascending2 = comparator.ascending2;

    const edgeA = this._iterator.item().clone();
    const edgeB = edgeA.clone();
    const nodeA = this.snapshot.createNode();
    const nodeB = this.snapshot.createNode();

    function compareEdgeFieldName(ascending, indexA, indexB) {
      edgeA.edgeIndex = indexA;
      edgeB.edgeIndex = indexB;
      if (edgeB.name() === '__proto__')
        return -1;
      if (edgeA.name() === '__proto__')
        return 1;
      const result = edgeA.hasStringName() === edgeB.hasStringName() ?
          (edgeA.name() < edgeB.name() ? -1 : (edgeA.name() > edgeB.name() ? 1 : 0)) :
          (edgeA.hasStringName() ? -1 : 1);
      return ascending ? result : -result;
    }

    function compareNodeField(fieldName, ascending, indexA, indexB) {
      edgeA.edgeIndex = indexA;
      nodeA.nodeIndex = edgeA.nodeIndex();
      const valueA = nodeA[fieldName]();

      edgeB.edgeIndex = indexB;
      nodeB.nodeIndex = edgeB.nodeIndex();
      const valueB = nodeB[fieldName]();

      const result = valueA < valueB ? -1 : (valueA > valueB ? 1 : 0);
      return ascending ? result : -result;
    }

    function compareEdgeAndNode(indexA, indexB) {
      let result = compareEdgeFieldName(ascending1, indexA, indexB);
      if (result === 0)
        result = compareNodeField(fieldName2, ascending2, indexA, indexB);
      if (result === 0)
        return indexA - indexB;
      return result;
    }

    function compareNodeAndEdge(indexA, indexB) {
      let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0)
        result = compareEdgeFieldName(ascending2, indexA, indexB);
      if (result === 0)
        return indexA - indexB;
      return result;
    }

    function compareNodeAndNode(indexA, indexB) {
      let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0)
        result = compareNodeField(fieldName2, ascending2, indexA, indexB);
      if (result === 0)
        return indexA - indexB;
      return result;
    }

    if (fieldName1 === '!edgeName')
      this._iterationOrder.sortRange(compareEdgeAndNode, leftBound, rightBound, windowLeft, windowRight);
    else if (fieldName2 === '!edgeName')
      this._iterationOrder.sortRange(compareNodeAndEdge, leftBound, rightBound, windowLeft, windowRight);
    else
      this._iterationOrder.sortRange(compareNodeAndNode, leftBound, rightBound, windowLeft, windowRight);
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.HeapSnapshotNodesProvider = class extends HeapSnapshotWorker.HeapSnapshotItemProvider {
  /**
   * @param {!HeapSnapshotWorker.HeapSnapshot} snapshot
   * @param {!Array<number>|!Uint32Array} nodeIndexes
   */
  constructor(snapshot, nodeIndexes) {
    const indexProvider = new HeapSnapshotWorker.HeapSnapshotNodeIndexProvider(snapshot);
    const it = new HeapSnapshotWorker.HeapSnapshotIndexRangeIterator(indexProvider, nodeIndexes);
    super(it, indexProvider);
    this.snapshot = snapshot;
  }

  /**
   * @param {string} snapshotObjectId
   * @return {number}
   */
  nodePosition(snapshotObjectId) {
    this._createIterationOrder();
    const node = this.snapshot.createNode();
    let i = 0;
    for (; i < this._iterationOrder.length; i++) {
      node.nodeIndex = this._iterationOrder[i];
      if (node.id() === snapshotObjectId)
        break;
    }
    if (i === this._iterationOrder.length)
      return -1;
    const targetNodeIndex = this._iterationOrder[i];
    let smallerCount = 0;
    const compare = this._buildCompareFunction(this._currentComparator);
    for (let i = 0; i < this._iterationOrder.length; i++) {
      if (compare(this._iterationOrder[i], targetNodeIndex) < 0)
        ++smallerCount;
    }
    return smallerCount;
  }

  /**
   * @return {function(number,number):number}
   */
  _buildCompareFunction(comparator) {
    const nodeA = this.snapshot.createNode();
    const nodeB = this.snapshot.createNode();
    const fieldAccessor1 = nodeA[comparator.fieldName1];
    const fieldAccessor2 = nodeA[comparator.fieldName2];
    const ascending1 = comparator.ascending1 ? 1 : -1;
    const ascending2 = comparator.ascending2 ? 1 : -1;

    /**
     * @param {function():*} fieldAccessor
     * @param {number} ascending
     * @return {number}
     */
    function sortByNodeField(fieldAccessor, ascending) {
      const valueA = fieldAccessor.call(nodeA);
      const valueB = fieldAccessor.call(nodeB);
      return valueA < valueB ? -ascending : (valueA > valueB ? ascending : 0);
    }

    /**
     * @param {number} indexA
     * @param {number} indexB
     * @return {number}
     */
    function sortByComparator(indexA, indexB) {
      nodeA.nodeIndex = indexA;
      nodeB.nodeIndex = indexB;
      let result = sortByNodeField(fieldAccessor1, ascending1);
      if (result === 0)
        result = sortByNodeField(fieldAccessor2, ascending2);
      return result || indexA - indexB;
    }

    return sortByComparator;
  }

  /**
   * @param {!HeapSnapshotModel.ComparatorConfig} comparator
   * @param {number} leftBound
   * @param {number} rightBound
   * @param {number} windowLeft
   * @param {number} windowRight
   */
  sort(comparator, leftBound, rightBound, windowLeft, windowRight) {
    this._iterationOrder.sortRange(
        this._buildCompareFunction(comparator), leftBound, rightBound, windowLeft, windowRight);
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.JSHeapSnapshot = class extends HeapSnapshotWorker.HeapSnapshot {
  /**
   * @param {!Object} profile
   * @param {!HeapSnapshotWorker.HeapSnapshotProgress} progress
   */
  constructor(profile, progress) {
    super(profile, progress);
    this._nodeFlags = {
      // bit flags
      canBeQueried: 1,
      detachedDOMTreeNode: 2,
      pageObject: 4  // The idea is to track separately the objects owned by the page and the objects owned by debugger.
    };
    this._lazyStringCache = {};
    this.initialize();
  }

  /**
   * @override
   * @param {number=} nodeIndex
   * @return {!HeapSnapshotWorker.JSHeapSnapshotNode}
   */
  createNode(nodeIndex) {
    return new HeapSnapshotWorker.JSHeapSnapshotNode(this, nodeIndex === undefined ? -1 : nodeIndex);
  }

  /**
   * @override
   * @param {number} edgeIndex
   * @return {!HeapSnapshotWorker.JSHeapSnapshotEdge}
   */
  createEdge(edgeIndex) {
    return new HeapSnapshotWorker.JSHeapSnapshotEdge(this, edgeIndex);
  }

  /**
   * @override
   * @param {number} retainerIndex
   * @return {!HeapSnapshotWorker.JSHeapSnapshotRetainerEdge}
   */
  createRetainingEdge(retainerIndex) {
    return new HeapSnapshotWorker.JSHeapSnapshotRetainerEdge(this, retainerIndex);
  }

  /**
   * @override
   * @return {function(!HeapSnapshotWorker.HeapSnapshotEdge):boolean}
   */
  containmentEdgesFilter() {
    return edge => !edge.isInvisible();
  }

  /**
   * @override
   * @return {function(!HeapSnapshotWorker.HeapSnapshotEdge):boolean}
   */
  retainingEdgesFilter() {
    const containmentEdgesFilter = this.containmentEdgesFilter();
    function filter(edge) {
      return containmentEdgesFilter(edge) && !edge.node().isRoot() && !edge.isWeak();
    }
    return filter;
  }

  /**
   * @override
   */
  calculateFlags() {
    this._flags = new Uint32Array(this.nodeCount);
    this._markDetachedDOMTreeNodes();
    this._markQueriableHeapObjects();
    this._markPageOwnedNodes();
  }

  /**
   * @override
   */
  calculateDistances() {
    /**
     * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
     * @param {!HeapSnapshotWorker.HeapSnapshotEdge} edge
     * @return {boolean}
     */
    function filter(node, edge) {
      if (node.isHidden())
        return edge.name() !== 'sloppy_function_map' || node.rawName() !== 'system / NativeContext';
      if (node.isArray()) {
        // DescriptorArrays are fixed arrays used to hold instance descriptors.
        // The format of the these objects is:
        //   [0]: Number of descriptors
        //   [1]: Either Smi(0) if uninitialized, or a pointer to small fixed array:
        //          [0]: pointer to fixed array with enum cache
        //          [1]: either Smi(0) or pointer to fixed array with indices
        //   [i*3+2]: i-th key
        //   [i*3+3]: i-th type
        //   [i*3+4]: i-th descriptor
        // As long as maps may share descriptor arrays some of the descriptor
        // links may not be valid for all the maps. We just skip
        // all the descriptor links when calculating distances.
        // For more details see http://crbug.com/413608
        if (node.rawName() !== '(map descriptors)')
          return true;
        const index = edge.name();
        return index < 2 || (index % 3) !== 1;
      }
      return true;
    }
    super.calculateDistances(filter);
  }

  /**
   * @override
   * @protected
   * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
   * @return {boolean}
   */
  isUserRoot(node) {
    return node.isUserRoot() || node.isDocumentDOMTreesRoot();
  }

  /**
   * @override
   * @return {?{map: !Uint32Array, flag: number}}
   */
  userObjectsMapAndFlag() {
    return {map: this._flags, flag: this._nodeFlags.pageObject};
  }

  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
   * @return {number}
   */
  _flagsOfNode(node) {
    return this._flags[node.nodeIndex / this._nodeFieldCount];
  }

  _markDetachedDOMTreeNodes() {
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this._nodeFieldCount;
    const nodeNativeType = this._nodeNativeType;
    const nodeTypeOffset = this._nodeTypeOffset;
    const flag = this._nodeFlags.detachedDOMTreeNode;
    const node = this.rootNode();
    for (let nodeIndex = 0, ordinal = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount, ordinal++) {
      const nodeType = nodes[nodeIndex + nodeTypeOffset];
      if (nodeType !== nodeNativeType)
        continue;
      node.nodeIndex = nodeIndex;
      if (node.name().startsWith('Detached '))
        this._flags[ordinal] |= flag;
    }
  }

  _markQueriableHeapObjects() {
    // Allow runtime properties query for objects accessible from Window objects
    // via regular properties, and for DOM wrappers. Trying to access random objects
    // can cause a crash due to insonsistent state of internal properties of wrappers.
    const flag = this._nodeFlags.canBeQueried;
    const hiddenEdgeType = this._edgeHiddenType;
    const internalEdgeType = this._edgeInternalType;
    const invisibleEdgeType = this._edgeInvisibleType;
    const weakEdgeType = this._edgeWeakType;
    const edgeToNodeOffset = this._edgeToNodeOffset;
    const edgeTypeOffset = this._edgeTypeOffset;
    const edgeFieldsCount = this._edgeFieldsCount;
    const containmentEdges = this.containmentEdges;
    const nodeFieldCount = this._nodeFieldCount;
    const firstEdgeIndexes = this._firstEdgeIndexes;

    const flags = this._flags;
    const list = [];

    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      if (iter.edge.node().isUserRoot())
        list.push(iter.edge.node().nodeIndex / nodeFieldCount);
    }

    while (list.length) {
      const nodeOrdinal = list.pop();
      if (flags[nodeOrdinal] & flag)
        continue;
      flags[nodeOrdinal] |= flag;
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        const childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (flags[childNodeOrdinal] & flag)
          continue;
        const type = containmentEdges[edgeIndex + edgeTypeOffset];
        if (type === hiddenEdgeType || type === invisibleEdgeType || type === internalEdgeType || type === weakEdgeType)
          continue;
        list.push(childNodeOrdinal);
      }
    }
  }

  _markPageOwnedNodes() {
    const edgeShortcutType = this._edgeShortcutType;
    const edgeElementType = this._edgeElementType;
    const edgeToNodeOffset = this._edgeToNodeOffset;
    const edgeTypeOffset = this._edgeTypeOffset;
    const edgeFieldsCount = this._edgeFieldsCount;
    const edgeWeakType = this._edgeWeakType;
    const firstEdgeIndexes = this._firstEdgeIndexes;
    const containmentEdges = this.containmentEdges;
    const nodeFieldCount = this._nodeFieldCount;
    const nodesCount = this.nodeCount;

    const flags = this._flags;
    const pageObjectFlag = this._nodeFlags.pageObject;

    const nodesToVisit = new Uint32Array(nodesCount);
    let nodesToVisitLength = 0;

    const rootNodeOrdinal = this._rootNodeIndex / nodeFieldCount;
    const node = this.rootNode();

    // Populate the entry points. They are Window objects and DOM Tree Roots.
    for (let edgeIndex = firstEdgeIndexes[rootNodeOrdinal], endEdgeIndex = firstEdgeIndexes[rootNodeOrdinal + 1];
         edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
      const edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
      const nodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
      if (edgeType === edgeElementType) {
        node.nodeIndex = nodeIndex;
        if (!node.isDocumentDOMTreesRoot())
          continue;
      } else if (edgeType !== edgeShortcutType) {
        continue;
      }
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      nodesToVisit[nodesToVisitLength++] = nodeOrdinal;
      flags[nodeOrdinal] |= pageObjectFlag;
    }

    // Mark everything reachable with the pageObject flag.
    while (nodesToVisitLength) {
      const nodeOrdinal = nodesToVisit[--nodesToVisitLength];
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        const childNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (flags[childNodeOrdinal] & pageObjectFlag)
          continue;
        const type = containmentEdges[edgeIndex + edgeTypeOffset];
        if (type === edgeWeakType)
          continue;
        nodesToVisit[nodesToVisitLength++] = childNodeOrdinal;
        flags[childNodeOrdinal] |= pageObjectFlag;
      }
    }
  }

  /**
   * @override
   */
  calculateStatistics() {
    const nodeFieldCount = this._nodeFieldCount;
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeTypeOffset = this._nodeTypeOffset;
    const nodeSizeOffset = this._nodeSelfSizeOffset;
    const nodeNativeType = this._nodeNativeType;
    const nodeCodeType = this._nodeCodeType;
    const nodeConsStringType = this._nodeConsStringType;
    const nodeSlicedStringType = this._nodeSlicedStringType;
    const distances = this._nodeDistances;
    let sizeNative = 0;
    let sizeCode = 0;
    let sizeStrings = 0;
    let sizeJSArrays = 0;
    let sizeSystem = 0;
    const node = this.rootNode();
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      const nodeSize = nodes[nodeIndex + nodeSizeOffset];
      const ordinal = nodeIndex / nodeFieldCount;
      if (distances[ordinal] >= HeapSnapshotModel.baseSystemDistance) {
        sizeSystem += nodeSize;
        continue;
      }
      const nodeType = nodes[nodeIndex + nodeTypeOffset];
      node.nodeIndex = nodeIndex;
      if (nodeType === nodeNativeType)
        sizeNative += nodeSize;
      else if (nodeType === nodeCodeType)
        sizeCode += nodeSize;
      else if (nodeType === nodeConsStringType || nodeType === nodeSlicedStringType || node.type() === 'string')
        sizeStrings += nodeSize;
      else if (node.name() === 'Array')
        sizeJSArrays += this._calculateArraySize(node);
    }
    this._statistics = new HeapSnapshotModel.Statistics();
    this._statistics.total = this.totalSize;
    this._statistics.v8heap = this.totalSize - sizeNative;
    this._statistics.native = sizeNative;
    this._statistics.code = sizeCode;
    this._statistics.jsArrays = sizeJSArrays;
    this._statistics.strings = sizeStrings;
    this._statistics.system = sizeSystem;
  }

  /**
   * @param {!HeapSnapshotWorker.HeapSnapshotNode} node
   * @return {number}
   */
  _calculateArraySize(node) {
    let size = node.selfSize();
    const beginEdgeIndex = node.edgeIndexesStart();
    const endEdgeIndex = node.edgeIndexesEnd();
    const containmentEdges = this.containmentEdges;
    const strings = this.strings;
    const edgeToNodeOffset = this._edgeToNodeOffset;
    const edgeTypeOffset = this._edgeTypeOffset;
    const edgeNameOffset = this._edgeNameOffset;
    const edgeFieldsCount = this._edgeFieldsCount;
    const edgeInternalType = this._edgeInternalType;
    for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
      const edgeType = containmentEdges[edgeIndex + edgeTypeOffset];
      if (edgeType !== edgeInternalType)
        continue;
      const edgeName = strings[containmentEdges[edgeIndex + edgeNameOffset]];
      if (edgeName !== 'elements')
        continue;
      const elementsNodeIndex = containmentEdges[edgeIndex + edgeToNodeOffset];
      node.nodeIndex = elementsNodeIndex;
      if (node.retainersCount() === 1)
        size += node.selfSize();
      break;
    }
    return size;
  }

  /**
   * @return {!HeapSnapshotModel.Statistics}
   */
  getStatistics() {
    return this._statistics;
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.JSHeapSnapshotNode = class extends HeapSnapshotWorker.HeapSnapshotNode {
  /**
   * @param {!HeapSnapshotWorker.JSHeapSnapshot} snapshot
   * @param {number=} nodeIndex
   */
  constructor(snapshot, nodeIndex) {
    super(snapshot, nodeIndex);
  }

  /**
   * @return {boolean}
   */
  canBeQueried() {
    const flags = this._snapshot._flagsOfNode(this);
    return !!(flags & this._snapshot._nodeFlags.canBeQueried);
  }

  /**
   * @return {string}
   */
  rawName() {
    return super.name();
  }

  /**
   * @override
   * @return {string}
   */
  name() {
    const snapshot = this._snapshot;
    if (this.rawType() === snapshot._nodeConsStringType) {
      let string = snapshot._lazyStringCache[this.nodeIndex];
      if (typeof string === 'undefined') {
        string = this._consStringName();
        snapshot._lazyStringCache[this.nodeIndex] = string;
      }
      return string;
    }
    return this.rawName();
  }

  /**
   * @return {string}
   */
  _consStringName() {
    const snapshot = this._snapshot;
    const consStringType = snapshot._nodeConsStringType;
    const edgeInternalType = snapshot._edgeInternalType;
    const edgeFieldsCount = snapshot._edgeFieldsCount;
    const edgeToNodeOffset = snapshot._edgeToNodeOffset;
    const edgeTypeOffset = snapshot._edgeTypeOffset;
    const edgeNameOffset = snapshot._edgeNameOffset;
    const strings = snapshot.strings;
    const edges = snapshot.containmentEdges;
    const firstEdgeIndexes = snapshot._firstEdgeIndexes;
    const nodeFieldCount = snapshot._nodeFieldCount;
    const nodeTypeOffset = snapshot._nodeTypeOffset;
    const nodeNameOffset = snapshot._nodeNameOffset;
    const nodes = snapshot.nodes;
    const nodesStack = [];
    nodesStack.push(this.nodeIndex);
    let name = '';

    while (nodesStack.length && name.length < 1024) {
      const nodeIndex = nodesStack.pop();
      if (nodes[nodeIndex + nodeTypeOffset] !== consStringType) {
        name += strings[nodes[nodeIndex + nodeNameOffset]];
        continue;
      }
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      let firstNodeIndex = 0;
      let secondNodeIndex = 0;
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex && (!firstNodeIndex || !secondNodeIndex);
           edgeIndex += edgeFieldsCount) {
        const edgeType = edges[edgeIndex + edgeTypeOffset];
        if (edgeType === edgeInternalType) {
          const edgeName = strings[edges[edgeIndex + edgeNameOffset]];
          if (edgeName === 'first')
            firstNodeIndex = edges[edgeIndex + edgeToNodeOffset];
          else if (edgeName === 'second')
            secondNodeIndex = edges[edgeIndex + edgeToNodeOffset];
        }
      }
      nodesStack.push(secondNodeIndex);
      nodesStack.push(firstNodeIndex);
    }
    return name;
  }

  /**
   * @override
   * @return {string}
   */
  className() {
    const type = this.type();
    switch (type) {
      case 'hidden':
        return '(system)';
      case 'object':
      case 'native':
        return this.name();
      case 'code':
        return '(compiled code)';
      default:
        return '(' + type + ')';
    }
  }

  /**
   * @override
   * @return {number}
   */
  classIndex() {
    const snapshot = this._snapshot;
    const nodes = snapshot.nodes;
    const type = nodes[this.nodeIndex + snapshot._nodeTypeOffset];
    if (type === snapshot._nodeObjectType || type === snapshot._nodeNativeType)
      return nodes[this.nodeIndex + snapshot._nodeNameOffset];
    return -1 - type;
  }

  /**
   * @override
   * @return {number}
   */
  id() {
    const snapshot = this._snapshot;
    return snapshot.nodes[this.nodeIndex + snapshot._nodeIdOffset];
  }

  /**
   * @return {boolean}
   */
  isHidden() {
    return this.rawType() === this._snapshot._nodeHiddenType;
  }

  /**
   * @return {boolean}
   */
  isArray() {
    return this.rawType() === this._snapshot._nodeArrayType;
  }

  /**
   * @return {boolean}
   */
  isSynthetic() {
    return this.rawType() === this._snapshot._nodeSyntheticType;
  }

  /**
   * @return {boolean}
   */
  isUserRoot() {
    return !this.isSynthetic();
  }

  /**
   * @return {boolean}
   */
  isDocumentDOMTreesRoot() {
    return this.isSynthetic() && this.name() === '(Document DOM trees)';
  }

  /**
   * @override
   * @return {!HeapSnapshotModel.Node}
   */
  serialize() {
    const result = super.serialize();
    const flags = this._snapshot._flagsOfNode(this);
    if (flags & this._snapshot._nodeFlags.canBeQueried)
      result.canBeQueried = true;
    if (flags & this._snapshot._nodeFlags.detachedDOMTreeNode)
      result.detachedDOMTreeNode = true;
    return result;
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.JSHeapSnapshotEdge = class extends HeapSnapshotWorker.HeapSnapshotEdge {
  /**
   * @param {!HeapSnapshotWorker.JSHeapSnapshot} snapshot
   * @param {number=} edgeIndex
   */
  constructor(snapshot, edgeIndex) {
    super(snapshot, edgeIndex);
  }

  /**
   * @override
   * @return {!HeapSnapshotWorker.JSHeapSnapshotEdge}
   */
  clone() {
    const snapshot = /** @type {!HeapSnapshotWorker.JSHeapSnapshot} */ (this._snapshot);
    return new HeapSnapshotWorker.JSHeapSnapshotEdge(snapshot, this.edgeIndex);
  }

  /**
   * @override
   * @return {boolean}
   */
  hasStringName() {
    if (!this.isShortcut())
      return this._hasStringName();
    return isNaN(parseInt(this._name(), 10));
  }

  /**
   * @return {boolean}
   */
  isElement() {
    return this.rawType() === this._snapshot._edgeElementType;
  }

  /**
   * @return {boolean}
   */
  isHidden() {
    return this.rawType() === this._snapshot._edgeHiddenType;
  }

  /**
   * @return {boolean}
   */
  isWeak() {
    return this.rawType() === this._snapshot._edgeWeakType;
  }

  /**
   * @return {boolean}
   */
  isInternal() {
    return this.rawType() === this._snapshot._edgeInternalType;
  }

  /**
   * @return {boolean}
   */
  isInvisible() {
    return this.rawType() === this._snapshot._edgeInvisibleType;
  }

  /**
   * @return {boolean}
   */
  isShortcut() {
    return this.rawType() === this._snapshot._edgeShortcutType;
  }

  /**
   * @override
   * @return {string}
   */
  name() {
    const name = this._name();
    if (!this.isShortcut())
      return String(name);
    const numName = parseInt(name, 10);
    return String(isNaN(numName) ? name : numName);
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    const name = this.name();
    switch (this.type()) {
      case 'context':
        return '->' + name;
      case 'element':
        return '[' + name + ']';
      case 'weak':
        return '[[' + name + ']]';
      case 'property':
        return name.indexOf(' ') === -1 ? '.' + name : '["' + name + '"]';
      case 'shortcut':
        if (typeof name === 'string')
          return name.indexOf(' ') === -1 ? '.' + name : '["' + name + '"]';
        else
          return '[' + name + ']';
      case 'internal':
      case 'hidden':
      case 'invisible':
        return '{' + name + '}';
    }
    return '?' + name + '?';
  }

  /**
   * @return {boolean}
   */
  _hasStringName() {
    const type = this.rawType();
    const snapshot = this._snapshot;
    return type !== snapshot._edgeElementType && type !== snapshot._edgeHiddenType;
  }

  /**
   * @return {string|number}
   */
  _name() {
    return this._hasStringName() ? this._snapshot.strings[this._nameOrIndex()] : this._nameOrIndex();
  }

  /**
   * @return {number}
   */
  _nameOrIndex() {
    return this._edges[this.edgeIndex + this._snapshot._edgeNameOffset];
  }

  /**
   * @override
   * @return {number}
   */
  rawType() {
    return this._edges[this.edgeIndex + this._snapshot._edgeTypeOffset];
  }
};

/**
 * @unrestricted
 */
HeapSnapshotWorker.JSHeapSnapshotRetainerEdge = class extends HeapSnapshotWorker.HeapSnapshotRetainerEdge {
  /**
   * @param {!HeapSnapshotWorker.JSHeapSnapshot} snapshot
   * @param {number} retainerIndex
   */
  constructor(snapshot, retainerIndex) {
    super(snapshot, retainerIndex);
  }

  /**
   * @override
   * @return {!HeapSnapshotWorker.JSHeapSnapshotRetainerEdge}
   */
  clone() {
    const snapshot = /** @type {!HeapSnapshotWorker.JSHeapSnapshot} */ (this._snapshot);
    return new HeapSnapshotWorker.JSHeapSnapshotRetainerEdge(snapshot, this.retainerIndex());
  }

  /**
   * @return {boolean}
   */
  isHidden() {
    return this._edge().isHidden();
  }

  /**
   * @return {boolean}
   */
  isInternal() {
    return this._edge().isInternal();
  }

  /**
   * @return {boolean}
   */
  isInvisible() {
    return this._edge().isInvisible();
  }

  /**
   * @return {boolean}
   */
  isShortcut() {
    return this._edge().isShortcut();
  }

  /**
   * @return {boolean}
   */
  isWeak() {
    return this._edge().isWeak();
  }
};

(function disableLoggingForTest() {
  // Runtime doesn't exist because this file is loaded as a one-off
  // file in some inspector-protocol tests.
  if (self.Runtime && Runtime.queryParam('test'))
    console.warn = () => undefined;
})();
