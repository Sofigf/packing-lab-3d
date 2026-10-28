// Read-only bridge. World distances remain millimetres; rendering never advances physics.
export const WORLD={beltY:720,productHeight:36,productWidth:100,centerX:550,jawOpenY:900,jawClosedY:774};
export function getMachineViewState(sim){
 const m=sim.machine;
 return {time:sim.time,travel:m.travel,speed:m.speed,sensorX:sim.params.sensorPosition-WORLD.centerX,sensor:!!m.sensor,
 jawY:WORLD.jawOpenY-(WORLD.jawOpenY-WORLD.jawClosedY)*m.jaw,jawRatio:m.jaw,
 solenoid:!!m.outputs.solenoid,running:!!m.outputs.running,alarmLamp:!!m.outputs.alarmLamp,
 tripped:!!sim.control.trip,alarms:[...m.alarms],state:m.state,
 products:m.products.map(p=>({id:p.id,x:p.x-WORLD.centerX,y:WORLD.beltY+WORLD.productHeight/2,z:0,sealed:p.sealed,good:p.good,reason:p.reason})),
 good:m.good,reject:m.reject,
 connections:Object.fromEntries(sim.wires.map(w=>[w.from.startsWith('Q')?w.to:w.from,w.from.startsWith('Q')?w.from:w.to]))};
}
