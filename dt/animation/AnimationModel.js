// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


/**
 * @constructor
 * @extends {WebInspector.SDKModel}
 * @param {!WebInspector.Target} target
 */
WebInspector.AnimationModel = function(target)
{
    WebInspector.SDKModel.call(this, WebInspector.AnimationModel, target);
    this._agent = target.animationAgent();
    target.registerAnimationDispatcher(new WebInspector.AnimationDispatcher(this));
    /** @type {!Map.<string, !WebInspector.AnimationModel.Animation>} */
    this._animationsById = new Map();
    /** @type {!Map.<string, !WebInspector.AnimationModel.AnimationGroup>} */
    this._animationGroups = new Map();
    /** @type {!Array.<string>} */
    this._pendingAnimations = [];
    target.resourceTreeModel.addEventListener(WebInspector.ResourceTreeModel.EventTypes.MainFrameNavigated, this._mainFrameNavigated, this);
}

WebInspector.AnimationModel.Events = {
    AnimationGroupStarted: "AnimationGroupStarted",
    AnimationCanceled: "AnimationCanceled"
}

WebInspector.AnimationModel.prototype = {
    _mainFrameNavigated: function()
    {
        this._animationsById.clear();
        this._animationGroups.clear();
        this._pendingAnimations = [];
    },

    /**
     * @param {string} id
     */
    animationCreated: function(id)
    {
        this._pendingAnimations.push(id);
    },

    /**
     * @param {!AnimationAgent.Animation} payload
     */
    animationStarted: function(payload)
    {
        var animation = WebInspector.AnimationModel.Animation.parsePayload(this.target(), payload);
        this._animationsById.set(animation.id(), animation);

        for (var id of this._pendingAnimations) {
            if (!this._animationsById.get(id))
                return;
        }

        while (this._pendingAnimations.length)
            this._matchExistingGroups(this._createGroupFromPendingAnimations());
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationGroup} incomingGroup
     * @return {boolean}
     */
    _matchExistingGroups: function(incomingGroup)
    {
        var matchedGroup = null;
        for (var group of this._animationGroups.values()) {
            if (group._matches(incomingGroup)) {
                matchedGroup = group;
                group._update(incomingGroup);
                break;
            }
        }

        if (!matchedGroup)
            this._animationGroups.set(incomingGroup.id(), incomingGroup);
        this.dispatchEventToListeners(WebInspector.AnimationModel.Events.AnimationGroupStarted, matchedGroup || incomingGroup);
        return !!matchedGroup;
    },

    /**
     * @return {!WebInspector.AnimationModel.AnimationGroup}
     */
    _createGroupFromPendingAnimations: function()
    {
        console.assert(this._pendingAnimations.length);
        var groupedAnimations = [this._animationsById.get(this._pendingAnimations.shift())];
        var remainingAnimations = [];
        for (var id of this._pendingAnimations) {
            var anim = this._animationsById.get(id);
            if (anim.startTime() === groupedAnimations[0].startTime())
                groupedAnimations.push(anim);
            else
                remainingAnimations.push(id);
        }
        this._pendingAnimations = remainingAnimations;
        return new WebInspector.AnimationModel.AnimationGroup(this.target(), groupedAnimations[0].id(), groupedAnimations);
    },

    /**
     * @return {!Promise.<number>}
     */
    playbackRatePromise: function()
    {
        /**
         * @param {?Protocol.Error} error
         * @param {number} playbackRate
         * @return {number}
         */
        function callback(error, playbackRate)
        {
            if (error)
                return 1;
            return playbackRate;
        }

        return this._agent.getPlaybackRate(callback).catchException(1);
    },

    /**
     * @param {number} playbackRate
     */
    setPlaybackRate: function(playbackRate)
    {
        this._agent.setPlaybackRate(playbackRate);
    },

    ensureEnabled: function()
    {
        if (this._enabled)
            return;
        this._agent.enable();
        this._enabled = true;
    },

    __proto__: WebInspector.SDKModel.prototype
}

WebInspector.AnimationModel._symbol = Symbol("AnimationModel");

