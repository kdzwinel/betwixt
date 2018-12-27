// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Profiler.ProfileTypeRegistry = class {
  constructor() {
    this.cpuProfileType = new Profiler.CPUProfileType();
    this.heapSnapshotProfileType = new Profiler.HeapSnapshotProfileType();
    this.samplingHeapProfileType = new Profiler.SamplingHeapProfileType();
    this.samplingNativeHeapProfileType = new Profiler.SamplingNativeHeapProfileType();
    this.samplingNativeHeapSnapshotBrowserType = new Profiler.SamplingNativeHeapSnapshotBrowserType();
    this.samplingNativeHeapSnapshotRendererType = new Profiler.SamplingNativeHeapSnapshotRendererType();
    this.trackingHeapSnapshotProfileType = new Profiler.TrackingHeapSnapshotProfileType();
  }
};

Profiler.ProfileTypeRegistry.instance = new Profiler.ProfileTypeRegistry();
