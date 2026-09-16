import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {installCloseGuard} from '../dist/apps/desktop/close-guard.js';
class Window extends EventEmitter{closed=false;close(){let blocked=false;this.emit('close',{preventDefault(){blocked=true;}});if(!blocked)this.closed=true;}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const [label,dirty,choice,saved,unchanged,expected] of [
 ['clean close',false,'cancel',false,true,true],['cancel',true,'cancel',false,true,false],['discard',true,'discard',false,true,true],['save canceled',true,'save',false,true,false],['saved',true,'save',true,true,true],['edited during save',true,'save',true,false,false]
])test(label,async()=>{const win=new Window();installCloseGuard(win,{snapshot:async()=>({dirty,project:{}}),decide:async()=>choice,save:async()=>saved,unchanged:async()=>unchanged,error:e=>{throw e;}});win.close();await tick();assert.equal(win.closed,expected);});
test('write failure keeps window open and reports error',async()=>{const win=new Window();let error;installCloseGuard(win,{snapshot:async()=>({dirty:true,project:{}}),decide:async()=> 'save',save:async()=>{throw Error('Disk full');},unchanged:async()=>true,error:e=>error=e});win.close();await tick();assert.equal(win.closed,false);assert.match(error.message,/Disk full/);});
test('repeated close requests share one decision',async()=>{const win=new Window();let count=0,resolve;installCloseGuard(win,{snapshot:async()=>({dirty:true,project:{}}),decide:()=>{count++;return new Promise(r=>resolve=r);},save:async()=>false,unchanged:async()=>true,error:e=>{throw e;}});win.close();win.close();await tick();assert.equal(count,1);resolve('discard');await tick();assert.equal(win.closed,true);});
