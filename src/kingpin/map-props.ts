// Resolve static props only from explicit map references or unambiguous asset names.
import { parseEntities } from "../formats/entities.ts";
import { Diagnostics } from "../formats/diagnostics.ts";
import { View } from "../formats/binary.ts";
import type { VirtualFileSystem } from "../vfs/vfs.ts";

const safe = (p: string) => /^models\/[a-z0-9_./-]+\.(mdx|md2)$/i.test(p) && !p.split("/").some(x=>x===".."||x==="."||!x);
const normalize=(p:string)=>p.toLowerCase().replaceAll("\\","/");
const key=(p:string)=>p.toLowerCase().replace(/[^a-z0-9]/g,"");
// Deliberately exclude spawners, characters, cutscenes, triggers and brush entities.
const decorative = /^(?:props_(?:trashcorner|trashbottle_vert|trashwall|trashbottle|trashpaper|phone|radio|trashcanA|fan|chair|roof_vent|tv|shelf|cig_machine|hydrant|extinguisherA|extinguisherB|cola_machine|antenna\w*|mattressC|motorcycle)|props2_(?:gargoyle|flag|ashtray|plant_XL|plant_fern|pinball_machine|vaseA|vaseB)|props3_(?:decanter|whiskey_glass|deco_fixture))$/i;
export function resolvePropModel(classname:string, explicit:string|undefined, models:readonly string[]):string|undefined {
  if(!decorative.test(classname))return;
  if(explicit) {
    const p=normalize(explicit);
    return safe(p)&&models.includes(p)?p:undefined;
  }
  const name=key(classname.replace(/^props[23]?_/i,""));
  const matches=models.filter(p=>{
    if(!safe(p))return false;
    const parts=p.split("/");
    const filename=parts.at(-1)!.replace(/\.(mdx|md2)$/,"");
    return key(filename)===name || (/^(?:tris|model)$/i.test(filename)&&key(parts.at(-2)??"")===name);
  });
  return matches.length===1?matches[0]:undefined;
}
export interface PropResult { bytes:Uint8Array; placed:number; unresolved:Record<string,number>; models:string[] }
/** Append a replacement entity lump; all original geometry offsets and contents remain unchanged. */
export function populateMapProps(bytes:Uint8Array,vfs:VirtualFileSystem):PropResult {
  const unchanged:PropResult={bytes,placed:0,unresolved:{},models:[]};
  const view=new View(bytes);
  if(bytes.length<160||view.cstring(0,4).text!=="IBSP"||view.i32(4)!==38)return unchanged;
  const offset=view.i32(8),size=view.i32(12);
  if(!view.has(offset,size)||offset<160||size>4*1024*1024)return unchanged;
  const diag=new Diagnostics();
  const entities=parseEntities(view.cstring(offset,size).text,diag);
  if(diag.list().some(d=>d.severity!=="info"))return unchanged;
  const models=vfs.list().map(f=>normalize(f.path)).filter(safe);
  const used=new Set<string>();
  const unresolved:Record<string,number>={};
  let placed=0;
  for(const e of entities){
    const name=e.get("classname")??"";
    if(!decorative.test(name)||e.has("targetname")||e.has("target")||e.has("killtarget"))continue;
    const path=resolvePropModel(name,e.get("model"),models);
    if(!path){unresolved[name]=(unresolved[name]??0)+1;continue;}
    // Avoid exceeding the upstream protocol's model-index budget.
    if(!used.has(path)&&used.size>=48){unresolved[name]=(unresolved[name]??0)+1;continue;}
    used.add(path);
    e.set("classname","kpweb_static_model");
    e.set("model",path);
    placed++;
  }
  if(!placed)return {...unchanged,unresolved};
  const text=entities.map(e=>"{\n"+[...e].map(([k,v])=>`"${k}" "${v}"`).join("\n")+"\n}").join("\n")+"\n\0";
  // Preserve original entity byte encoding (Quake entity text is Latin-1).
  const data=Uint8Array.from(text,c=>c.charCodeAt(0));
  const out=new Uint8Array(bytes.length+data.length);
  out.set(bytes);out.set(data,bytes.length);
  const header=new DataView(out.buffer);
  header.setInt32(8,bytes.length,true);header.setInt32(12,data.length,true);
  return {bytes:out,placed,unresolved,models:[...used]};
}

/** Single-entry PACK archive generated locally for the selected map override. */
export function buildPropPak(path:string,bytes:Uint8Array):Uint8Array {
  if(!/^maps\/[a-z0-9_-]+\.bsp$/.test(path)||path.length>=56)throw new Error("Invalid map path");
  const dir=12+bytes.length;
  const out=new Uint8Array(dir+64);
  const view=new DataView(out.buffer);
  out.set([80,65,67,75]);view.setInt32(4,dir,true);view.setInt32(8,64,true);
  out.set(bytes,12);out.set(new TextEncoder().encode(path),dir);
  view.setInt32(dir+56,12,true);view.setInt32(dir+60,bytes.length,true);
  return out;
}
