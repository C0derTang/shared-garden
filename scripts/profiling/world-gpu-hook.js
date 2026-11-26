/* global window, GPUAdapter, performance, GPUBufferUsage, GPUMapMode */
// Measurement-only browser hook. No app diagnostics or optional GPU features ship.
(() => {
  window.__gpuFrames = [];
  window.__submitIntervals = [];
  window.__profileCapture = false;
  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (descriptor = {}) {
    const device = await requestDevice.call(this, {
      ...descriptor,
      requiredFeatures: [...new Set([...(descriptor.requiredFeatures || []), "timestamp-query"])],
    });
    window.__profileDevice = device;
    window.__profileAdapter = { vendor: this.info.vendor, architecture: this.info.architecture };
    const commands = new WeakMap();
    const shader = device.createShaderModule.bind(device);
    device.createShaderModule = (descriptor) => shader(
      descriptor.label === "garden-world.kuwahara.shader" && window.__profileShader
        ? { ...descriptor, code: window.__profileShader }
        : descriptor,
    );
    const createEncoder = device.createCommandEncoder.bind(device);
    device.createCommandEncoder = (...args) => {
      const encoder = createEncoder(...args);
      if (!window.__profileCapture) return encoder;
      const started = performance.now();
      const query = device.createQuerySet({ type: "timestamp", count: 64 });
      const labels = [];
      let count = 0;
      const begin = encoder.beginRenderPass.bind(encoder);
      encoder.beginRenderPass = (descriptor) => {
        const index = count;
        count += 2;
        const pass = begin({ ...descriptor, timestampWrites: { querySet: query, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1 } });
        let label = descriptor.label || "";
        const pipeline = pass.setPipeline.bind(pass);
        pass.setPipeline = (value) => { label ||= value.label; return pipeline(value); };
        const end = pass.end.bind(pass);
        pass.end = () => { labels.push(label); return end(); };
        return pass;
      };
      const finish = encoder.finish.bind(encoder);
      encoder.finish = (...args) => {
        if (!count) { query.destroy(); return finish(...args); }
        const resolve = device.createBuffer({ size: 512, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        const read = device.createBuffer({ size: 512, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        encoder.resolveQuerySet(query, 0, count, resolve, 0);
        encoder.copyBufferToBuffer(resolve, 0, read, 0, count * 8);
        const command = finish(...args);
        commands.set(command, { query, resolve, read, count, labels, encodeMs: performance.now() - started });
        return command;
      };
      return encoder;
    };
    const submit = device.queue.submit.bind(device.queue);
    let previousSubmit;
    device.queue.submit = (buffers) => {
      if (window.__profileCapture) {
        const now = performance.now();
        if (previousSubmit !== undefined) window.__submitIntervals.push(now - previousSubmit);
        previousSubmit = now;
      } else previousSubmit = undefined;
      submit(buffers);
      for (const command of buffers) {
        const data = commands.get(command);
        if (!data) continue;
        commands.delete(command);
        void data.read.mapAsync(GPUMapMode.READ).then(() => {
          const values = new BigUint64Array(data.read.getMappedRange());
          const spans = {};
          for (let i = 0; i < data.count; i += 2) spans[`${i / 2}:${data.labels[i / 2]}`] = Number(values[i + 1] - values[i]) / 1e6;
          window.__gpuFrames.push({
            spans,
            // Metal pass spans can overlap. This is the entire command-buffer
            // timestamp envelope, not an invalid sum of overlapping spans.
            gpuEnvelopeMs: Number(values[data.count - 1] - values[0]) / 1e6,
            encodeMs: data.encodeMs,
            timestampsNs: [...values.slice(0, data.count)].map(String),
          });
          data.read.unmap();
        }).finally(() => { data.query.destroy(); data.resolve.destroy(); data.read.destroy(); });
      }
    };
    return device;
  };
})();
