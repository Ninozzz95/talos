/* The environment as the person started TALOS, taken before anything can add to it: a relaunch in another folder must not carry what the plugins or hooks of this one set. */
export const LAUNCH_ENV:Readonly<Record<string,string|undefined>>={...process.env};
