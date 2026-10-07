import {request} from './api.js';
export async function saveExport(blob,filename) {
  if(window.HybridWebView){
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Unable to prepare the export.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);});
    return request('/api/desktop/export',{method:'POST',body:JSON.stringify({filename,base64})});
  }
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  return {saved:true};
}
