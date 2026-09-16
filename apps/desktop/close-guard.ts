import type {BrowserWindow} from 'electron';
export interface CloseActions<T>{
 snapshot():Promise<{dirty:boolean;project:T}>;
 decide():Promise<'save'|'discard'|'cancel'>;
 save(project:T):Promise<boolean>;
 unchanged(project:T):Promise<boolean>;
 beforeClose?():Promise<void>;
 error(error:unknown):void;
}
/** Electron does not show a browser beforeunload confirmation automatically. */
export function installCloseGuard<T>(win:BrowserWindow,actions:CloseActions<T>):void{
 let approved=false,pending=false;
 win.on('close',event=>{
  if(approved)return;
  event.preventDefault();if(pending)return;pending=true;
  void (async()=>{
   try{
    const state=await actions.snapshot();
    if(state.dirty){
     const choice=await actions.decide();if(choice==='cancel')return;
     if(choice==='save'&&(!await actions.save(state.project)||!await actions.unchanged(state.project)))return;
    }
    await actions.beforeClose?.();
    approved=true;win.close();
   }catch(error){actions.error(error);}finally{pending=false;}
  })();
 });
}
