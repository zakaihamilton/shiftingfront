import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Export generated atlases into individually registered, calibrated runtime assets.
// Usage: node scripts/assets/export-unit-animation-atlases.mjs tank.png behemoth.png infantry.png antiArmor.png medic.png backLeft.png [infantryFrontLeftFire.png antiArmorFrontLeftFire.png antiArmorFrontFire.png]
const inputs = process.argv.slice(2);
if (![6, 9].includes(inputs.length)) throw new Error("Expected six atlas paths and optionally three firing sheets");
const views = ["right", "front-right", "front", "front-left", "left", "back-left", "back", "back-right"];
const root = "public/art/sprites/sleek-modular/animations";
await mkdir(root, { recursive: true });
const manifest = { poses: {}, vehicles: {} };

async function source(path) {
  const { data, info } = await sharp(resolve(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, path };
}
function bands(s, axis, start = 0, end = axis === "y" ? s.width : s.height) {
  const length = axis === "y" ? s.height : s.width;
  const runs = []; let first = -1, last = -1;
  for (let a = 0; a < length; a++) {
    let n = 0;
    for (let b = start; b < end; b++) {
      const x = axis === "y" ? b : a, y = axis === "y" ? a : b;
      if (s.data[(y * s.width + x) * 4 + 3] >= 24) n++;
    }
    if (n > (axis === "y" ? 8 : 1)) { if (first < 0) first = a; last = a; }
    else if (first >= 0 && a - last > 3) { if (last - first > 10) runs.push([first, last + 1]); first = -1; }
  }
  if (first >= 0) runs.push([first, last + 1]);
  return runs;
}
function bounds(s, x0, y0, x1, y1) {
  let minX=x1, minY=y1, maxX=x0, maxY=y0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) if(s.data[(y*s.width+x)*4+3]>=12){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return { left:minX, top:minY, width:maxX-minX+1, height:maxY-minY+1 };
}
async function normalized(s, b, scale, anchor, destination, name, size=512) {
  const w=Math.round(b.width*scale), h=Math.round(b.height*scale);
  const image=await sharp(s.path).extract(b).resize(w,h).toBuffer();
  const left=Math.round(destination[0]-(anchor[0]-b.left)*scale);
  const top=Math.round(destination[1]-(anchor[1]-b.top)*scale);
  if(left<0||top<0||left+w>size||top+h>size) throw new Error(`${name}: part exceeds calibrated canvas (${left},${top},${w},${h})`);
  const file=`${root}/${name}-v1.webp`;
  await sharp({create:{width:size,height:size,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:image,left,top}]).webp({quality:88,alphaQuality:100}).toFile(file);
  return { source:"/"+file.replace(/^public\//,""), left,top,w,h };
}

for(let index=0;index<2;index++) {
  const kind=index===0?"tank":"behemoth"; const s=await source(inputs[index]);
  const edges=index===0?[0,206,376,590,797,941,s.height]:[0,360,620,900,1160,1340,s.height];
  const parts={hull:[],turret:[],barrel:[]};
  for(let row=0;row<6;row++) {
    const columns=bands(s,"x",edges[row],edges[row+1]);
    if(columns.length!==4) throw new Error(`${kind} row${row}: expected four parts, got ${columns.length}`);
    for(let col=0;col<4;col++) parts[["hull","turret","barrel"][Math.floor(row/2)]].push(bounds(s,columns[col][0],edges[row],columns[col][1],edges[row+1]));
  }
  const scale=420/Math.max(...parts.hull.map(b=>b.width));
  const out={};
  for(let v=0;v<8;v++) {
    const hull=parts.hull[v], turret=parts.turret[v], barrel=parts.barrel[v];
    const hullMid=hull.left+hull.width/2;
    const hullImage=await normalized(s,hull,scale,[hullMid,hull.top+hull.height],[256,475],`${kind}-${views[v]}-hull`);
    const mount=[256,475-hull.height*scale*(v===2||v===6?0.72:0.77)];
    const ts=scale*0.68;
    const turretImage=await normalized(s,turret,ts,[turret.left+turret.width/2,turret.top+turret.height],[256,300],`${kind}-${views[v]}-turret`);
    const frontFractions=[[0.95,0.72],[0.88,0.82],[0.5,0.87],[0.12,0.82],[0.05,0.72],[0.18,0.57],[0.5,0.48],[0.82,0.57]][v];
    const socket=[turretImage.left+turretImage.w*frontFractions[0],turretImage.top+turretImage.h*frontFractions[1]];
    const rearFractions=[[0.15,0.5],[0.18,0.23],[0.5,0.18],[0.82,0.23],[0.85,0.5],[0.8,0.78],[0.5,0.82],[0.2,0.78]][v];
    const bs=scale*0.54;
    const barrelImage=await normalized(s,barrel,bs,[barrel.left+barrel.width*rearFractions[0],barrel.top+barrel.height*rearFractions[1]],[256,256],`${kind}-${views[v]}-barrel`);
    const muzzleFractions=[[0.98,0.5],[0.9,0.88],[0.5,0.98],[0.1,0.88],[0.02,0.5],[0.08,0.12],[0.5,0.02],[0.92,0.12]][v];
    out[views[v]]={hull:hullImage.source,turret:turretImage.source,barrel:barrelImage.source,mount,socket,muzzle:[barrelImage.left+barrelImage.w*muzzleFractions[0],barrelImage.top+barrelImage.h*muzzleFractions[1]]};
  }
  manifest.vehicles[kind]=out;
}

const extra=await source(inputs[5]);
const extraRows=[[0,Math.round(extra.height*0.28)],[Math.round(extra.height*0.28),Math.round(extra.height*0.52)],[Math.round(extra.height*0.52),Math.round(extra.height*0.7825)],[Math.round(extra.height*0.7825),extra.height]];
for(let k=0;k<3;k++) {
  const kind=["infantry","antiArmor","medic"][k], s=await source(inputs[k+2]);
  const rows=bands(s,"y");
  if(rows.length!==(kind==="medic"?8:7))throw new Error(`${kind}: incorrect row count ${rows.length}`);
  const cells=[];
  for(let v=0;v<8;v++) {
    const added=kind!=="medic"&&v===5;
    const image=added?extra:s;
    const row=added?extraRows[k*2]:rows[kind==="medic"||v<5?v:v-1];
    const cols=bands(image,"x",row[0],row[1]);
    if(cols.length!==(added?4:8)) throw new Error(`${kind} ${views[v]}: incorrect column count ${cols.length}`);
    for(let mode=0;mode<2;mode++) {
      const action=mode===0?"idle":kind==="medic"?"treat":"fire";
      let chosenRow=row, chosenCols=cols;
      if(added&&mode===1){chosenRow=extraRows[k*2+1];chosenCols=bands(extra,"x",chosenRow[0],chosenRow[1]);}
      for(let f=0;f<4;f++) {
        const col=chosenCols[f+(added?0:mode*4)];
        cells.push({view:views[v],action,frame:f,s:image,b:bounds(image,col[0],chosenRow[0],col[1],chosenRow[1])});
      }
    }
  }
  const byPose={};
  for(const action of ["idle",kind==="medic"?"treat":"fire"]) {
    byPose[action]={};
    for(const view of views) {
      const viewCells=cells.filter(c=>c.view===view);
      let scale=456/Math.max(...viewCells.map(c=>c.b.height));
      for(const c of viewCells){
        const feet=bounds(c.s,c.b.left,c.b.top+Math.floor(c.b.height*0.88),c.b.left+c.b.width,c.b.top+c.b.height);
        const center=feet.left+feet.width/2;
        scale=Math.min(scale,246/Math.max(center-c.b.left,c.b.left+c.b.width-center));
      }
      const selected=cells.filter(c=>c.action===action&&c.view===view);
      const composites=[];
      for(const c of selected) {
        // Measure the planted feet, not an outstretched weapon, for the horizontal anchor.
        const feet=bounds(c.s,c.b.left,c.b.top+Math.floor(c.b.height*0.88),c.b.left+c.b.width,c.b.top+c.b.height);
        const file=await normalized(c.s,c.b,scale,[feet.left+feet.width/2,c.b.top+c.b.height],[256,500],`${kind}-${view}-${action}-${c.frame}`);
        composites.push({input:await sharp("public"+file.source).toBuffer(),left:(c.frame%2)*512,top:Math.floor(c.frame/2)*512});
      }
      const path=`${root}/${kind}-${view}-${action}-v1.webp`;
      await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).webp({quality:88,alphaQuality:100}).toFile(path);
      byPose[action][view]="/"+path.replace(/^public\//,"");
    }
  }
  manifest.poses[kind]=byPose;
}
if(inputs[6]) {
  for(const [row,[kind,view]] of [["infantry","front-left"],["antiArmor","front-left"],["antiArmor","front"]].entries()) {
    const correction=await source(inputs[6+row]);
    const cells=Array.from({length:4},(_,f)=>bounds(correction,
      Math.floor(f%2*correction.width/2),Math.floor(Math.floor(f/2)*correction.height/2),
      Math.floor((f%2+1)*correction.width/2),Math.floor((Math.floor(f/2)+1)*correction.height/2)));
    const {data,info}=await sharp("public"+manifest.poses[kind].idle[view]).extract({left:0,top:0,width:512,height:512}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const idle={data,width:info.width,height:info.height};
    const idleBounds=bounds(idle,0,0,512,512);
    let scale=idleBounds.height/Math.max(...cells.map(b=>b.height));
    for(const b of cells){const feet=bounds(correction,b.left,b.top+Math.floor(b.height*0.88),b.left+b.width,b.top+b.height);const center=feet.left+feet.width/2;scale=Math.min(scale,246/Math.max(center-b.left,b.left+b.width-center));}
    const frames=[];
    for(let f=0;f<4;f++){
      const b=cells[f],feet=bounds(correction,b.left,b.top+Math.floor(b.height*0.88),b.left+b.width,b.top+b.height);
      const part=await normalized(correction,b,scale,[feet.left+feet.width/2,b.top+b.height],[256,500],`${kind}-${view}-fire-${f}`);
      frames.push({input:await sharp("public"+part.source).toBuffer(),left:f%2*512,top:Math.floor(f/2)*512});
    }
    await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).webp({quality:88,alphaQuality:100}).toFile("public"+manifest.poses[kind].fire[view]);
  }
}
// Individual temporary frames are retained only during export, never shipped.
const {readdir,unlink}=await import("node:fs/promises");
for(const file of await readdir(root))if(/-(idle|fire|treat)-[0-3]-v1\.webp$/.test(file))await unlink(`${root}/${file}`);
await writeFile("lib/gen/unitAnimationManifest.json",JSON.stringify(manifest,null,2)+"\n");
console.log("Exported calibrated unit animation assets and manifest");
