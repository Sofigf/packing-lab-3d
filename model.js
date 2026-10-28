export const GEOMETRY={length:1100,jaw:600,product:60,tolerance:25,minSealMs:500};
export const DEFAULT_PARAMS={speed:200,spacing:380,sensorPosition:400,sensorDelay:20,actuatorTime:150};
export const INPUTS=[['start','Start push button'],['stop','Stop circuit healthy'],['estop','E-stop circuit healthy'],['sensor','Product sensor'],['jawOpen','Jaw-open limit'],['jawClosed','Jaw-closed limit'],['alarm','Machine diagnostic']];
export const OUTPUTS=[['motor','Conveyor motor'],['solenoid','Sealing solenoid'],['running','Running indicator'],['alarmLamp','Alarm indicator']];
export const defaultWiring=()=>[...INPUTS.map(([id],i)=>({from:id,to:`I0.${i}`})),...OUTPUTS.map(([id],i)=>({from:`Q0.${i}`,to:id}))];
export function validateWire(from,to,wires=[]){
 const isIn=INPUTS.some(x=>x[0]===from)&&/^I0\.[0-7]$/.test(to);
 const isOut=/^Q0\.[0-7]$/.test(from)&&OUTPUTS.some(x=>x[0]===to);
 if(!isIn&&!isOut)return 'Hubungkan field input → PLC I, atau PLC Q → actuator.';
 if(wires.some(w=>w.to===to))return 'Terminal tujuan sudah terhubung. Hapus kabel lama terlebih dahulu.';
 return '';
}
export class Machine{
 constructor(){this.products=[{id:1,x:30,sealed:false,good:false,reason:'Not sealed'}];this.nextId=2;this.feedTravel=0;this.jaw=0;this.speed=0;this.sensor=false;this.rawSensor=false;this.sensorAge=0;this.good=0;this.reject=0;this.activeSeal=null;this.state='IDLE';this.alarms=[];this.alarmSeconds=0;this.travel=0;this.outputs={};}
 signals(control,faults){return {start:control.start>0,stop:!control.stop,estop:!control.estop,sensor:this.sensor,jawOpen:this.jaw<=0,jawClosed:this.jaw>=1,alarm:this.alarms.length>0};}
 step(dt,p,outputs,control,faults,emit){
 const sec=dt/1000,prevJaw=this.jaw;this.outputs=outputs;
 const safe=!control.trip&&!control.estop&&!control.restartRequired;
 const desiredClose=outputs.solenoid&&safe;
 // The educational interlock freezes motion while tripped. Reset allows recovery.
 if(safe)this.jaw=Math.max(0,Math.min(1,this.jaw+(desiredClose?1:-1)*dt/(p.actuatorTime*(faults.actuatorLate?5:1))));
 if(this.jaw<1e-9)this.jaw=0;if(this.jaw>1-1e-9)this.jaw=1;
 this.speed=safe&&outputs.motor&&!faults.jam?p.speed:0;
 const dx=this.speed*sec;this.travel+=dx;this.feedTravel+=dx;
 for(const product of this.products)product.x+=dx;
 while(this.feedTravel>=p.spacing){this.feedTravel-=p.spacing;this.products.push({id:this.nextId++,x:30+this.feedTravel,sealed:false,good:false,reason:'Not sealed'});}
 const beam=this.products.some(x=>Math.abs(x.x-p.sensorPosition)<=GEOMETRY.product/2);
 const raw=faults.sensorOff?false:faults.sensorOn?true:beam;
 if(raw!==this.rawSensor){this.rawSensor=raw;this.sensorAge=0;}
 this.sensorAge+=dt;if(this.sensorAge>=p.sensorDelay)this.sensor=raw;
 if(prevJaw<1&&this.jaw===1){const nearby=this.products.filter(x=>!x.sealed&&Math.abs(x.x-GEOMETRY.jaw)<=100).sort((a,b)=>Math.abs(a.x-GEOMETRY.jaw)-Math.abs(b.x-GEOMETRY.jaw));const product=nearby[0];this.activeSeal={id:product?.id,elapsed:0,position:product?.x??null,moved:false,interrupted:false};emit('JAW_CLOSED',product?`Product ${product.id} at ${product.x.toFixed(1)} mm`:'No product in sealing area');}
 if(this.activeSeal){if(this.jaw===1&&prevJaw===1&&safe)this.activeSeal.elapsed+=dt;if(dx>0)this.activeSeal.moved=true;if(!safe)this.activeSeal.interrupted=true;}
 if(prevJaw===1&&this.jaw<1&&this.activeSeal){const seal=this.activeSeal,product=this.products.find(x=>x.id===seal.id);if(product){product.sealed=true;product.good=Math.abs(seal.position-GEOMETRY.jaw)<=GEOMETRY.tolerance&&seal.elapsed>=GEOMETRY.minSealMs&&!seal.moved&&!seal.interrupted;product.reason=seal.interrupted?'Seal interrupted':seal.moved?'Product moved during seal':Math.abs(seal.position-GEOMETRY.jaw)>GEOMETRY.tolerance?'Outside position tolerance':seal.elapsed<GEOMETRY.minSealMs?'Seal dwell too short':'Good seal';product.sealMs=seal.elapsed;emit('SEAL_RESULT',`Product ${product.id}: ${product.reason} (${seal.elapsed} ms)`);}this.activeSeal=null;}
 const exited=this.products.filter(x=>x.x>GEOMETRY.length+GEOMETRY.product/2);for(const product of exited){if(product.good)this.good++;else this.reject++;emit(product.good?'PRODUCT_GOOD':'PRODUCT_REJECT',`Product ${product.id}: ${product.reason}`);}this.products=this.products.filter(x=>x.x<=GEOMETRY.length+GEOMETRY.product/2);
 const alarms=[];if(control.trip)alarms.push('E-STOP LATCHED');if(faults.sensorOff)alarms.push('SENSOR STUCK OFF');if(faults.sensorOn)alarms.push('SENSOR STUCK ON');if(faults.actuatorLate)alarms.push('ACTUATOR DELAY ×5');if(faults.jam)alarms.push('PRODUCT JAM');if(this.speed>0&&this.jaw>0)alarms.push('MOTION WITH JAW ENGAGED');if(this.activeSeal&&this.activeSeal.position!==null&&Math.abs(this.activeSeal.position-GEOMETRY.jaw)>GEOMETRY.tolerance)alarms.push('SEAL MISALIGNMENT');
 for(const alarm of alarms)if(!this.alarms.includes(alarm))emit('ALARM_ON',alarm);for(const alarm of this.alarms)if(!alarms.includes(alarm))emit('ALARM_OFF',alarm);
 this.alarms=alarms;if(alarms.length)this.alarmSeconds+=sec;
 const state=control.trip?'E-STOP':control.restartRequired?'START REQUIRED':faults.jam?'JAMMED':this.jaw===1?'SEALING':this.jaw>0?(desiredClose?'CLOSING':'OPENING'):this.speed>0?'CONVEYING':outputs.running?'WAITING':'IDLE';
 if(state!==this.state){emit('STATE',`${this.state} → ${state}`);this.state=state;}
 }
}
