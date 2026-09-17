/** One route vocabulary shared by the DOM adapter and application navigation. */
export const SCREEN_BY_VIEW = Object.freeze({
  home: 'schermoHome', chat: 'schermoChat', vuota: 'schermoVuota', terminal: 'schermoTerminale',
  browser: 'schermoBrowser', diff: 'schermoReview', capability: 'schermoCapability', dashboard: 'schermoBoard',
  memoria: 'schermoMemoria', attivita: 'schermoAttivita', note: 'schermoNote', progetti: 'schermoProgetti',
  settings: 'schermoImpostazioni', doctor: 'schermoDoctor', libreria: 'schermoLibreria', ricerca: 'schermoRicerca',
  officina: 'schermoOfficina', automations: 'schermoAutomazioni',
});
export type View = keyof typeof SCREEN_BY_VIEW;
export const VIEW_BY_DESTINATION = Object.freeze({
  home: 'home', chat: 'chat', vuota: 'vuota', terminale: 'terminal', browser: 'browser', review: 'diff',
  capability: 'capability', board: 'dashboard', memoria: 'memoria', attivita: 'attivita', note: 'note',
  progetti: 'progetti', impostazioni: 'settings', doctor: 'doctor', libreria: 'libreria', ricerca: 'ricerca',
  officina: 'officina', automazioni: 'automations',
} satisfies Record<string, View>);
export const DESTINATION_BY_VIEW: Readonly<Record<View, string>> = Object.freeze(
  Object.fromEntries(Object.entries(VIEW_BY_DESTINATION).map(([destination, view]) => [view, destination])) as Record<View, string>,
);
export function isView(value: unknown): value is View {
  return typeof value === 'string' && Object.hasOwn(SCREEN_BY_VIEW, value);
}
export function routeForDestination(value: string): View | null {
  return Object.hasOwn(VIEW_BY_DESTINATION, value) ? VIEW_BY_DESTINATION[value as keyof typeof VIEW_BY_DESTINATION] : null;
}