/**
 * @param {!WebInspector.Target} target
 * @return {!WebInspector.AnimationModel}
 */
WebInspector.AnimationModel.fromTarget = function(target)
{
    if (!target[WebInspector.AnimationModel._symbol])
        target[WebInspector.AnimationModel._symbol] = new WebInspector.AnimationModel(target);

    return target[WebInspector.AnimationModel._symbol];
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.Animation} payload
 */
WebInspector.AnimationModel.Animation = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    this._source = new WebInspector.AnimationModel.AnimationEffect(this.target(), this._payload.source);
}

/**
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.Animation} payload
 * @return {!WebInspector.AnimationModel.Animation}
 */
WebInspector.AnimationModel.Animation.parsePayload = function(target, payload)
{
    return new WebInspector.AnimationModel.Animation(target, payload);
}

/** @enum {string} */
WebInspector.AnimationModel.Animation.Type = {
    CSSTransition: "CSSTransition",
    CSSAnimation: "CSSAnimation",
    WebAnimation: "WebAnimation"
}

WebInspector.AnimationModel.Animation.prototype = {
    /**
     * @return {!AnimationAgent.Animation}
     */
    payload: function()
    {
        return this._payload;
    },

    /**
     * @return {string}
     */
    id: function()
    {
        return this._payload.id;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this.source().name();
    },

    /**
     * @return {boolean}
     */
    paused: function()
    {
        return this._payload.pausedState;
    },

    /**
     * @return {string}
     */
    playState: function()
    {
        return this._playState || this._payload.playState;
    },

    /**
     * @param {string} playState
     */
    setPlayState: function(playState)
    {
        this._playState = playState;
    },

    /**
     * @return {number}
     */
    playbackRate: function()
    {
        return this._payload.playbackRate;
    },

    /**
     * @return {number}
     */
    startTime: function()
    {
        return this._payload.startTime;
    },

    /**
     * @return {number}
     */
    endTime: function()
    {
        if (!this.source().iterations)
            return Infinity;
        return this.startTime() + this.source().delay() + this.source().duration() * this.source().iterations() + this.source().endDelay();
    },

    /**
     * @return {number}
     */
    currentTime: function()
    {
        return this._payload.currentTime;
    },

    /**
     * @return {!WebInspector.AnimationModel.AnimationEffect}
     */
    source: function()
    {
        return this._source;
    },

    /**
     * @return {!WebInspector.AnimationModel.Animation.Type}
     */
    type: function()
    {
        return /** @type {!WebInspector.AnimationModel.Animation.Type} */(this._payload.type);
    },

    /**
     * @param {!WebInspector.AnimationModel.Animation} animation
     * @return {boolean}
     */
    overlaps: function(animation)
    {
        // Infinite animations
        if (!this.source().iterations() || !animation.source().iterations())
            return true;

        var firstAnimation = this.startTime() < animation.startTime() ? this : animation;
        var secondAnimation = firstAnimation === this ? animation : this;
        return firstAnimation.endTime() >= secondAnimation.startTime();
    },

    /**
     * @param {number} duration
     * @param {number} delay
     */
    setTiming: function(duration, delay)
    {
        this._source.node().then(this._updateNodeStyle.bind(this, duration, delay));
        this._source._duration = duration;
        this._source._delay = delay;
        if (this.type() !== WebInspector.AnimationModel.Animation.Type.CSSAnimation)
            this.target().animationAgent().setTiming(this.id(), duration, delay);
    },

    /**
     * @param {number} duration
     * @param {number} delay
     * @param {!WebInspector.DOMNode} node
     */
    _updateNodeStyle: function(duration, delay, node)
    {
        var animationPrefix;
        if (this.type() == WebInspector.AnimationModel.Animation.Type.CSSTransition)
            animationPrefix = "transition-";
        else if (this.type() == WebInspector.AnimationModel.Animation.Type.CSSAnimation)
            animationPrefix = "animation-";
        else
            return;

        var cssModel = WebInspector.CSSStyleModel.fromTarget(node.target());
        if (!cssModel)
            return;
        cssModel.setEffectivePropertyValueForNode(node.id, animationPrefix + "duration", duration + "ms");
        cssModel.setEffectivePropertyValueForNode(node.id, animationPrefix + "delay", delay + "ms");
    },

    /**
     * @return {!Promise.<?WebInspector.RemoteObject>}
     */
    remoteObjectPromise: function()
    {
        /**
         * @param {?Protocol.Error} error
         * @param {!RuntimeAgent.RemoteObject} payload
         * @return {?WebInspector.RemoteObject}
         * @this {!WebInspector.AnimationModel.Animation}
         */
        function callback(error, payload)
        {
            return !error ? this.target().runtimeModel.createRemoteObject(payload) : null;
        }

        return this.target().animationAgent().resolveAnimation(this.id(), callback.bind(this));
    },

    /**
     * @return {string}
     */
    _cssId: function()
    {
        return this._payload.cssId || "";
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.AnimationEffect} payload
 */
WebInspector.AnimationModel.AnimationEffect = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    if (payload.keyframesRule)
        this._keyframesRule = new WebInspector.AnimationModel.KeyframesRule(target, payload.keyframesRule);
    this._delay = this._payload.delay;
    this._duration = this._payload.duration;
}

