import { spawn } from 'node:child_process';
// Windows DPAPI, current user only. Secrets travel over stdin/stdout pipes, never argv/logs.
export function protect(value, decrypt=false) {
  if(process.platform!=='win32')throw new Error('WINDOWS_REQUIRED');
  const script=decrypt
    ? '$s=[Console]::In.ReadToEnd() | ConvertTo-SecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}'
    : '$s=ConvertTo-SecureString -String ([Console]::In.ReadToEnd()) -AsPlainText -Force; [Console]::Out.Write(($s | ConvertFrom-SecureString))';
  return new Promise((resolve,reject)=>{
    const failure=error=>new Error(['EPERM','EACCES'].includes(error?.code)?'CREDENTIAL_SPAWN_DENIED':'CREDENTIAL_OS');
    let child;
    try {child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch(error){reject(failure(error));return;}
    let output='',size=0;
    const timer=setTimeout(()=>{child.kill();reject(new Error('CREDENTIAL_TIMEOUT'));},15000);
    child.on('error',error=>{clearTimeout(timer);reject(failure(error));});
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>32768){child.kill();reject(new Error('CREDENTIAL_SIZE'));}else output+=chunk.toString('utf8');});
    child.stderr.resume();
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(output.trim());else reject(new Error('CREDENTIAL_OS'));});
    child.stdin.on('error',()=>{});child.stdin.end(value);
  });
}
export function validateConnection(value) {
  if(!value||value.version!==1||typeof value.endpoint!=='string'||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/workout-obsidian-export$/.test(value.endpoint)||typeof value.token!=='string'||!/^[a-f0-9]{64}$/.test(value.token))throw new Error('CONNECTION_INVALID');
  return {version:1,endpoint:value.endpoint,token:value.token};
}
