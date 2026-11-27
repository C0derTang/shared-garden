import {Buffer} from "node:buffer";
import sharp from "sharp";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import process from "node:process";
const output=resolve(process.env.PROFILE_OUTPUT||"/tmp/ccapp-224-island-composed");
const observations=JSON.parse(readFileSync(resolve(output,"observations.json"),"utf8"));
for(const observation of observations)for(const primary of [true,false]){
 const shots=observation.views.filter(s=>!primary||!s.id.startsWith("pocket:")||s.id.endsWith(":0"));
 const width=observation.view==="portrait"?225:400,height=observation.view==="portrait"?487:250,pieces=[];
 for(const [index,shot]of shots.entries()){
  const left=index%4*width,top=Math.floor(index/4)*(height+25);
  pieces.push({input:await sharp(resolve(output,shot.screenshot)).resize(width,height,{fit:"fill"}).toBuffer(),left,top});
  pieces.push({input:Buffer.from(`<svg width="${width}" height="25"><text x="6" y="18" fill="#282e1b" font-size="12">${shot.id}</text></svg>`),left,top:top+height});
 }
 await sharp({create:{width:width*4,height:Math.ceil(shots.length/4)*(height+25),channels:3,background:"#efe9d7"}}).composite(pieces).png().toFile(resolve(output,`${observation.view}-${primary?"main":"all"}-contact.png`));
}
