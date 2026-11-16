const svg = document.getElementById("drawing-area");
const NS = "http://www.w3.org/2000/svg";
const CENTER = 500;
const TEAM_COLORS = {1:"#4da6ff", 2:"#4dff88"};
const objects = [];
let nextId = 1;
let drag = null;
let editingObject = null;
let currentTeam = 1;
let pinch = 0, pinchView = null;
let lastTap = null;

// ---------- 背景・方眼 ----------
svg.style.background = "#ffffff";
for (let k = -2000; k <= 4000; k += 20) {
  const line1 = document.createElementNS(NS, "line");
  line1.setAttribute("x1", 0); line1.setAttribute("y1", k);
  line1.setAttribute("x2", 2000); line1.setAttribute("y2", k - 2000);
  line1.setAttribute("stroke", "#dce2eb"); line1.setAttribute("stroke-width", 1);
  svg.appendChild(line1);

  const line2 = document.createElementNS(NS, "line");
  line2.setAttribute("x1", 0); line2.setAttribute("y1", -k);
  line2.setAttribute("x2", 2000); line2.setAttribute("y2", 2000 - k);
  line2.setAttribute("stroke", "#dce2eb"); line2.setAttribute("stroke-width", 1);
  svg.appendChild(line2);
}

// 色付きエリア（外側）
const redZone = document.createElementNS(NS, "polygon");
redZone.setAttribute("points", "500,220 780,500 500,780 220,500");
redZone.setAttribute("fill", "#ff9999"); redZone.setAttribute("fill-opacity", "0.24");
redZone.setAttribute("stroke", "#e66b75"); redZone.setAttribute("stroke-width", "2");
svg.appendChild(redZone);

// 侵入不可エリア（内側）
const restricted = document.createElementNS(NS, "polygon");
restricted.setAttribute("points", "500,380 620,500 500,620 380,500");
restricted.setAttribute("fill", "#f27c87"); restricted.setAttribute("fill-opacity", "0.30");
restricted.setAttribute("stroke", "#d94f62"); restricted.setAttribute("stroke-width", "2");
svg.appendChild(restricted);

// 角の固定色エリア4個（独立・編集対象外）
const cornerAreas = [
  {x:500,y:380,name:"A",color:"#4da6ff"},
  {x:620,y:500,name:"B",color:"#4dff88"},
  {x:500,y:620,name:"C",color:"#ffcc66"},
  {x:380,y:500,name:"D",color:"#cc99ff"}
];
const cornerLayer = document.createElementNS(NS, "g");
cornerLayer.setAttribute("id", "corner-areas");
cornerAreas.forEach(area => {
  const group = document.createElementNS(NS, "g");
  group.setAttribute("transform", `translate(${area.x},${area.y})`);
  const shape = document.createElementNS(NS, "polygon");
  shape.setAttribute("points", "0,-20 20,0 0,20 -20,0");
  shape.setAttribute("fill", area.color); shape.setAttribute("fill-opacity", "0.95");
  shape.setAttribute("stroke", "#35405a"); shape.setAttribute("stroke-width", "1.5");
  const text = document.createElementNS(NS, "text");
  text.setAttribute("x",0); text.setAttribute("y",0);
  text.setAttribute("text-anchor","middle"); text.setAttribute("dominant-baseline","middle");
  text.setAttribute("font-size",10); text.setAttribute("font-weight","700");
  text.setAttribute("fill","#142033"); text.textContent = area.name;
  group.append(shape,text); cornerLayer.appendChild(group);
});
svg.appendChild(cornerLayer);

// オブジェクトレイヤー（固定エリアより前面）
const objectsLayer = document.createElementNS(NS, "g");
objectsLayer.setAttribute("id", "objects-layer");
svg.appendChild(objectsLayer);

