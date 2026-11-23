/*
 * 0.6.6 (owner 14/10/2026, the stress test stopped on the ChatGPT plan's limit: «è in grigio, non è molto evidente»): when a
 * limit comes back is said as a clock time, the way Codex says it (codex-rs/protocol/src/error.rs `format_retry_timestamp`:
 * the time alone when it is today, the date too when it is not) and the desktop's banner («Continuing automatically at HH:MM»).
 * 24-hour, local time: «15:05», «Oct 16 09:00».
 */
const two=(n:number)=>String(n).padStart(2,'0');
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;

export function clockTime(atMs:number,nowMs:number=Date.now()):string{
  const at=new Date(atMs),now=new Date(nowMs);
  const time=`${two(at.getHours())}:${two(at.getMinutes())}`;
  const sameDay=at.getFullYear()===now.getFullYear()&&at.getMonth()===now.getMonth()&&at.getDate()===now.getDate();
  return sameDay?time:`${MONTHS[at.getMonth()]} ${at.getDate()} ${time}`;
}
