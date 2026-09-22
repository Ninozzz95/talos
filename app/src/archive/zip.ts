import {inflateRawSync} from 'node:zlib';
import {crc32} from '../diagnostics/zip.ts';

const MAX_ENTRIES=2048;
const MAX_ENTRY_BYTES=64*1024*1024;
const MAX_TOTAL_BYTES=256*1024*1024;

function fail(code:string):never{throw Object.assign(new Error(code),{code});}
function locateEocd(buf:Buffer){for(let i=buf.length-22;i>=Math.max(0,buf.length-65_557);i--)if(buf.readUInt32LE(i)===0x06054b50)return i;return-1;}

export function readZipEntries(buf:Buffer){
  const eocd=locateEocd(buf);
  if(eocd<0)fail('ZIP_EOCD_NOT_FOUND');
  const disk=buf.readUInt16LE(eocd+4),centralDisk=buf.readUInt16LE(eocd+6);
  if(disk!==0||centralDisk!==0)fail('ZIP_MULTIDISK_UNSUPPORTED');
  const count=buf.readUInt16LE(eocd+10);
  if(count>MAX_ENTRIES)fail('ZIP_TOO_MANY_ENTRIES');
  let off=buf.readUInt32LE(eocd+16);
  const result=new Map<string,Buffer>();
  let total=0;
  for(let i=0;i<count;i++){
    if(off+46>buf.length||buf.readUInt32LE(off)!==0x02014b50)fail('ZIP_CENTRAL_INVALID');
    const flags=buf.readUInt16LE(off+8);
    const method=buf.readUInt16LE(off+10);
    const expectedCrc=buf.readUInt32LE(off+16);
    const compressed=buf.readUInt32LE(off+20),uncompressed=buf.readUInt32LE(off+24);
    const nameLen=buf.readUInt16LE(off+28),extraLen=buf.readUInt16LE(off+30),commentLen=buf.readUInt16LE(off+32);
    const local=buf.readUInt32LE(off+42);
    if(flags&1)fail('ZIP_ENCRYPTED_UNSUPPORTED');
    if(uncompressed>MAX_ENTRY_BYTES)fail('ZIP_ENTRY_TOO_LARGE');
    total+=uncompressed;if(total>MAX_TOTAL_BYTES)fail('ZIP_TOO_LARGE');
    if(off+46+nameLen+extraLen+commentLen>buf.length)fail('ZIP_CENTRAL_INVALID');
    const name=buf.subarray(off+46,off+46+nameLen).toString('utf8').replaceAll('\\','/');
    if(result.has(name))fail('ZIP_DUPLICATE_ENTRY');
    if(local+30>buf.length||buf.readUInt32LE(local)!==0x04034b50)fail('ZIP_LOCAL_INVALID');
    const localName=buf.readUInt16LE(local+26),localExtra=buf.readUInt16LE(local+28);
    const dataStart=local+30+localName+localExtra;
    if(dataStart+compressed>buf.length)fail('ZIP_DATA_INVALID');
    const raw=buf.subarray(dataStart,dataStart+compressed);
    let data:Buffer;
    try{
      if(method===0)data=Buffer.from(raw);
      else if(method===8)data=inflateRawSync(raw);
      else fail(`ZIP_METHOD_UNSUPPORTED:${method}`);
    }catch(error){if((error as any)?.code)throw error;fail('ZIP_DEFLATE_INVALID');}
    if(data.length!==uncompressed)fail('ZIP_SIZE_MISMATCH');
    if(crc32(data)!==expectedCrc)fail('ZIP_CRC_MISMATCH');
    result.set(name,data);
    off+=46+nameLen+extraLen+commentLen;
  }
  return result;
}