WebInspector.AnimationModel.AnimationEffect.prototype = {
    /**
     * @return {number}
     */
    delay: function()
    {
        return this._delay;
    },

    /**
     * @return {number}
     */
    endDelay: function()
    {
        return this._payload.endDelay;
    },

    /**
     * @return {number}
     */
    playbackRate: function()
    {
        return this._payload.playbackRate;
    },

    /**
     * @return {number}
     */
    iterationStart: function()
    {
        return this._payload.iterationStart;
    },

    /**
     * @return {number}
     */
    iterations: function()
    {
        return this._payload.iterations || Infinity;
    },

    /**
     * @return {number}
     */
    duration: function()
    {
        return this._duration;
    },

    /**
     * @return {string}
     */
    direction: function()
    {
        return this._payload.direction;
    },

    /**
     * @return {string}
     */
    fill: function()
    {
        return this._payload.fill;
    },

    /**
     * @return {string}
     */
    name: function()
    {
        return this._payload.name;
    },

    /**
     * @return {!Promise.<!WebInspector.DOMNode>}
     */
    node: function()
    {
        if (!this._deferredNode)
            this._deferredNode = new WebInspector.DeferredDOMNode(this.target(), this.backendNodeId());
        return this._deferredNode.resolvePromise();
    },

    /**
     * @return {!WebInspector.DeferredDOMNode}
     */
    deferredNode: function()
    {
        return new WebInspector.DeferredDOMNode(this.target(), this.backendNodeId());
    },

    /**
     * @return {number}
     */
    backendNodeId: function()
    {
        return this._payload.backendNodeId;
    },

    /**
     * @return {?WebInspector.AnimationModel.KeyframesRule}
     */
    keyframesRule: function()
    {
        return this._keyframesRule;
    },

    /**
     * @return {string}
     */
    easing: function()
    {
        return this._payload.easing;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.KeyframesRule} payload
 */
WebInspector.AnimationModel.KeyframesRule = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    this._keyframes = this._payload.keyframes.map(function (keyframeStyle) {
        return new WebInspector.AnimationModel.KeyframeStyle(target, keyframeStyle);
    });
}