// ---------- 共通関数 ----------
function canPlace(x,y,ignoreObj=null) {
  const u=x+y, v=x-y;
  if (Math.max(Math.abs(u-1000),Math.abs(v)) < 140) return false;
  for (const obj of objects) {
    if (obj===ignoreObj) continue;
    const ou=obj.x+obj.y, ov=obj.x-obj.y;
    if (Math.abs(u-ou)<40 && Math.abs(v-ov)<40) return false;
  }
  return true;
}
function getSVGPoint(event) {
  const p=svg.createSVGPoint(); p.x=event.clientX; p.y=event.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function makeObjectText(name, color="#172033") {
  const text=document.createElementNS(NS,"text");
  text.setAttribute("x",0); text.setAttribute("y",0);
  text.setAttribute("text-anchor","middle");
  text.setAttribute("dominant-baseline","middle");
  text.setAttribute("font-size",8); text.setAttribute("font-weight","700");
  text.setAttribute("fill",color); text.setAttribute("pointer-events","none");
  if (name.length<=4) text.textContent=name;
  else {
    const split=Math.ceil(name.length/2);
    const t1=document.createElementNS(NS,"tspan"), t2=document.createElementNS(NS,"tspan");
    t1.setAttribute("x",0); t1.setAttribute("dy","-0.5em"); t1.textContent=name.slice(0,split);
    t2.setAttribute("x",0); t2.setAttribute("dy","1em"); t2.textContent=name.slice(split);
    text.append(t1,t2);
  }
  return text;
}
function refreshObjectText(obj) {
  const group=document.getElementById("object_"+obj.id);
  if (!group) return;
  const old=group.querySelector("text"); if(old) old.remove();
  group.appendChild(makeObjectText(obj.text));
}
function openEditPopup(obj) {
  editingObject=obj;
  document.getElementById("edit-name").value=obj.text;
  document.getElementById("edit-team").value=String(obj.team);
  document.getElementById("edit-popup").style.display="grid";
  document.getElementById("edit-name").focus({preventScroll:true});
}
function closeEditPopup() {
  document.getElementById("edit-popup").style.display="none";
  editingObject=null;
}
function drawObject(obj) {
  const group=document.createElementNS(NS,"g");
  group.setAttribute("id","object_"+obj.id);
  group.setAttribute("transform",`translate(${obj.x},${obj.y})`);
  group.setAttribute("data-object-id",obj.id);
  const shape=document.createElementNS(NS,"polygon");
  shape.setAttribute("points","0,-20 20,0 0,20 -20,0");
  shape.setAttribute("fill",obj.color); shape.setAttribute("stroke","#253047");
  shape.setAttribute("stroke-width","1.2");
  group.appendChild(shape); group.appendChild(makeObjectText(obj.text));
  group.addEventListener("pointerdown",event=>{
    if(event.pointerType==="touch" && event.isPrimary===false) return;
    event.preventDefault(); event.stopPropagation();
    const point=getSVGPoint(event);
    drag={type:"object",obj,group,startX:obj.x,startY:obj.y,startPoint:point,
      pointerStartX:event.clientX,pointerStartY:event.clientY,moved:false};
    try { svg.setPointerCapture(event.pointerId); } catch(e) {}
  });
  objectsLayer.appendChild(group);
}
function addObject(x=500,y=500,name=String(nextId),team=currentTeam) {
  if(!canPlace(x,y)) return false;
  const obj={id:nextId++,type:"2x2",x,y,text:name,color:TEAM_COLORS[team],team};
  objects.push(obj); drawObject(obj); return true;
}

// ---------- 編集反映 ----------
document.getElementById("edit-name").addEventListener("input",function(){
  if(!editingObject) return;
  editingObject.text=this.value;
  refreshObjectText(editingObject);
});
document.getElementById("edit-team").addEventListener("change",function(){
  if(!editingObject) return;
  editingObject.team=Number(this.value);
  editingObject.color=TEAM_COLORS[editingObject.team];
  const group=document.getElementById("object_"+editingObject.id);
  group.querySelector("polygon").setAttribute("fill",editingObject.color);
});
document.getElementById("edit-close").addEventListener("click",closeEditPopup);

// ---------- パン・ドラッグ ----------
svg.addEventListener("pointerdown",event=>{
  if(event.target.closest('g[id^="object_"]')) return;
  if(event.pointerType==="touch" && !event.isPrimary) return;
  event.preventDefault();
  const v=svg.viewBox.baseVal;
  drag={type:"pan",startX:event.clientX,startY:event.clientY,
    viewX:v.x,viewY:v.y,width:v.width,height:v.height};
  try { svg.setPointerCapture(event.pointerId); } catch(e) {}
});
svg.addEventListener("pointermove",event=>{
  if(!drag) return;
  if(drag.type==="pan"){
    const rect=svg.getBoundingClientRect();
    const x=drag.viewX-(event.clientX-drag.startX)*drag.width/rect.width;
    const y=drag.viewY-(event.clientY-drag.startY)*drag.height/rect.height;
    svg.setAttribute("viewBox",`${x} ${y} ${drag.width} ${drag.height}`);
    return;
  }
  const dist=Math.hypot(event.clientX-drag.pointerStartX,event.clientY-drag.pointerStartY);
  if(dist>5) drag.moved=true;
  const p=getSVGPoint(event);
  drag.obj.x=drag.startX+p.x-drag.startPoint.x;
  drag.obj.y=drag.startY+p.y-drag.startPoint.y;
  drag.group.setAttribute("transform",`translate(${drag.obj.x},${drag.obj.y})`);
});
function finishPointer(event) {
  if(!drag) return;
  if(drag.type==="pan"){drag=null;return;}
  const current=drag;
  if(!current.moved){openEditPopup(current.obj);drag=null;return;}
  let u=current.obj.x+current.obj.y-1000, v=current.obj.x-current.obj.y;
  u=Math.round(u/20)*20; v=Math.round(v/20)*20;
  const x=500+(u+v)/2, y=500+(u-v)/2;
  if(!canPlace(x,y,current.obj)){current.obj.x=current.startX;current.obj.y=current.startY;}
  else {current.obj.x=x;current.obj.y=y;}
  current.group.setAttribute("transform",`translate(${current.obj.x},${current.obj.y})`);
  drag=null;
}
svg.addEventListener("pointerup",finishPointer);
svg.addEventListener("pointercancel",()=>{drag=null;});

// ---------- 生成 ----------
document.getElementById("create-object").addEventListener("click",()=>{
  addObject(500,500,"A",currentTeam);
});
document.getElementById("create-ring").addEventListener("click",()=>{
  // 侵入不可エリアを囲む1周：方眼座標の外周
  const positions=new Map();
  for(let t=-140;t<=140;t+=40){
    [[140,t],[-140,t],[t,140],[t,-140]].forEach(([u,v])=>positions.set(`${u},${v}`,[u,v]));
  }
  positions.forEach(([u,v])=>{
    const x=500+(u+v)/2, y=500+(u-v)/2;
    addObject(x,y,String(nextId),currentTeam);
  });
});

// ---------- チーム設定 ----------
document.getElementById("team-settings").addEventListener("click",()=>{
  document.getElementById("team-popup").style.display="grid";
});
document.getElementById("team-close").addEventListener("click",()=>{
  document.getElementById("team-popup").style.display="none";
});
document.getElementById("select-team-1").addEventListener("click",()=>{
  currentTeam=1; document.getElementById("team-popup").style.display="none";
});
document.getElementById("select-team-2").addEventListener("click",()=>{
  currentTeam=2; document.getElementById("team-popup").style.display="none";
});

// ---------- 全消去 ----------
document.getElementById("clear-objects").addEventListener("click",()=>{
  if(!confirm("生成したオブジェクトをすべて消去しますか？")) return;
  objects.length=0; objectsLayer.replaceChildren(); nextId=1; closeEditPopup();
});

// ---------- PNG生成・保存 ----------
const imageSection=document.getElementById("image-section");
const imagePreview=document.getElementById("image-preview");
const downloadImage=document.getElementById("download-image");
document.getElementById("generate-image").addEventListener("click",()=>{
  const clone=svg.cloneNode(true);
  clone.setAttribute("width",1000); clone.setAttribute("height",1000);
  clone.setAttribute("xmlns",NS);
  const svgText=new XMLSerializer().serializeToString(clone);
  const blob=new Blob([svgText],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const img=new Image();
  img.onload=()=>{
    const canvas=document.createElement("canvas"); canvas.width=1000;canvas.height=1000;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1000,1000);
    ctx.drawImage(img,0,0,1000,1000);
    const png=canvas.toDataURL("image/png");
    imagePreview.src=png; downloadImage.href=png;
    imageSection.style.display="grid";
    URL.revokeObjectURL(url);
  };
  img.onerror=()=>{alert("画像生成に失敗しました。");URL.revokeObjectURL(url);};
  img.src=url;
});
document.getElementById("close-image").addEventListener("click",()=>imageSection.style.display="none");

// ---------- 座標一覧：リング順＋時計回り ----------
function ringOrder(obj) {
  const u=obj.x+obj.y-1000, v=obj.x-obj.y;
  return Math.max(Math.abs(u),Math.abs(v));
}
function clockwiseAngle(obj) {
  // SVG座標は下向きy。上を0、右→下→左を時計回りに進む角度
  return (Math.atan2(obj.x-500,500-obj.y)+Math.PI*2)%(Math.PI*2);
}
function makeCoordinateText() {
  let result="";
  for(const team of [1,2]){
    result+=team===1?"【チームA】\\n":"【チームB】\\n";
    const list=objects.filter(o=>o.team===team).slice().sort((a,b)=>{
      const ra=ringOrder(a), rb=ringOrder(b);
      if(ra!==rb) return ra-rb;
      const aa=clockwiseAngle(a), ab=clockwiseAngle(b);
      return aa-ab || a.id-b.id;
    });
    let lastRing=null, round=0;
    for(const obj of list){
      const ring=ringOrder(obj);
      if(ring!==lastRing){round++;result+=`-- ${round}周目 --\\n`;lastRing=ring;}
      result+=`${obj.text}: (${Math.round(obj.x)}, ${Math.round(obj.y)})\\n`;
    }
    if(list.length===0) result+="（オブジェクトなし）\\n";
    result+="\\n";
  }
  return result;
}
const coordinateOutput=document.getElementById("coordinate-output");
const coordinateText=document.getElementById("coordinate-text");
document.getElementById("export-coordinates").addEventListener("click",()=>{
  coordinateText.value=makeCoordinateText();
  coordinateOutput.style.display="grid";
  document.getElementById("copy-status").textContent="";
});
document.getElementById("copy-coordinates").addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText(coordinateText.value);
    document.getElementById("copy-status").textContent="コピーしました。";
  }catch(e){
    coordinateText.focus();coordinateText.select();coordinateText.setSelectionRange(0,coordinateText.value.length);
    document.getElementById("copy-status").textContent="選択しました。長押ししてコピーしてください。";
  }
});
document.getElementById("close-coordinates").addEventListener("click",()=>coordinateOutput.style.display="none");

