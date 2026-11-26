export const machineDurationOptions=Array.from({length:48},(_,i)=>(i+1)*30);
export const isMachineDuration=(n:number)=>Number.isInteger(n)&&n>=30&&n<=1440&&n%30===0;
export function suggestMachineDuration(n:number){return Number.isFinite(n)?Math.min(1440,Math.max(30,Math.round(n/30)*30)):30;}
