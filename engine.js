import {PLC,exampleProgram,validateProgram} from './plc.js';
import {Machine,DEFAULT_PARAMS,INPUTS,OUTPUTS,defaultWiring,validateWire} from './model.js';
export const SCAN_MS=10;
export const PARAM_LIMITS={speed:[20,600],spacing:[100,900],sensorPosition:[100,550],sensorDelay:[0,1000],actuatorTime:[20,1000]};
export class Simulation{
 constructor(){this.params={...DEFAULT_PARAMS};this.program=exampleProgram();this.wires=defaultWiring();this.faults={sensorOff:false,sensorOn:false,actuatorLate:false,jam:false};this.reset();}
 reset(){const held=this.control?.estop||false,restart=!!(held||this.control?.trip||this.control?.restartRequired);this.plc=new PLC();this.machine=new Machine();this.tick=0;this.running=false;this.control={start:0,stop:0,estop:held,trip:held,restartRequired:restart};this.events=[];this.samples=[];this.revision=1;this.configurations=[];this.sessionId=new Date().toISOString();this.recordConfig('Session reset');this.log('SESSION','Reset; Start required');this.sample();}
 get time(){return this.tick*SCAN_MS/1000;}
 log(type,message){this.events.push({simulation_time_s:+this.time.toFixed(3),type,message,revision:this.revision});}
 recordConfig(reason){this.configurations.push({revision:this.revision,simulation_time_s:this.time,reason,project:this.project()});}
 changed(reason){this.revision++;this.recordConfig(reason);this.log('CONFIG',reason);}
 start(){if(this.control.trip||this.control.estop)return false;this.control.restartRequired=false;this.control.start=150;this.control.stop=0;this.log('CONTROL','Start push button');return true;}
 stop(){this.control.stop=150;this.control.start=0;this.log('CONTROL','Stop push button');}
 estop(){this.control.estop=true;this.control.trip=true;this.control.restartRequired=true;this.control.start=0;this.machine.speed=0;this.machine.outputs={};if(this.machine.activeSeal)this.machine.activeSeal.interrupted=true;this.plc=new PLC();this.log('SAFETY','Emergency stop pressed; motion interlocked');}
 releaseEstop(){this.control.estop=false;this.log('SAFETY','E-stop released; Safety reset required');}
 safetyReset(){if(this.control.estop)return false;this.control.trip=false;this.control.restartRequired=true;this.control.start=0;this.plc=new PLC();this.log('SAFETY','Safety reset; Start required');return true;}
 scan(){
 this.tick++;
 const signals=this.machine.signals(this.control,this.faults),inputs={};
 for(const w of this.wires)if(w.to.startsWith('I'))inputs[w.to]=!!signals[w.from];
 const valid=this.plc.evaluate(this.program,inputs,SCAN_MS);
 const outputs=Object.fromEntries(OUTPUTS.map(([id])=>[id,false]));for(const w of this.wires)if(w.from.startsWith('Q'))outputs[w.to]=valid&&this.plc.read(w.from);
 if(this.control.trip||this.control.restartRequired)for(const key in outputs)outputs[key]=false;
 this.machine.step(SCAN_MS,this.params,outputs,this.control,this.faults,(type,message)=>this.log(type,message));
 this.control.start=Math.max(0,this.control.start-SCAN_MS);this.control.stop=Math.max(0,this.control.stop-SCAN_MS);
 if(this.tick%10===0)this.sample();
 }
 advance(scans){for(let i=0;i<scans;i++)this.scan();}
 sample(){const m=this.machine;const row={session_id:this.sessionId,simulation_time_s:+this.time.toFixed(3),revision:this.revision,actual_speed_mm_s:m.speed,set_speed_mm_s:this.params.speed,sensor_on:+m.sensor,jaw_position_ratio:+m.jaw.toFixed(4),solenoid_on:+!!m.outputs.solenoid,motor_on:+!!m.outputs.motor,machine_state:m.state,completed:m.good+m.reject,good:m.good,reject:m.reject,throughput_products_min:this.time?+((m.good+m.reject)/this.time*60).toFixed(4):0,alarm:m.alarms.join(' | '),alarm_duration_s:+m.alarmSeconds.toFixed(3),estop_latched:+this.control.trip,restart_required:+this.control.restartRequired};for(let i=0;i<8;i++){row[`I0.${i}`]=+this.plc.read(`I0.${i}`);row[`Q0.${i}`]=+this.plc.read(`Q0.${i}`);}for(const [key,value]of Object.entries(this.params))row[({speed:'param_speed_mm_s',spacing:'param_spacing_mm',sensorPosition:'param_sensor_position_mm',sensorDelay:'param_sensor_delay_ms',actuatorTime:'param_actuator_response_ms'})[key]]=value;for(const [key,value]of Object.entries(this.faults))row[`fault_${key}`]=+value;row.project_json=JSON.stringify(this.project());this.samples.push(row);}
 project(){return structuredClone({version:1,params:this.params,wires:this.wires,program:this.program,faults:this.faults});}
 load(data){
 if(!data||data.version!==1)throw Error('Format project tidak didukung (version 1 diperlukan).');
 for(const [key,[min,max]]of Object.entries(PARAM_LIMITS))if(!Number.isFinite(data.params?.[key])||data.params[key]<min||data.params[key]>max)throw Error(`Parameter ${key} harus ${min}–${max}.`);
 const errors=validateProgram(data.program);if(errors.length)throw Error(errors.join('\n'));
 if(!Array.isArray(data.wires)||data.wires.length>32)throw Error('Daftar wiring tidak valid.');const wires=[];for(const w of data.wires){const error=validateWire(w.from,w.to,wires);if(error)throw Error(error);wires.push({...w});}
 for(const key of ['sensorOff','sensorOn','actuatorLate','jam'])if(typeof data.faults?.[key]!=='boolean')throw Error('Fault configuration tidak valid.');if(data.faults.sensorOff&&data.faults.sensorOn)throw Error('Sensor tidak bisa stuck ON dan OFF bersamaan.');
 this.params={...data.params};this.program=structuredClone(data.program);this.wires=wires;this.faults={...data.faults};this.control={estop:false};this.reset();
 }
}
export function csv(rows,headers=Object.keys(rows[0]||{})){const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';return '\uFEFF'+[headers.map(quote).join(','),...rows.map(row=>headers.map(h=>quote(row[h])).join(','))].join('\r\n');}
