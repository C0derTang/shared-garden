import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
export function evidenceMetadata(output){
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src'],{encoding:'utf8'}).trim().split('\n').filter(file=>!file.includes('.test.')).sort();
 const hash=createHash('sha256');for(const file of files)hash.update(file).update(readFileSync(file));
 const metadata={headAtCapture:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtimeSourceSha256:hash.digest('hex'),fixtureSha256:createHash('sha256').update(readFileSync('scripts/profiling/fixtures/type-area-garden.json')).digest('hex'),capturedAt:new Date().toISOString(),scope:'Loopback-only synthetic state; no authenticated session or backend mutations'};
 mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'metadata.json'),JSON.stringify(metadata,null,2));return metadata;
}