WebInspector.AnimationModel.KeyframesRule.prototype = {
    /**
     * @param {!Array.<!AnimationAgent.KeyframeStyle>} payload
     */
    _setKeyframesPayload: function(payload)
    {
        this._keyframes = payload.map(function (keyframeStyle) {
            return new WebInspector.AnimationModel.KeyframeStyle(this._target, keyframeStyle);
        });
    },

    /**
     * @return {string|undefined}
     */
    name: function()
    {
        return this._payload.name;
    },

    /**
     * @return {!Array.<!WebInspector.AnimationModel.KeyframeStyle>}
     */
    keyframes: function()
    {
        return this._keyframes;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {!AnimationAgent.KeyframeStyle} payload
 */
WebInspector.AnimationModel.KeyframeStyle = function(target, payload)
{
    WebInspector.SDKObject.call(this, target);
    this._payload = payload;
    this._offset = this._payload.offset;
}

WebInspector.AnimationModel.KeyframeStyle.prototype = {
    /**
     * @return {string}
     */
    offset: function()
    {
        return this._offset;
    },

    /**
     * @param {number} offset
     */
    setOffset: function(offset)
    {
        this._offset = offset * 100 + "%";
    },

    /**
     * @return {number}
     */
    offsetAsNumber: function()
    {
        return parseFloat(this._offset) / 100;
    },

    /**
     * @return {string}
     */
    easing: function()
    {
        return this._payload.easing;
    },

    __proto__: WebInspector.SDKObject.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SDKObject}
 * @param {!WebInspector.Target} target
 * @param {string} id
 * @param {!Array.<!WebInspector.AnimationModel.Animation>} animations
 */
WebInspector.AnimationModel.AnimationGroup = function(target, id, animations)
{
    WebInspector.SDKObject.call(this, target);
    this._id = id;
    this._animations = animations;
    this._paused = false;
}

WebInspector.AnimationModel.AnimationGroup.prototype = {
    /**
     * @return {string}
     */
    id: function()
    {
        return this._id;
    },

    /**
     * @return {!Array.<!WebInspector.AnimationModel.Animation>}
     */
    animations: function()
    {
        return this._animations;
    },

    /**
     * @return {!Array.<string>}
     */
    _animationIds: function()
    {
        /**
         * @param {!WebInspector.AnimationModel.Animation} animation
         * @return {string}
         */
        function extractId(animation)
        {
            return animation.id();
        }

        return this._animations.map(extractId);
    },

    /**
     * @return {number}
     */
    startTime: function()
    {
        return this._animations[0].startTime();
    },

    /**
     * @param {number} currentTime
     */
    seekTo: function(currentTime)
    {
        this.target().animationAgent().seekAnimations(this._animationIds(), currentTime);
    },

    /**
     * @return {boolean}
     */
    paused: function()
    {
        return this._paused;
    },

    /**
     * @param {boolean} paused
     */
    togglePause: function(paused)
    {
        this._paused = paused;
        this.target().animationAgent().setPaused(this._animationIds(), paused);
    },

    /**
     * @return {!Promise.<number>}
     */
    currentTimePromise: function()
    {
        /**
         * @param {?Protocol.Error} error
         * @param {number} currentTime
         * @return {number}
         */
        function callback(error, currentTime)
        {
            return !error ? currentTime : 0;
        }

        return this.target().animationAgent().getCurrentTime(this._animations[0].id(), callback).catchException(0);
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationGroup} group
     * @return {boolean}
     */
    _matches: function(group)
    {
        /**
         * @param {!WebInspector.AnimationModel.Animation} anim
         * @return {string}
         */
        function extractId(anim)
        {
            if (anim.type() === WebInspector.AnimationModel.Animation.Type.WebAnimation)
                return anim.type() + anim.id();
            else
                return anim._cssId();
        }

        if (this._animations.length !== group._animations.length)
            return false;
        var left = this._animations.map(extractId).sort();
        var right = group._animations.map(extractId).sort();
        for (var i = 0; i < left.length; i++) {
            if (left[i] !== right[i])
                return false;
        }
        return true;
    },

    /**
     * @param {!WebInspector.AnimationModel.AnimationGroup} group
     */
    _update: function(group)
    {
        this._animations = group._animations;
    },

    __proto__: WebInspector.SDKObject.prototype
}


/**
 * @constructor
 * @implements {AnimationAgent.Dispatcher}
 */
WebInspector.AnimationDispatcher = function(animationModel)
{
    this._animationModel = animationModel;
}

WebInspector.AnimationDispatcher.prototype = {
    /**
     * @override
     * @param {string} id
     */
    animationCreated: function(id)
    {
        this._animationModel.animationCreated(id);
    },

    /**
     * @override
     * @param {!AnimationAgent.Animation} payload
     */
    animationStarted: function(payload)
    {
        this._animationModel.animationStarted(payload);
    }
}
