// Source: https://accessibility.twse.com.tw/zh/trading/holiday.html (115/2026, checked 2026-10-10).
// Includes settlement-only days. Unknown years fail closed until an official calendar is configured.
const CLOSED_2026=['01-01','02-12','02-13','02-16','02-17','02-18','02-19','02-20','02-27','04-03','04-06','05-01','06-19','09-25','09-28','10-09','10-26','12-25'];
export function marketDay(date,env={}){
 const year=date.slice(0,4);let calendars={};
 try{calendars=JSON.parse(env.TWSE_CALENDARS_JSON||'{}');}catch{return {open:false,reason:'休市日設定格式錯誤'};}
 const extra=String(env.TWSE_EXTRA_CLOSED_DATES||'').split(',').map(s=>s.trim());
 if(extra.includes(date))return {open:false,reason:'臨時休市'};
 const calendar=calendars[year]||(year==='2026'?{closed:CLOSED_2026.map(d=>'2026-'+d),open:[]}:null);
 if(!calendar||!Array.isArray(calendar.closed))return {open:false,reason:'尚未載入該年度證交所休市日'};
 if(calendar.closed.includes(date))return {open:false,reason:'證交所休市日'};
 if(calendar.open?.includes(date))return {open:true,reason:'證交所指定交易日'};
 return [0,6].includes(new Date(date+'T12:00:00+08:00').getUTCDay())?{open:false,reason:'週末休市'}:{open:true,reason:'交易日'};
}
