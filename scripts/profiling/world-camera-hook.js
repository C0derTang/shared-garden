/* global GPUAdapter,window,performance */
// Verification-only observation of the actual main-ground uniform range.
// No app API, shader, uniforms, timing or geometry is changed.
(() => {
 const request=GPUAdapter.prototype.requestDevice;
 GPUAdapter.prototype.requestDevice=async function(...args){
  const device=await request.apply(this,args),groups=new WeakMap(),bytes=new WeakMap();let cameraResource=null;
  const createGroup=device.createBindGroup.bind(device);device.createBindGroup=descriptor=>{const group=createGroup(descriptor);groups.set(group,descriptor.entries);return group;};
  const write=device.queue.writeBuffer.bind(device.queue);device.queue.writeBuffer=(buffer,offset,data,dataOffset=0,size)=>{
   const unit=ArrayBuffer.isView(data)?data.BYTES_PER_ELEMENT||1:1,source=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data),begin=dataOffset*unit,length=size===undefined?source.byteLength-begin:size*unit;
   if(buffer.label==='vgpu.frame.uniforms'){let target=bytes.get(buffer);if(!target){target=new Uint8Array(buffer.size);bytes.set(buffer,target);}target.set(source.subarray(begin,begin+length),offset);}
   return write(buffer,offset,data,dataOffset,size);
  };
  const createEncoder=device.createCommandEncoder.bind(device);device.createCommandEncoder=(...args)=>{
   const encoder=createEncoder(...args),begin=encoder.beginRenderPass.bind(encoder);
   encoder.beginRenderPass=descriptor=>{const pass=begin(descriptor);let label='',bindings=[];const pipeline=pass.setPipeline.bind(pass),bind=pass.setBindGroup.bind(pass),draw=pass.draw.bind(pass),indexed=pass.drawIndexed.bind(pass);
    pass.setPipeline=value=>{label=value.label;return pipeline(value);};pass.setBindGroup=(index,group,...args)=>{bindings[index]=group;return bind(index,group,...args);};
    const capture=()=>{if(label==='garden-world.ground.pipeline')for(const group of bindings)for(const entry of groups.get(group)||[]){const resource=entry.resource;if(resource.buffer&&resource.size>=384)cameraResource=resource;}};
    pass.draw=(...args)=>{capture();return draw(...args);};pass.drawIndexed=(...args)=>{capture();return indexed(...args);};return pass;
   };return encoder;
  };
  const submit=device.queue.submit.bind(device.queue);device.queue.submit=buffers=>{const resource=cameraResource,data=resource&&bytes.get(resource.buffer);if(data){const view=new Float32Array(data.buffer,resource.offset||0,52);window.__actualCamera={matrix:[...view.slice(0,16)],eye:[...view.slice(48,51)],capturedAt:performance.now()};}return submit(buffers);};return device;
 };
})();
