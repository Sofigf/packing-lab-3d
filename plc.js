// Structured ladder: groups are series; contacts within a group are parallel.
export const contact=(addr,nc=false)=>({addr,nc});
const c=contact;
const rung=(label,groups,type,addr,preset=0)=>({label,groups,action:{type,addr,preset,reset:'M7.7'}});
export function exampleProgram(){return [
 rung('Run latch · Start / Stop / E-stop',[[c('I0.1')],[c('I0.2')],[c('I0.0'),c('M0.0')]],'COIL','M0.0'),
 rung('Capture product · hold cycle',[[c('M0.0')],[c('I0.3'),c('M0.1')],[c('T2.DN',true)]],'COIL','M0.1'),
 rung('Travel delay · sensor → jaw',[[c('M0.0')],[c('M0.1')]],'TON','T0',1130),
 rung('Seal dwell · starts at jaw closed',[[c('M0.0')],[c('M0.1')],[c('T0.DN')],[c('I0.5')]],'TON','T1',700),
 rung('Latch seal complete',[[c('M0.0')],[c('M0.1')],[c('T1.DN'),c('M0.2')]],'COIL','M0.2'),
 rung('Release cycle · jaw reopened',[[c('M0.0')],[c('M0.1')],[c('M0.2')],[c('I0.4')]],'TON','T2',20),
 rung('Conveyor permissive',[[c('M0.0')],[c('T0.DN',true)],[c('I0.4')]],'COIL','Q0.0'),
 rung('Close sealing jaw',[[c('M0.0')],[c('M0.1')],[c('T0.DN')],[c('M0.2',true)]],'COIL','Q0.1'),
 rung('Running indicator',[[c('M0.0')]],'COIL','Q0.2'),
 rung('Alarm indicator',[[c('I0.6')]],'COIL','Q0.3'),
 rung('Sealing cycles · rising edge',[[c('M0.2')]],'CTU','C0',10)
 ];}
export const bitAddress=/^(?:[IQ]0\.[0-7]|M[0-7]\.[0-7]|[TC][0-9]\.DN)$/;
export function validateProgram(program){
 const errors=[],writers=new Set();
 if(!Array.isArray(program)||program.length>80)return ['Program harus berupa 0–80 rung.'];
 program.forEach((r,i)=>{const n=`Rung ${i+1}`;
 if(!Array.isArray(r.groups)||r.groups.length>12)errors.push(`${n}: maksimum 12 slot seri.`);
 else r.groups.forEach(g=>{if(!Array.isArray(g)||!g.length||g.length>8)errors.push(`${n}: cabang harus berisi 1–8 kontak.`);else g.forEach(c=>{if(!bitAddress.test(c.addr)||typeof c.nc!=='boolean')errors.push(`${n}: alamat kontak “${c.addr}” tidak valid.`);});});
 const a=r.action||{};
 if(!['COIL','TON','CTU'].includes(a.type))errors.push(`${n}: jenis instruksi tidak dikenal.`);
 const regex=a.type==='COIL'?/^(Q0\.[0-7]|M[0-7]\.[0-7])$/:a.type==='TON'?/^T[0-9]$/:/^C[0-9]$/;
 if(!regex.test(a.addr))errors.push(`${n}: alamat ${a.type} “${a.addr}” tidak valid.`);
 if(writers.has(a.addr))errors.push(`${n}: ${a.addr} sudah ditulis rung lain.`);writers.add(a.addr);
 if(a.type!=='COIL'&&(!Number.isFinite(a.preset)||a.preset<0||a.preset>3600000||(a.type==='CTU'&&!Number.isInteger(a.preset))))errors.push(`${n}: preset harus positif; CTU harus bilangan bulat.`);
 if(a.type==='CTU'&&!bitAddress.test(a.reset))errors.push(`${n}: alamat reset counter tidak valid.`);
 });return errors;
}
export class PLC{
 constructor(){this.bits={};this.timers={};this.counters={};this.power=[];}
 read(addr){if(addr?.endsWith('.DN')){const id=addr.slice(0,-3);return !!(id[0]==='T'?this.timers[id]?.dn:this.counters[id]?.dn);}return !!this.bits[addr];}
 evaluate(program,inputs,dt){
 const errors=validateProgram(program);this.errors=errors;
 for(let i=0;i<8;i++)this.bits[`I0.${i}`]=!!inputs[`I0.${i}`];
 if(errors.length){for(let i=0;i<8;i++)this.bits[`Q0.${i}`]=false;return false;}
 // Coil writes are visible to subsequent rungs; field outputs are applied only after the scan.
 for(let i=0;i<program.length;i++){
 const r=program[i],on=r.groups.every(g=>g.some(c=>c.nc?!this.read(c.addr):this.read(c.addr)));this.power[i]=on;
 const a=r.action;
 if(a.type==='COIL')this.bits[a.addr]=on;
 if(a.type==='TON'){const t=this.timers[a.addr]??={elapsed:0,dn:false,active:false};t.elapsed=on?(t.active?Math.min(a.preset,t.elapsed+dt):0):0;t.dn=on&&t.elapsed>=a.preset;t.active=on;}
 if(a.type==='CTU'){const c=this.counters[a.addr]??={acc:0,dn:false,last:false};if(this.read(a.reset))c.acc=0;else if(on&&!c.last)c.acc++;c.last=on;c.dn=c.acc>=a.preset;}
 }return true;
 }
}
