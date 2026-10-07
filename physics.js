/* Deterministic, fixed-step kinematic tractor / semitrailer model. Units: pixels, seconds. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const common = { wheelbase: 32, hitchOffset: 6, trailerFront: 10, tractorBack: 14, tractorFront: 43, tractorWidth: 29, maxSteer: 0.57, maxArticulation: 98 * Math.PI / 180 };
  // Mass controls longitudinal inertia; steering input changes and holds the wheel angle.
  const VEHICLES = Object.freeze([
    Object.freeze({ ...common, id: 'box', name: '標準トレーラー', lengthMetres: 12.0, massTonnes: 18, trailerAxle: 80, trailerBack: 101, trailerWidth: 31, maxForward: 100, maxReverse: 42, driveForce: 612, brakeForce: 1800, rollingForce: 144, drag: 1.8, steeringRate: .95 }),
    Object.freeze({ ...common, id: 'tanker', name: 'タンクローリー', lengthMetres: 16.5, massTonnes: 36, trailerAxle: 126, trailerBack: 157, trailerWidth: 33, maxForward: 85, maxReverse: 32, driveForce: 648, brakeForce: 2160, rollingForce: 126, drag: 1.8, steeringRate: .63 })
  ]);
  const VEHICLE = VEHICLES[0];
  function getVehicle(s) { return VEHICLES.find(v => v.id === s.modelId) || VEHICLE; }
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const rect = (x, y, w, h, kind = 'building', label = '') => ({ x, y, w, h, kind, label });
  const courses = [
    {
      id: 'depot', name: '物流センター', subtitle: '広いヤードで、連結車両に慣れよう。', description: '広いヤード / 前進駐車', difficulty: 1,
      spawn: { x: 410, y: 550, theta: 0 }, goal: { x: 1040, y: 445, angle: 0, length: 120, width: 55 },
      obstacles: [rect(66, 65, 477, 210, 'building', 'DISTRIBUTION 01'), rect(810, 65, 397, 205, 'building', 'WAREHOUSE B'), rect(613, 88, 36, 125, 'trailer'), rect(683, 88, 36, 125, 'trailer'), rect(665, 593, 290, 135, 'island'), rect(94, 662, 55, 29, 'car'), rect(173, 662, 55, 29, 'car'), rect(252, 662, 55, 29, 'car')],
      cones: [{x:778,y:296},{x:804,y:296},{x:978,y:595},{x:978,y:628},{x:978,y:660}],
      guide: [[320,550],[615,550],[755,445],[963,445]], road: null,
      bays: [{x:590,y:72,w:82,h:156},{x:660,y:72,w:82,h:156}], yardLabel: { x: 470, y: 365, text: 'LOGISTICS YARD' }
    },
    {
      id: 'curve', name: '工業団地の狭路', subtitle: '内輪差に気をつけて、連続カーブを抜けよう。', description: '狭い道 / 連続カーブ', difficulty: 2,
      spawn: { x: 350, y: 653, theta: 0 }, goal: { x: 1085, y: 176, angle: 0, length: 120, width: 53 },
      obstacles: [rect(56,56,791,256,'building','INDUSTRIAL BLOCK'), rect(56,333,420,220,'island'), rect(707,514,510,226,'building','FACTORY 02'), rect(1081,285,136,205,'island')],
      cones: [{x:720,y:495},{x:753,y:495},{x:859,y:297}],
      guide: [[190,653],[586,653],[586,413],[963,413],[963,176],[1007,176]],
      road: [[80,653],[586,653],[586,413],[963,413],[963,176],[1215,176]], bays: [], yardLabel: {x:260,y:440,text:'KEEP CLEAR'}
    },
    {
      id: 'dock', name: '搬入口へのバック', subtitle: '切り返しながら、奥の搬入口にバックで駐車。', description: '障害物 / バック駐車', difficulty: 3,
      spawn: { x: 395, y: 490, theta: 0 }, goal: { x: 918, y: 263, angle: Math.PI / 2, length: 120, width: 57 }, tankerGoal: { x: 918, y: 291 },
      obstacles: [rect(703,65,504,114,'building','LOADING DOCKS'),rect(744,205,35,132,'trailer'),rect(827,205,35,132,'trailer'),rect(999,205,35,132,'trailer'),rect(1091,205,35,132,'trailer'),rect(64,67,373,181,'building','OFFICE / DISPATCH'),rect(93,298,245,55,'container'),rect(595,630,278,102,'island'),rect(1081,539,119,174,'container')],
      cones: [{x:662,y:246},{x:662,y:279},{x:661,y:312}],
      guide: [[275,490],[850,490],[1025,447],[1025,391]], road:null,
      bays:[{x:723,y:186,w:75,h:164},{x:807,y:186,w:75,h:164},{x:891,y:186,w:58,h:155},{x:978,y:186,w:76,h:164},{x:1067,y:186,w:77,h:164}], yardLabel:{x:610,y:551,text:'LOADING AREA'}
    },
    {
      id: 'station', name: '給油所の裏路地', subtitle: '狭いクランクを抜け、給油所の奥へ。切り返しを使おう。', description: '狭いクランク / 給油所', difficulty: 3,
      spawn: { x: 310, y: 688, theta: 0 }, goal: { x: 1060, y: 182, angle: 0, length: 123, width: 51 },
      obstacles: [rect(56,56,674,373,'building','SERVICE BLOCK'), rect(56,451,674,123,'building','REAR SERVICE ALLEY'), rect(418,592,154,57,'container'), rect(940,331,276,409,'building','FUEL STATION'), rect(883,411,42,151,'island'), rect(958,257,49,62,'pump'), rect(1068,256,49,62,'pump'), rect(1127,264,89,43,'island'), rect(739,70,182,56,'building','STORE / OFFICE')],
      cones: [{x:602,y:590},{x:885,y:386},{x:917,y:386},{x:736,y:449}],
      guide: [[195,688],[650,688],[823,688],[850,650],[849,610],[806,550],[801,380],[801,280],[803,230],[855,182],[930,182],[975,182]],
      road: [[90,688],[650,688],[850,650],[806,550],[801,380],[803,230],[855,182],[1211,182]], bays: [], yardLabel: {x:830,y:349,text:'SLOW'}
    }
  ];
  function createVehicle(spawn, modelId = 'box') { if(!VEHICLES.some(v=>v.id===modelId))throw new Error('Unknown vehicle'); return { modelId, x: spawn.x, y: spawn.y, theta: spawn.theta, trailerTheta: spawn.theta, speed: 0, steer: 0 }; }
  function goalFor(course, modelId) {
    const v=getVehicle({modelId}), g={...course.goal,...(modelId==='tanker'?course.tankerGoal:{})};
    return {...g,length:Math.max(g.length,v.trailerBack-v.trailerFront+29),width:Math.max(g.width,v.trailerWidth+16)};
  }
  function hitch(s) { const v=getVehicle(s);return { x: s.x - v.hitchOffset * Math.cos(s.theta), y: s.y - v.hitchOffset * Math.sin(s.theta) }; }
  function localPoint(x, y, angle, dx, dy) { return { x: x + dx * Math.cos(angle) - dy * Math.sin(angle), y: y + dx * Math.sin(angle) + dy * Math.cos(angle) }; }
  function polygon(x, y, angle, back, front, width) { return [[back,-width/2],[front,-width/2],[front,width/2],[back,width/2]].map(([dx,dy]) => localPoint(x,y,angle,dx,dy)); }
  function bodies(s) { const h = hitch(s),v=getVehicle(s); return { tractor: polygon(s.x,s.y,s.theta,-v.tractorBack,v.tractorFront,v.tractorWidth), trailer: polygon(h.x,h.y,s.trailerTheta,-v.trailerBack,-v.trailerFront,v.trailerWidth) }; }
  function intersects(a, b) {
    for (const shape of [a,b]) {
      for (let i=0;i<shape.length;i++) {
        const next=shape[(i+1)%shape.length], p=shape[i], axis={x:-(next.y-p.y),y:next.x-p.x};
        let minA=Infinity,maxA=-Infinity,minB=Infinity,maxB=-Infinity;
        for(const v of a){const n=v.x*axis.x+v.y*axis.y;minA=Math.min(minA,n);maxA=Math.max(maxA,n);}
        for(const v of b){const n=v.x*axis.x+v.y*axis.y;minB=Math.min(minB,n);maxB=Math.max(maxB,n);}
        if(maxA<=minB || maxB<=minA)return false;
      }
    }
    return true;
  }
  function collides(s, course) {
    const body=bodies(s);
    for(const shape of [body.tractor,body.trailer]) {
      if(shape.some(p=>p.x<48||p.x>1232||p.y<48||p.y>752))return true;
      for(const o of course.obstacles){const box=[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}];if(intersects(shape,box))return true;}
      for(const c of course.cones){const box=[{x:c.x-7,y:c.y-7},{x:c.x+7,y:c.y-7},{x:c.x+7,y:c.y+7},{x:c.x-7,y:c.y+7}];if(intersects(shape,box))return true;}
    }
    return false;
  }
  function isParked(s, goal) {
    if(Math.abs(s.speed)>1.4)return false;
    // Accept either direction; the complete trailer must fit the marked rectangle.
    const angleError=Math.abs(wrap(s.trailerTheta-goal.angle));
    if(Math.min(angleError,Math.PI-angleError)>0.12)return false;
    const ca=Math.cos(goal.angle),sa=Math.sin(goal.angle);
    return bodies(s).trailer.every(p=>{const dx=p.x-goal.x,dy=p.y-goal.y;return Math.abs(dx*ca+dy*sa)<=goal.length/2-1 && Math.abs(-dx*sa+dy*ca)<=goal.width/2-1;});
  }
  function step(s, controls, dt, course) {
    dt=clamp(dt,0,1/30);
    const next={...s},v=getVehicle(s);
    next.steer=clamp(s.steer+clamp(controls.steer||0,-1,1)*v.steeringRate*dt,-v.maxSteer,v.maxSteer);
    const braking=controls.brake;
    if(braking){next.speed=Math.sign(next.speed)*Math.max(0,Math.abs(next.speed)-v.brakeForce/v.massTonnes*dt);}
    else if(controls.throttle){next.speed+=controls.gear*v.driveForce/v.massTonnes*dt;}
    else{next.speed=Math.sign(next.speed)*Math.max(0,Math.abs(next.speed)-(v.rollingForce+Math.abs(next.speed)*v.drag)/v.massTonnes*dt);}
    next.speed=clamp(next.speed,-v.maxReverse,v.maxForward);
    if(Math.abs(next.speed)<1e-9)next.speed=0;
    const angular=next.speed/v.wheelbase*Math.tan(next.steer);
    // Trailer yaw follows hitch velocity normal to its rolling direction.
    const hx=next.speed*Math.cos(s.theta)+v.hitchOffset*angular*Math.sin(s.theta);
    const hy=next.speed*Math.sin(s.theta)-v.hitchOffset*angular*Math.cos(s.theta);
    next.trailerTheta=wrap(s.trailerTheta+(-hx*Math.sin(s.trailerTheta)+hy*Math.cos(s.trailerTheta))/v.trailerAxle*dt);
    next.theta=wrap(s.theta+angular*dt);
    next.x+=next.speed*Math.cos(s.theta+angular*dt/2)*dt;
    next.y+=next.speed*Math.sin(s.theta+angular*dt/2)*dt;
    const articulation=Math.abs(wrap(next.theta-next.trailerTheta));
    if(articulation>v.maxArticulation && articulation>Math.abs(wrap(s.theta-s.trailerTheta))){return {state:{...s,steer:next.steer,speed:0},collision:false,jackknife:true};}
    if(course && collides(next,course))return {state:{...s,steer:next.steer,speed:0},collision:true,jackknife:false};
    return {state:next,collision:false,jackknife:false};
  }
  const api={VEHICLE,VEHICLES,getVehicle,goalFor,courses,clamp,wrap,createVehicle,hitch,localPoint,bodies,intersects,collides,isParked,step};
  root.TrailerPhysics=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
