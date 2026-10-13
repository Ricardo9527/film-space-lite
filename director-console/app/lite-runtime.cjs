const os=require('node:os'),path=require('node:path');
function litePaths(){
 const root=process.env.FILM_SPACE_LITE_DATA_DIR || (process.platform==='win32'?path.join(process.env.LOCALAPPDATA,'Film Space Lite'):path.join(os.homedir(),'Library','Application Support','Film Space Lite'));
 return {root,projects:path.join(root,'Projects'),service:path.join(root,'director-service.json'),log:path.join(root,'Logs','director-console.log')};
}
module.exports={litePaths};