// ---------- 2本指ピンチズーム ----------
function touchDistance(a,b){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
svg.addEventListener("touchstart",e=>{
  if(e.touches.length===2){
    drag=null;pinch=touchDistance(e.touches[0],e.touches[1]);
    const v=svg.viewBox.baseVal,r=svg.getBoundingClientRect();
    const cx=(e.touches[0].clientX+e.touches[1].clientX)/2;
    const cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
    pinchView={x:v.x,y:v.y,w:v.width,h:v.height,px:cx-r.left,py:cy-r.top,rw:r.width,rh:r.height};
  }
},{passive:false});
svg.addEventListener("touchmove",e=>{
  if(e.touches.length!==2||!pinch||!pinchView)return;
  e.preventDefault();
  const scale=pinch/touchDistance(e.touches[0],e.touches[1]);
  const w=Math.max(100,Math.min(2000,pinchView.w*scale)),h=w;
  const x=pinchView.x+pinchView.px/pinchView.rw*pinchView.w-pinchView.px/pinchView.rw*w;
  const y=pinchView.y+pinchView.py/pinchView.rh*pinchView.h-pinchView.py/pinchView.rh*h;
  svg.setAttribute("viewBox",`${x} ${y} ${w} ${h}`);
},{passive:false});
svg.addEventListener("touchend",e=>{
  if(e.touches.length<2){pinch=0;pinchView=null;
    const v=svg.viewBox.baseVal;
    if(Math.abs(v.width-1000)<1)svg.setAttribute("viewBox","0 0 1000 1000");
  }
});

// 初期状態の表示
document.getElementById("edit-popup").style.display="none";
document.getElementById("team-popup").style.display="none";
