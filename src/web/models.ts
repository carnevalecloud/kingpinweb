import { blobSource } from "../formats/binary.ts";
import { inspectModel, type ModelDetails } from "../formats/alias-model.ts";
import { Diagnostics } from "../formats/diagnostics.ts";
import { mountGameFiles, type VirtualFileSystem } from "../vfs/vfs.ts";
import { ENGINE_GAME_DIR, planGameFiles } from "../kingpin/game-files.ts";
import { buildRoomBsp, syntheticGameFiles } from "../kingpin/preview-scene.ts";
import { loadGame, type StoredFile } from "./game-store.ts";
import { startEngine } from "./engine-host.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
type PreviewFile = { target: string; file: { data: Uint8Array } };
const safePath = (path: string) => /^[a-z0-9_./-]+$/i.test(path) && !path.startsWith("/") && !path.split("/").some(p => !p || p === "." || p === "..");
const normalized = (path: string) => path.replaceAll("\\", "/").toLowerCase();
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

if (new URLSearchParams(location.search).has("runtime")) {
  $("browser").hidden = true;
  $("runtime").hidden = false;
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.kind !== "kp-preview") return;
    const files = event.data.files as PreviewFile[];
    const log = (line: string) => { const out = $("log"); out.textContent = (out.textContent + line + "\n").slice(-30000); };
    try { startEngine({ canvas: $<HTMLCanvasElement>("canvas"), flavour:"kingpin", files, args:["+set","vid_renderer","gles3","+map","kpweb_room"], log }); }
    catch (error) { log(errorText(error)); }
  });
} else {
  const status = $("status"), list = $<HTMLSelectElement>("models"), skin = $<HTMLSelectElement>("skin");
  const filter = $<HTMLInputElement>("filter"), preview = $<HTMLButtonElement>("preview");
  let vfs: VirtualFileSystem | undefined, paths: string[] = [], chosen = "", details: ModelDetails | null = null, generation = 0, inspected = 0;
  const resetPreview = () => { $("preview-host").replaceChildren(); preview.disabled = true; skin.disabled = true; details = null; };
  const refresh = () => {
    const query = filter.value.toLowerCase();
    list.replaceChildren(...paths.filter(path => path.includes(query)).map(path => new Option(path, path, false, path === chosen)));
  };
  async function mount(files: StoredFile[]) {
    const ticket = ++generation;
    ++inspected; resetPreview(); chosen = ""; paths = []; refresh();
    status.textContent = "Reading local archive directories…";
    const diag = new Diagnostics();
    const mounted = await mountGameFiles(files.map(f => ({path:f.target.slice(ENGINE_GAME_DIR.length+1),source:blobSource(f.blob)})), diag);
    if (ticket !== generation) return;
    vfs = mounted;
    paths = mounted.list().map(f=>normalized(f.path)).filter(p=>safePath(p) && /\.(mdx|md2)$/.test(p));
    refresh(); status.textContent = `Found ${paths.length} models. Select one to inspect.`;
  }
  async function select() {
    const ticket = ++inspected;
    resetPreview(); chosen = list.value;
    $("name").textContent = chosen || "Select a model"; $("metadata").textContent = "";
    const file = vfs?.find(chosen);
    if (!file) return;
    try {
      if (file.source.size > 64*1024*1024) throw new Error("Model exceeds preview size limit.");
      const diag = new Diagnostics();
      const result = inspectModel(await file.source.read(0,file.source.size), chosen.endsWith(".mdx")?"mdx":"md2", diag);
      if (ticket !== inspected) return;
      details = result;
      $("metadata").textContent = result ? `Vertices: ${result.header.numVertices}\nTriangles: ${result.header.numTriangles}\nFrames: ${result.frames.length}\nSub-objects: ${result.subObjects.length}\nFrame zero: ${result.frames[0] ?? "none"}\nSource: ${file.mount}\n` + diag.list().map(d=>d.message).join("\n") : diag.list().map(d=>d.message).join("\n");
      if (!result || diag.list().some(d=>d.severity==="error")) return;
      skin.replaceChildren(...result.skins.map((p,i)=>new Option(`${i}: ${p} (${vfs?.find(normalized(p)) ? "found" : "missing"})`,String(i))));
      skin.disabled = !result.skins.length;
      preview.disabled = false;
    } catch(error) { if(ticket===inspected) $("metadata").textContent=errorText(error); }
  }
  filter.addEventListener("input",refresh);
  list.addEventListener("change",()=>void select());
  $<HTMLInputElement>("folder").addEventListener("change",async event=>{
    const input=event.currentTarget as HTMLInputElement;
    try { const plan=planGameFiles([...input.files??[]].map(file=>({path:file.webkitRelativePath||file.name,file}))); await mount(plan.files.map(f=>({target:f.target,blob:f.file.file}))); }
    catch(error) {status.textContent=errorText(error);}
  });
  preview.addEventListener("click",async()=>{
    const ticket=inspected, path=chosen, model=details, fs=vfs;
    if(!model||!fs) return;
    preview.disabled=true;
    try {
      const files: PreviewFile[]=[];
      const add=(name:string,data:Uint8Array)=>files.push({target:`${ENGINE_GAME_DIR}/${name}`,file:{data}});
      // Original generated room with a single static model. Never persist model payloads.
      const entity=`{ "classname" "kpweb_static_model" "model" "${path}" "origin" "128 0 48" "skin" "${Number(skin.value)||0}" }`;
      for(const f of syntheticGameFiles()) add(f.name,f.name.endsWith(".bsp")?buildRoomBsp({extraEntities:entity}):f.data);
      const modelFile=fs.find(path)!;
      add(path,await modelFile.source.read(0,modelFile.source.size));
      const names=new Set<string>();
      for(const raw of model.skins) {
        const p=normalized(raw);
        if(!safePath(p)) continue;
        for(const candidate of [p,p.replace(/\.[^.]+$/,".tga"),p.replace(/\.[^.]+$/,".pcx"),p.replace(/\.[^.]+$/,".png"),p.replace(/\.[^.]+$/,".jpg")]) {
          if(names.has(candidate)) continue;
          const f=fs.find(candidate);
          if(f&&f.source.size<=32*1024*1024){add(candidate,await f.source.read(0,f.source.size));names.add(candidate);}
        }
      }
      if(ticket!==inspected)return;
      const frame=document.createElement("iframe");
      frame.title="Native model preview";
      frame.addEventListener("load",()=>frame.contentWindow?.postMessage({kind:"kp-preview",files},location.origin),{once:true});
      frame.src="./models.html?runtime=1";
      $("preview-host").replaceChildren(frame);
    } catch(error){if(ticket===inspected)status.textContent=errorText(error);}
    finally{if(ticket===inspected)preview.disabled=false;}
  });
  const initial=generation;
  void loadGame().then(game=>{if(initial!==generation)return;if(game)return mount(game.files);status.textContent="Choose your Kingpin folder, or remember it on the walkthrough page.";}).catch(error=>{if(initial===generation)status.textContent=errorText(error);});
}
