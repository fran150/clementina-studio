import {mkdir,readFile,writeFile,rename,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {encodeProject,decodeProject,type TileProject} from '../../packages/assets/index.js';
export class RecoveryStore {
 constructor(readonly directory:string,readonly id:string){}
 get file(){return path.join(this.directory,this.id+'.cstudio');}
 async save(project:TileProject){const bytes=encodeProject(project);await mkdir(this.directory,{recursive:true});await writeFile(this.file+'.tmp',bytes);await rename(this.file+'.tmp',this.file);}
 async clear(){await rm(this.file,{force:true});}
 async candidates(){await mkdir(this.directory,{recursive:true});return (await readdir(this.directory)).filter(n=>n.endsWith('.cstudio')&&n!==this.id+'.cstudio');}
 async read(name:string){return decodeProject(await readFile(path.join(this.directory,path.basename(name)),'utf8'));}
 async remove(name:string){await rm(path.join(this.directory,path.basename(name)),{force:true});}
}
