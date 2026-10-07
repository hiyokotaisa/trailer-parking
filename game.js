(function () {
  'use strict';
  const P=window.TrailerPhysics, $=id=>document.getElementById(id);
  const canvas=$('game-canvas'), ctx=canvas.getContext('2d');
  const W=1280,H=800, STEP=1/120;
  const keys=new Set(), dialogs=[$('help-dialog'),$('result-dialog')];
  let courseIndex=0, modelId='box', vehicle=P.createVehicle(P.courses[0].spawn), gear=1, phase='idle', elapsed=0, penalties=0, impacts=0, parkHold=0;
  let collisionFlash=0, contact=null, warningCooldown=0, previous=performance.now(), accumulator=0, toastTimeout, helpWasRunning=false, lastUi=0;
  let bests={};
  try {
    const stored=JSON.parse(localStorage.getItem('trailer-park-bests-v2')||'{}'),legacy=JSON.parse(localStorage.getItem('trailer-park-bests-v1')||'{}');
    for(const v of P.VEHICLES)for(const c of P.courses){const key=`${v.id}:${c.id}`,value=stored?.[key]??(v.id==='box'?legacy?.[c.id]:undefined);if(Number.isFinite(value)&&value>0)bests[key]=value;}
  } catch { /* Storage is optional, including in private browsing. */ }
  const course=()=>P.courses[courseIndex];
  const activeGoal=()=>P.goalFor(course(),modelId),bestKey=()=>`${modelId}:${course().id}`;
  const mono='"SFMono-Regular", Consolas, monospace';
  const format=t=>{const n=Math.max(0,Math.floor(t*100+0.00001));return `${String(Math.floor(n/6000)).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;};
  function toast(message,warning=false){$('toast').textContent=message;$('toast').classList.toggle('warning',warning);$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  const minis=[
    '<path d="M8 6h27v16H8zM53 6h22v16H53z" fill="#626e68"/><path d="M7 38h48M41 38l16-11h17" fill="none" stroke="#75866e" stroke-dasharray="3 3"/><rect x="61" y="27" width="16" height="8" fill="none" stroke="#d3ee98"/>',
    '<path d="M5 43h31V25h24V8h16" fill="none" stroke="#687b64" stroke-width="12" stroke-linejoin="round"/><path d="M5 43h31V25h24V8h16" fill="none" stroke="#afc095" stroke-dasharray="3 4"/><rect x="66" y="4" width="14" height="8" fill="none" stroke="#d3ee98"/>',
    '<path d="M35 3h45v9H35z" fill="#657169"/><path d="M40 16v14M50 16v14M70 16v14" stroke="#929b84" stroke-width="5"/><rect x="57" y="15" width="7" height="16" fill="none" stroke="#d3ee98"/><path d="M5 43h63V32" fill="none" stroke="#88987a" stroke-dasharray="3 4"/>',
    '<path d="M3 3h42v28H3zM59 28h22v22H59z" fill="#657169"/><path d="M5 44h47V21l9-8h17" fill="none" stroke="#9aae88" stroke-dasharray="3 3"/><rect x="66" y="8" width="14" height="8" fill="none" stroke="#d3ee98"/>'
  ];
  function renderVehicles(){
    $('vehicle-list').innerHTML=P.VEHICLES.map(v=>`<button class="vehicle-card ${v.id===modelId?'active':''}" data-vehicle="${v.id}" aria-pressed="${v.id===modelId}"><span>${v.name}</span><small>${v.lengthMetres.toFixed(1)} m <i>/</i> ${v.massTonnes} t</small></button>`).join('');
    $('vehicle-list').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>selectVehicle(b.dataset.vehicle)));
    $('vehicle-note').textContent=modelId==='tanker'?'長い車体と強い惰性。早めのブレーキを。':'標準の加速とブレーキ。基本操作の練習に。';
  }
  function selectVehicle(id){
    if(!P.VEHICLES.some(v=>v.id===id))throw new Error('Unknown vehicle');
    if(id===modelId)return;modelId=id;reset();renderVehicles();renderCourses();
  }
  function renderCourses(){
    $('course-count').textContent=`${P.courses.length} COURSES`;
    $('course-list').innerHTML=P.courses.map((c,i)=>{const best=bests[`${modelId}:${c.id}`];return `<button class="course-card ${i===courseIndex?'active':''}" data-course="${i}" aria-pressed="${i===courseIndex}"><div class="course-card-top"><span>COURSE 0${i+1}</span><span class="difficulty" aria-label="難易度 ${c.difficulty}">${[1,2,3].map(n=>`<i class="${n<=c.difficulty?'filled':''}">▰</i>`).join('')}</span></div><div class="course-card-body"><div><h3>${c.name}</h3><p>${c.description}</p></div><svg class="course-mini" viewBox="0 0 84 52" aria-hidden="true">${minis[i]}</svg></div><div class="course-card-footer"><span>${modelId==='tanker'?'TANKER':'STANDARD'} BEST</span><strong>${best?format(best):'—'}</strong></div></button>`;}).join('');
    $('course-list').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>selectCourse(Number(b.dataset.course))));
  }
  function selectCourse(index){
    if(!Number.isInteger(index)||index<0||index>=P.courses.length)throw new Error('Unknown course');
    courseIndex=index; reset(); renderCourses();
    $('course-number').textContent=`0${index+1}`;$('course-title').textContent=course().name;$('course-subtitle').textContent=course().subtitle;
    rebuildMap(); updateUi();
  }
  function reset(){
    keys.clear();vehicle=P.createVehicle(course().spawn,modelId);gear=1;phase='idle';elapsed=0;penalties=0;impacts=0;parkHold=0;collisionFlash=0;contact=null;warningCooldown=0;accumulator=0;
    $('start-panel').hidden=false;$('pause-overlay').hidden=true;$('park-progress').hidden=true;$('toast').classList.remove('show');
    dialogs.forEach(d=>{if(d.open)d.close();});helpWasRunning=false;updateUi();draw();
  }
  function start(){if(phase!=='idle')return;phase='ready';$('start-panel').hidden=true;canvas.focus({preventScroll:true});updateUi();}
  function pause(){if(phase!=='running'&&phase!=='ready')return;phase='paused';keys.clear();$('pause-overlay').hidden=false;updateUi();}
  function resume(){if(phase!=='paused')return;phase=elapsed>0?'running':'ready';$('pause-overlay').hidden=true;keys.clear();canvas.focus({preventScroll:true});updateUi();}
  function setGear(value){
    if(![1,-1].includes(value))throw new Error('Invalid gear');
    if(phase==='finished')return;
    if(Math.abs(vehicle.speed)>2){toast('ブレーキで停止してからギアを切り替えてください',true);return;}
    vehicle.speed=0;gear=value;updateUi();
  }
  function finish(){
    phase='finished';vehicle.speed=0;keys.clear();$('park-progress').hidden=true;
    const total=elapsed+penalties,key=bestKey(),isBest=!bests[key]||total<bests[key];
    if(isBest){bests[key]=total;try{localStorage.setItem('trailer-park-bests-v2',JSON.stringify(bests));}catch{toast('このブラウザでは記録を保存できません');}renderCourses();}
    $('result-course').textContent=`COURSE 0${courseIndex+1} · ${course().name} · ${P.getVehicle(vehicle).name}`;$('result-time').textContent=format(total);$('result-driving').textContent=format(elapsed);$('result-penalty').textContent=`+${penalties.toFixed(0)}秒（${impacts}回）`;$('new-record').hidden=!isBest;
    $('next-course').textContent=courseIndex===P.courses.length-1?'最初のコースへ':'次のコース';$('result-dialog').showModal();updateUi();
  }
  function controls(){return {steer:(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),throttle:keys.has('ArrowUp')||keys.has('KeyW'),brake:keys.has('ArrowDown')||keys.has('KeyS')||keys.has('Space'),gear};}
  function tick(dt){
    collisionFlash=Math.max(0,collisionFlash-dt);warningCooldown=Math.max(0,warningCooldown-dt);
    if(phase!=='running'&&phase!=='ready')return;
    const c=controls();
    if(phase==='ready'&&c.throttle&&!c.brake)phase='running';
    if(phase==='running')elapsed+=dt;
    const outcome=P.step(vehicle,c,dt,course());vehicle=outcome.state;
    if(outcome.collision){
      collisionFlash=.45;
      if(!contact){contact={x:vehicle.x,y:vehicle.y,theta:vehicle.theta};if(phase==='running'){penalties+=5;impacts++;toast('接触 +5秒 · 少し戻って、進路を修正',true);}}
    }else if(contact&&Math.hypot(vehicle.x-contact.x,vehicle.y-contact.y)>10)contact=null;
    if(outcome.jackknife&&warningCooldown<=0){toast('連結角度98°の限界です · ハンドルを戻して前進',true);warningCooldown=3;}
    if(phase==='running'&&P.isParked(vehicle,activeGoal())){parkHold+=dt;$('park-progress').hidden=false;$('park-progress-fill').style.width=`${Math.min(100,parkHold/2*100)}%`;if(parkHold>=2)finish();}
    else{parkHold=0;$('park-progress').hidden=true;}
  }
  function updateUi(){
    $('timer').textContent=format(elapsed+penalties);$('best-time').textContent=bests[bestKey()]?format(bests[bestKey()]):'—';$('speed').textContent=Math.round(Math.abs(vehicle.speed)*.32);
    $('gear-forward').classList.toggle('selected',gear===1);$('gear-reverse').classList.toggle('selected',gear===-1);$('gear-forward').setAttribute('aria-pressed',String(gear===1));$('gear-reverse').setAttribute('aria-pressed',String(gear===-1));
    $('steering-wheel').style.transform=`rotate(${vehicle.steer/P.getVehicle(vehicle).maxSteer*115}deg)`;$('steer-value').textContent=`${vehicle.steer>=.01?'+':''}${Math.round(vehicle.steer*180/Math.PI)}°`;
    const articulation=Math.abs(P.wrap(vehicle.theta-vehicle.trailerTheta))*180/Math.PI;$('articulation-value').textContent=`${Math.round(articulation)}°`;$('articulation-value').classList.toggle('warning',articulation>=85);
    const c=controls();$('throttle-indicator').classList.toggle('active',c.throttle&&!c.brake&&phase==='running');$('brake-indicator').classList.toggle('active',c.brake&&['ready','running'].includes(phase));
    $('map-status').textContent=phase==='running'?(gear===1?'DRIVING · FORWARD':'DRIVING · REVERSE'):phase==='paused'?'PAUSED':phase==='finished'?'PARKING COMPLETE':'READY TO DRIVE';
  }
  const map=document.createElement('canvas');map.width=W;map.height=H;const m=map.getContext('2d');
  function rounded(g,x,y,w,h,r,fill,stroke){g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.stroke();}}
  function text(g,str,x,y,size=14,color='#b6c0b7',align='left'){g.font=`${size}px ${mono}`;g.fillStyle=color;g.textAlign=align;g.fillText(str,x,y);g.textAlign='left';}
  function line(g,points,color,width,dash=[]){g.beginPath();g.moveTo(...points[0]);for(const p of points.slice(1))g.lineTo(...p);g.strokeStyle=color;g.lineWidth=width;g.setLineDash(dash);g.stroke();g.setLineDash([]);}
  function building(o){
    rounded(m,o.x+7,o.y+9,o.w,o.h,5,'#202b3260');rounded(m,o.x,o.y,o.w,o.h,4,'#4d606b','#71818a');rounded(m,o.x+7,o.y+7,o.w-14,o.h-14,2,'#445862','#596e76');
    m.save();m.beginPath();m.rect(o.x+8,o.y+8,o.w-16,o.h-16);m.clip();
    for(let x=o.x+23;x<o.x+o.w;x+=21)line(m,[[x,o.y+8],[x,o.y+o.h-8]],'#62778040',1);
    line(m,[[o.x+10,o.y+o.h-15],[o.x+o.w-10,o.y+o.h-15]],'#253c47',4);
    for(let x=o.x+35;x<o.x+o.w-40;x+=97){rounded(m,x,o.y+25,36,22,2,'#2e444e','#7a8a8d');for(let i=0;i<4;i++)line(m,[[x+5+i*8,o.y+28],[x+5+i*8,o.y+43]],'#79898b',2);}
    text(m,o.label,o.x+o.w/2,o.y+o.h/2+22,Math.min(20,o.w/20),'#a6b6bc','center');m.restore();
    if(courseIndex===2&&o.label==='LOADING DOCKS')for(let x=o.x+38;x<o.x+o.w-20;x+=85){m.fillStyle='#293e48';m.fillRect(x,o.y+o.h-11,35,10);line(m,[[x,o.y+o.h],[x+35,o.y+o.h]],'#bac5bb',2);}
  }
  function island(o){
    rounded(m,o.x+3,o.y+5,o.w,o.h,15,'#222c2b80');rounded(m,o.x,o.y,o.w,o.h,13,'#a4ac9c');rounded(m,o.x+7,o.y+7,o.w-14,o.h-14,9,'#667465');
    for(let y=o.y+31;y<o.y+o.h-19;y+=48)for(let x=o.x+32;x<o.x+o.w-15;x+=65){m.fillStyle='#243b3260';m.beginPath();m.ellipse(x+8,y+9,21,17,0,0,Math.PI*2);m.fill();m.fillStyle='#4a6150';m.beginPath();m.arc(x,y,20,0,Math.PI*2);m.fill();m.fillStyle='#5d755b';m.beginPath();m.arc(x-4,y-5,14,0,Math.PI*2);m.fill();m.fillStyle='#6c8061';m.beginPath();m.arc(x-7,y-7,7,0,Math.PI*2);m.fill();}
  }
  function parkedTrailer(o){rounded(m,o.x+4,o.y+5,o.w,o.h,3,'#1b252c70');rounded(m,o.x,o.y,o.w,o.h,3,'#aeb5a8','#d0d1bb');rounded(m,o.x+4,o.y+5,o.w-8,o.h-10,2,'#939d92');for(let y=o.y+10;y<o.y+o.h-5;y+=9)line(m,[[o.x+5,y],[o.x+o.w-5,y]],'#aeb9a44a',1);m.fillStyle='#252d2e';m.fillRect(o.x-3,o.y+o.h-28,4,14);m.fillRect(o.x+o.w-1,o.y+o.h-28,4,14);m.fillStyle='#b98362';m.fillRect(o.x+4,o.y+2,4,3);m.fillRect(o.x+o.w-8,o.y+2,4,3);}
  function container(o){rounded(m,o.x+5,o.y+6,o.w,o.h,2,'#16212b60');rounded(m,o.x,o.y,o.w,o.h,2,'#706f5d','#93917c');for(let x=o.x+6;x<o.x+o.w-3;x+=8)line(m,[[x,o.y+4],[x,o.y+o.h-4]],'#9e9a7960',2);text(m,'CARGO',o.x+o.w/2,o.y+o.h/2+5,12,'#d0cab1','center');}
  function pump(o){rounded(m,o.x+3,o.y+4,o.w,o.h,7,'#16212b70');rounded(m,o.x,o.y,o.w,o.h,7,'#a6ae9d','#c5cebb');rounded(m,o.x+6,o.y+7,o.w-12,o.h-14,5,'#767e6c');rounded(m,o.x+12,o.y+13,o.w-24,o.h-26,2,'#d9d9c4','#f4eed2');line(m,[[o.x+12,o.y+23],[o.x+o.w-12,o.y+23]],'#d39755',5);text(m,'FUEL',o.x+o.w/2,o.y+o.h+19,11,'#adb6a3','center');}
  function car(o){m.save();m.translate(o.x,o.y);rounded(m,3,4,o.w,o.h,5,'#1a252570');rounded(m,0,0,o.w,o.h,5,'#899894','#b2beb6');rounded(m,16,4,25,o.h-8,3,'#384e5a');m.fillStyle='#778d8d';m.fillRect(23,6,12,o.h-12);m.fillStyle='#b9c9bd';m.fillRect(o.w-4,3,2,6);m.fillRect(o.w-4,o.h-9,2,6);m.restore();}
  function cone(c){rounded(m,c.x-7+2,c.y-7+3,14,14,2,'#1f2b2670');rounded(m,c.x-7,c.y-7,14,14,2,'#534d38');m.fillStyle='#c3834d';m.beginPath();m.arc(c.x,c.y,5.5,0,Math.PI*2);m.fill();m.fillStyle='#e4d7b7';m.beginPath();m.arc(c.x,c.y,3,0,Math.PI*2);m.fill();m.fillStyle='#b97941';m.beginPath();m.arc(c.x,c.y,1.5,0,Math.PI*2);m.fill();}
  function rebuildMap(){
    m.fillStyle='#3a454b';m.fillRect(0,0,W,H);
    let seed=49271;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    m.fillStyle='#8290890a';for(let i=0;i<6200;i++){const x=rand()*W,y=rand()*H;m.fillRect(x,y,rand()*4+1,1);}
    for(let x=80;x<W;x+=130)line(m,[[x,46],[x,754]],'#c0c6bd06',1);
    for(let y=80;y<H;y+=110)line(m,[[46,y],[1234,y]],'#c0c6bd06',1);
    rounded(m,43,43,1194,714,20,null,'#1c2a2e');m.lineWidth=6;rounded(m,45,45,1190,710,18,null,'#858f88');m.lineWidth=1;rounded(m,51,51,1178,698,13,null,'#b7bca65a');
    // Painted yard markings and a subdued route line support the actual driving task.
    if(courseIndex===0){for(let x=80;x<340;x+=79){line(m,[[x,635],[x,710],[x+63,710],[x+63,635]],'#bcc6ac70',2);}line(m,[[86,326],[1210,326]],'#bcc6ac50',2,[25,20]);line(m,[[87,610],[591,610]],'#b7c2a660',2,[25,20]);}
    if(courseIndex===2){line(m,[[87,579],[516,579]],'#b9c7aa60',2,[26,19]);for(let x=721;x<1207;x+=84)text(m,String(1+Math.round((x-721)/84)).padStart(2,'0'),x+40,374,14,'#a7b297','center');}
    course().bays.forEach(b=>line(m,[[b.x,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h],[b.x+b.w,b.y]],'#b9c2a75c',2));
    line(m,course().guide,'#b8c79c30',2,[8,13]);
    if(courseIndex===1){line(m,[[85,555],[470,555]],'#b9c1a580',2);line(m,[[709,498],[1065,498]],'#b9c1a580',2);}
    if(courseIndex===3){line(m,[[580,651],[712,651]],'#b9c1a570',2);line(m,[[741,355],[741,539]],'#b9c1a570',2);}
    course().obstacles.forEach(o=>{({building,island,trailer:parkedTrailer,container,car,pump}[o.kind]||building)(o);});
    course().cones.forEach(cone);
    const label=course().yardLabel;text(m,label.text,label.x,label.y,21,'#a0aba326','center');
    for(const mark of [{x:92,y:594,a:0},{x:1187,y:363,a:Math.PI/2}]){if(courseIndex!==0)continue;m.save();m.translate(mark.x,mark.y);m.rotate(mark.a);line(m,[[-14,0],[13,0]],'#b1be9460',2);line(m,[[4,-7],[13,0],[4,7]],'#b1be9460',2);m.restore();}
  }
  function goal(){
    const g=activeGoal(),ok=P.isParked(vehicle,g),c=ok?'#e1ffa3':'#cde694';
    ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);
    ctx.fillStyle=ok?'#cde69425':'#cde6940d';ctx.fillRect(-g.length/2,-g.width/2,g.length,g.width);
    ctx.strokeStyle=c;ctx.lineWidth=2;ctx.setLineDash([8,5]);ctx.strokeRect(-g.length/2,-g.width/2,g.length,g.width);ctx.setLineDash([]);
    const l=g.length/2,w=g.width/2;ctx.strokeStyle=c;ctx.lineWidth=3;
    for(const [x,y,sx,sy] of [[-l,-w,1,1],[l,-w,-1,1],[-l,w,1,-1],[l,w,-1,-1]])line(ctx,[[x+sx*12,y],[x,y],[x,y+sy*10]],c,3);
    text(ctx,'P',0,7,24,'#cde694a0','center');line(ctx,[[g.length/2+10,0],[g.length/2+25,0]],'#cde69490',2);line(ctx,[[g.length/2+18,-5],[g.length/2+25,0],[g.length/2+18,5]],'#cde69490',2);
    ctx.restore();
    ctx.save();ctx.translate(g.x,g.y);if(courseIndex===2)text(ctx,'PARK HERE',0,-g.length/2-15,12,c,'center');else text(ctx,'PARK HERE',0,-g.width/2-15,12,c,'center');ctx.restore();
  }
  function wheel(g,x,y,angle=0){g.save();g.translate(x,y);g.rotate(angle);rounded(g,-8,-3,16,6,1,'#1b2529','#606b6b');line(g,[[-5,-1.2],[5,-1.2]],'#425151',1);g.restore();}
  function drawVehicle(){
    const h=P.hitch(vehicle),v=P.getVehicle(vehicle);
    // Draw a compact shadow, then articulated body geometry from the physics state.
    ctx.save();ctx.translate(4,5);const b=P.bodies(vehicle);ctx.fillStyle='#131d2580';for(const poly of [b.tractor,b.trailer]){ctx.beginPath();ctx.moveTo(poly[0].x,poly[0].y);poly.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fill();}ctx.restore();
    ctx.save();ctx.translate(vehicle.x,vehicle.y);ctx.rotate(vehicle.theta);
    wheel(ctx,0,-17);wheel(ctx,0,17);wheel(ctx,32,-17,vehicle.steer);wheel(ctx,32,17,vehicle.steer);
    rounded(ctx,-14,-13,42,26,2,'#687373','#a3a997');rounded(ctx,-10,-9,24,18,1,'#384747');ctx.fillStyle='#252f31';ctx.fillRect(-5,-7,12,14);
    rounded(ctx,17,-14.5,26,29,3,collisionFlash>0?'#f1b696':'#dbaa60','#efcd93');rounded(ctx,20,-11,13,22,2,'#bb8d4e');ctx.fillStyle='#283d48';ctx.fillRect(34,-11.5,5.5,23);line(ctx,[[35,-10],[35,10]],'#6f8d8c',1);ctx.fillStyle='#f4e6b9';ctx.fillRect(40,-11,3,5);ctx.fillRect(40,6,3,5);ctx.fillStyle='#576963';ctx.fillRect(28,-18,8,3);ctx.fillRect(28,15,8,3);line(ctx,[[24,-17],[27,-13]],'#84968a',2);line(ctx,[[24,17],[27,13]],'#84968a',2);ctx.restore();
    ctx.save();ctx.translate(h.x,h.y);ctx.rotate(vehicle.trailerTheta);
    const half=v.trailerWidth/2,length=v.trailerBack-v.trailerFront;
    for(const axle of (modelId==='tanker'?[-v.trailerAxle,-v.trailerAxle-10,-v.trailerAxle-20]:[-v.trailerAxle,-v.trailerAxle-9])){wheel(ctx,axle,-half-2);wheel(ctx,axle,half+2);}
    if(modelId==='tanker'){
      rounded(ctx,-v.trailerBack,-half,length,v.trailerWidth,2,'#596a6b','#a3b2ac');
      const metal=ctx.createLinearGradient(0,-half,0,half);metal.addColorStop(0,'#788c90');metal.addColorStop(.25,'#dbe4e0');metal.addColorStop(.45,'#f0f1e4');metal.addColorStop(.7,'#c9d7d1');metal.addColorStop(1,'#71868a');
      rounded(ctx,-v.trailerBack+3,-half+1,length-6,v.trailerWidth-2,half-1,collisionFlash>0?'#e6cbb8':metal,'#c3d4ce');
      for(const ratio of [.19,.5,.81]){const x=-v.trailerBack+length*ratio;line(ctx,[[x,-half+2],[x,half-2]],'#607879',3);line(ctx,[[x+2,-half+3],[x+2,half-3]],'#edf0de',1);}
      for(const x of [-v.trailerBack+35,-v.trailerFront-33]){ctx.fillStyle='#8da5a1';ctx.beginPath();ctx.arc(x,0,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e1e8da';ctx.lineWidth=1;ctx.stroke();}
      line(ctx,[[-v.trailerBack+15,half-4],[-v.trailerFront-12,half-4]],'#4b6766',1.5);
      ctx.fillStyle='#dc9956';ctx.fillRect(-v.trailerBack+8,-5,9,10);text(ctx,'FUEL',-(v.trailerBack+v.trailerFront)/2,4,10,'#516a65','center');
    }else{
      rounded(ctx,-v.trailerBack,-half,length,v.trailerWidth,2,collisionFlash>0?'#ead0bb':'#e2dfca','#fbf1d0');rounded(ctx,-v.trailerBack+4,-half+3,length-8,v.trailerWidth-6,1,'#d0d0bb');
      for(let x=-v.trailerBack+9;x<-v.trailerFront-4;x+=8)line(ctx,[[x,-10],[x,10]],'#aeb7a950',1);
      line(ctx,[[-v.trailerBack+4,-13],[-v.trailerFront-5,-13]],'#f1eed6',2);line(ctx,[[-v.trailerBack+4,13],[-v.trailerFront-5,13]],'#a5ad9c',2);
      ctx.fillStyle='#e3b46c';ctx.fillRect(-v.trailerFront-7,-13,5,26);line(ctx,[[-v.trailerBack+5,-12],[-v.trailerBack+5,12]],'#899687',2);text(ctx,'07',-(v.trailerBack+v.trailerFront)/2,4,12,'#687c69','center');
    }
    const braking=controls().brake;ctx.fillStyle=braking?'#fc8c65':'#b07055';ctx.fillRect(-v.trailerBack,-half+3,3,5);ctx.fillRect(-v.trailerBack,half-8,3,5);ctx.restore();
    if(collisionFlash>0){ctx.strokeStyle='#ffb183';ctx.lineWidth=2;ctx.beginPath();ctx.arc(vehicle.x+15*Math.cos(vehicle.theta),vehicle.y+15*Math.sin(vehicle.theta),48+(1-collisionFlash/.45)*10,0,Math.PI*2);ctx.globalAlpha=collisionFlash/.45;ctx.stroke();ctx.globalAlpha=1;}
  }
  function draw(){ctx.clearRect(0,0,W,H);ctx.drawImage(map,0,0);goal();drawVehicle();}
  function frame(now){
    const delta=Math.min((now-previous)/1000,.1);previous=now;accumulator+=delta;
    while(accumulator>=STEP){tick(STEP);accumulator-=STEP;}
    draw();if(now-lastUi>50){updateUi();lastUi=now;}requestAnimationFrame(frame);
  }
  const handled=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','Space','KeyE','KeyR','Escape','Enter']);
  document.addEventListener('keydown',e=>{
    if(!handled.has(e.code)||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(dialogs.some(d=>d.open))return;
    if(e.code==='Enter'&&e.target.closest('button,a'))return;
    e.preventDefault();
    if(!e.repeat){if(e.code==='KeyR'){reset();return;}if(e.code==='KeyE'){setGear(-gear);return;}if(e.code==='Escape'){if(phase==='paused')resume();else pause();return;}if(e.code==='Enter'){if(phase==='paused')resume();else start();return;}}
    if(['paused','finished'].includes(phase))return;
    if(phase==='idle'&&['ArrowUp','KeyW'].includes(e.code))start();
    keys.add(e.code);
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();pause();}});
  $('start-button').addEventListener('click',start);$('resume-button').addEventListener('click',resume);$('restart-button').addEventListener('click',reset);$('gear-forward').addEventListener('click',()=>setGear(1));$('gear-reverse').addEventListener('click',()=>setGear(-1));
  $('retry-result').addEventListener('click',()=>{reset();start();});$('next-course').addEventListener('click',()=>selectCourse((courseIndex+1)%P.courses.length));
  $('help-button').addEventListener('click',()=>{helpWasRunning=['ready','running'].includes(phase);if(helpWasRunning)pause();keys.clear();$('help-dialog').showModal();});
  dialogs.forEach(d=>d.querySelectorAll('.dialog-close').forEach(b=>b.addEventListener('click',()=>d.close())));
  $('help-dialog').addEventListener('close',()=>{if(helpWasRunning){helpWasRunning=false;resume();}});
  // WebMCP reuses visible course-selection and pause actions where supported.
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
    const tools=[
      {name:'read_driving_session',title:'走行状態を読む',description:'Read the selected vehicle, course, timer, gear and parking state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({vehicle:modelId,course:course().id,phase,time:format(elapsed+penalties),penalties,gear:gear===1?'D':'R',speed:Math.round(Math.abs(vehicle.speed)*.32)})},
      {name:'select_driving_course',title:'コースを選ぶ',description:'Select a course and reset its driving session, exactly like the course cards.',inputSchema:{type:'object',properties:{courseId:{type:'string',enum:P.courses.map(c=>c.id)}},required:['courseId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='courseId'))throw new Error('Invalid input');const index=P.courses.findIndex(c=>c.id===input.courseId);if(index<0)throw new Error('Unknown course');selectCourse(index);return {course:course().id,phase};}}
    ];
    for(const tool of tools)try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Unsupported implementations must not affect gameplay. */}
  }
  renderVehicles();renderCourses();rebuildMap();updateUi();requestAnimationFrame(frame);
})();
