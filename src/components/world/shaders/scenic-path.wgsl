import { World, aerial, belowMirror, distanceAlpha, lampLight, shadowFactor, srgbToLinear, valueNoise } from "./common.wgsl";
@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
struct PathIn { @location(0) position: vec3f, @location(1) normal: vec3f, @location(2) ribbon: vec2f }
struct PathOut { @builtin(position) clip: vec4f, @location(0) worldPos: vec3f, @location(1) ribbon: vec2f }
@vertex fn vs_main(input: PathIn) -> PathOut {
 var out: PathOut; out.clip=world.viewProjection*vec4f(input.position,1.0);out.worldPos=input.position;out.ribbon=input.ribbon;return out;
}
@fragment fn fs_main(input:PathOut) -> @location(0) vec4f {
 if(belowMirror(input.worldPos,world)){discard;}
 let p=input.worldPos.xz;
 let coarse=valueNoise(p*4.0);let pebble=valueNoise(p*31.0);
 let rim=smoothstep(0.72,1.0,abs(input.ribbon.x)+(coarse-0.5)*0.22);
 let earth=mix(srgbToLinear(vec3f(0.43,0.34,0.22)),srgbToLinear(vec3f(0.66,0.57,0.4)),coarse*0.65+pebble*0.35);
 let albedo=mix(earth,srgbToLinear(vec3f(0.31,0.37,0.17)),rim*0.7);
 let n=vec3f(0.0,1.0,0.0);
 let shadow=shadowFactor(shadowMap,shadowSampler,world,input.worldPos,n);
 let direct=clamp(dot(n,normalize(world.lightDir))*0.55+0.45,0.0,1.0)*shadow;
 let color=albedo*(world.ambient*0.75+world.lightColor*world.lightIntensity*direct+lampLight(input.worldPos,n,world));
 return vec4f(aerial(color,input.worldPos,world),distanceAlpha(input.worldPos,world));
}
