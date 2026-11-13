const MAX_AGE=24*60*60*1000;
async function database(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('capturesok',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('results');
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function transaction(mode,operation){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('results',mode);let value;
    operation(tx.objectStore('results'),v=>value=v);
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('storageFailed'));
  });}finally{db.close();}
}
export async function saveResult(record){
  return transaction('readwrite',store=>{
    const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(!c.value.created||Date.now()-c.value.created>MAX_AGE)c.delete();c.continue();}};
    store.put(record,record.id);
  });
}
export async function readResult(id){
  return transaction('readwrite',(store,set)=>{const r=store.get(id);r.onsuccess=()=>{
    const value=r.result;if(value&&Date.now()-value.created<=MAX_AGE)set(value);else store.delete(id);
  };});
}
export async function removeResult(id){return transaction('readwrite',store=>store.delete(id));}
export async function clearResults(){return transaction('readwrite',store=>store.clear());}
