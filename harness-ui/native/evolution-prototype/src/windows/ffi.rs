//! Narrow x64 SDK surface extracted from the measured containment laboratory.
//! Experimental binding; no diagnostics, WFP utilities, or account management.
#![allow(non_snake_case)]
use std::ffi::c_void;
pub type Handle=*mut c_void;
pub type Sid=*mut c_void;
#[repr(C)] pub struct SecurityAttributes {pub length:u32,pub descriptor:*mut c_void,pub inherit:i32}
#[repr(C)] pub struct SecurityCapabilities {pub sid:Sid,pub capabilities:*mut c_void,pub count:u32,pub reserved:u32}
#[repr(C)] pub struct StartupInfo {
 pub cb:u32,pub reserved:*mut u16,pub desktop:*mut u16,pub title:*mut u16,
 pub x:u32,pub y:u32,pub x_size:u32,pub y_size:u32,pub x_chars:u32,pub y_chars:u32,
 pub fill:u32,pub flags:u32,pub show:u16,pub reserved2_size:u16,pub reserved2:*mut u8,
 pub stdin:Handle,pub stdout:Handle,pub stderr:Handle,
}
#[repr(C)] pub struct StartupInfoEx {pub startup:StartupInfo,pub attributes:*mut c_void}
#[repr(C)] pub struct ProcessInformation {pub process:Handle,pub thread:Handle,pub pid:u32,pub tid:u32}
#[repr(C)] pub struct BasicLimits {pub process_time:i64,pub job_time:i64,pub flags:u32,
 pub min_working:usize,pub max_working:usize,pub active:u32,pub affinity:usize,pub priority:u32,pub scheduling:u32}
#[repr(C)] pub struct ExtendedLimits {pub basic:BasicLimits,pub io:[u64;6],pub process_memory:usize,
 pub job_memory:usize,pub peak_process:usize,pub peak_job:usize}
#[repr(C)] pub struct Overlapped {pub internal:usize,pub high:usize,pub offsets:[u32;2],pub event:Handle}
#[link(name="kernel32")] extern "system" {
 pub fn GetLastError()->u32;
 pub fn CloseHandle(handle:Handle)->i32;
 pub fn LocalFree(memory:*mut c_void)->*mut c_void;
 pub fn GetCurrentProcess()->Handle;
 pub fn GetProcessId(process:Handle)->u32;
 pub fn CreateJobObjectW(attributes:*const SecurityAttributes,name:*const u16)->Handle;
 pub fn SetInformationJobObject(job:Handle,class:i32,data:*const c_void,length:u32)->i32;
 pub fn QueryInformationJobObject(job:Handle,class:i32,data:*mut c_void,length:u32,returned:*mut u32)->i32;
 pub fn IsProcessInJob(process:Handle,job:Handle,result:*mut i32)->i32;
 pub fn InitializeProcThreadAttributeList(list:*mut c_void,count:u32,flags:u32,size:*mut usize)->i32;
 pub fn UpdateProcThreadAttribute(list:*mut c_void,flags:u32,attribute:usize,value:*mut c_void,size:usize,previous:*mut c_void,returned:*mut usize)->i32;
 pub fn DeleteProcThreadAttributeList(list:*mut c_void);
 pub fn CreateProcessW(application:*const u16,command:*mut u16,process_attributes:*const SecurityAttributes,
  thread_attributes:*const SecurityAttributes,inherit:i32,flags:u32,environment:*const c_void,
  directory:*const u16,startup:*const StartupInfo,information:*mut ProcessInformation)->i32;
 pub fn ResumeThread(thread:Handle)->u32;
 pub fn GetExitCodeProcess(process:Handle,code:*mut u32)->i32;
 pub fn OpenProcess(access:u32,inherit:i32,pid:u32)->Handle;
 pub fn TerminateProcess(process:Handle,code:u32)->i32;
 pub fn WaitForSingleObject(handle:Handle,milliseconds:u32)->u32;
 pub fn CreateNamedPipeW(name:*const u16,open:u32,mode:u32,instances:u32,output:u32,input:u32,timeout:u32,attributes:*const SecurityAttributes)->Handle;
 pub fn ConnectNamedPipe(pipe:Handle,overlapped:*mut Overlapped)->i32;
 pub fn DisconnectNamedPipe(pipe:Handle)->i32;
 pub fn GetNamedPipeClientProcessId(pipe:Handle,pid:*mut u32)->i32;
 pub fn GetNamedPipeServerProcessId(pipe:Handle,pid:*mut u32)->i32;
 pub fn CreateEventW(attributes:*const SecurityAttributes,manual:i32,initial:i32,name:*const u16)->Handle;
 pub fn ReadFile(file:Handle,buffer:*mut c_void,length:u32,read:*mut u32,overlapped:*mut Overlapped)->i32;
 pub fn WriteFile(file:Handle,buffer:*const c_void,length:u32,written:*mut u32,overlapped:*mut Overlapped)->i32;
 pub fn GetOverlappedResult(file:Handle,overlapped:*mut Overlapped,transferred:*mut u32,wait:i32)->i32;
 pub fn CancelIoEx(file:Handle,overlapped:*const Overlapped)->i32;
}
#[link(name="advapi32")] extern "system" {
 pub fn OpenProcessToken(process:Handle,access:u32,token:*mut Handle)->i32;
 pub fn GetTokenInformation(token:Handle,class:i32,data:*mut c_void,length:u32,returned:*mut u32)->i32;
 pub fn EqualSid(a:Sid,b:Sid)->i32;
 pub fn FreeSid(sid:Sid)->*mut c_void;
 pub fn ConvertSidToStringSidW(sid:Sid,string:*mut *mut u16)->i32;
 pub fn ConvertStringSecurityDescriptorToSecurityDescriptorW(text:*const u16,revision:u32,result:*mut *mut c_void,size:*mut u32)->i32;
 pub fn SetFileSecurityW(path:*const u16,information:u32,descriptor:*const c_void)->i32;
}
#[link(name="userenv")] extern "system" {
 pub fn CreateAppContainerProfile(name:*const u16,display:*const u16,description:*const u16,capabilities:*const c_void,count:u32,sid:*mut Sid)->i32;
 pub fn DeleteAppContainerProfile(name:*const u16)->i32;
 pub fn DeriveAppContainerSidFromAppContainerName(name:*const u16,sid:*mut Sid)->i32;
}
#[cfg(test)] mod tests {
 use super::*;use std::mem::size_of;
 #[test] fn x64_sdk_layouts(){assert_eq!(size_of::<SecurityAttributes>(),24);assert_eq!(size_of::<SecurityCapabilities>(),24);
 assert_eq!(size_of::<StartupInfo>(),104);assert_eq!(size_of::<StartupInfoEx>(),112);assert_eq!(size_of::<ProcessInformation>(),24);
 assert_eq!(size_of::<BasicLimits>(),64);assert_eq!(size_of::<ExtendedLimits>(),144);assert_eq!(size_of::<Overlapped>(),32);}
}
